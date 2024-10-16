import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import pcap from 'pcap';
import readline from 'readline';
import { TunnelTool, tunnelTools } from './tools';
import { performance } from 'perf_hooks';

const SERVER_URL = 'http://localhost:3000';
// const FILE_SIZES = [1024, 10240, 102400, 1048576]; // All sizes in bytes
const FILE_SIZES_MB = [1]; // All sizes in megabytes (MB)
const NUM_MEASUREMENTS = 1;

const ENABLE_LOGGING = true;
const ENABLE_PCAP = false; // Set this to true to enable PCAP capturing

// Note: UNITS
// All time measurements are in milliseconds (ms)
// All speeds are in bytes per second
// All file sizes in megabytes
interface Timing {
    duration: number; // ms
  }
  
  interface DiagnosticResult {
    tool: string;
    rawOutput: string;
    parsedOutput: any; // Type depends on the specific tool
    timing: Timing;
  }

  interface CurlResult {
    statusCode: number;
    timeSplit: TimeSplit;
    ttfb: number; // ms
    latency: number; // ms
    sizeDownload: number; // bytes
    speedDownload: number; // bytes per second
    speedUpload: number; // bytes per second
  }
  
  interface TimeSplit {
    dnsLookup: number; // ms
    tcpConnection: number; // ms
    tlsHandshake: number; // ms
    firstByte: number; // ms
    total: number; // ms
  }
  
  interface Measurement {
    measurementNumber: number;
    fileTransfers: { [key: string]: CurlResult };
    webTests: WebTestResult[];
  }
  
  interface RunResult {
    tool: string;
    diagnostics: DiagnosticResult[];
    measurements: Measurement[]; // Array of Measurement objects
    durations: {
      total: Timing;
      toolSetup: Timing;
      diagnostics: Timing;
      measurements: {
        total: Timing;
        average: Timing;
      };
    };
    pcapFilePath?: string;
  }
  
  interface TcpTracerouteResult {
    hops: TcpTracerouteHop[];
    destination: string;
    port: number;
  }
  
  interface TcpTracerouteHop {
    hopNumber: number;
    ip: string;
    rtt1: number;
    rtt2: number;
    rtt3: number;
  }
  
  interface DigResult {
    answers: DigAnswer[];
    queryTime: number;
    server: string;
    when: string;
    rcvdSize: number;
  }
  
  interface DigAnswer {
    name: string;
    type: string;
    ttl: number;
    data: string;
  }

class Stopwatch {
    private startTime: number = 0;
    private endTime: number = 0;
  
    start(): void {
      this.startTime = performance.now();
    }
  
    stop(): void {
      this.endTime = performance.now();
    }
  
    getTiming(): Timing {
      return {
        duration: this.endTime - this.startTime
      };
    }
  }

  async function runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        if (ENABLE_LOGGING) console.log(`Executing command: ${command} ${args.join(' ')}`); // Log full command
        const process = spawn(command, args);
        let output = '';
        let errorOutput = '';

        process.stdout?.on('data', (data) => {
            output += data.toString();
        });

        process.stderr?.on('data', (data) => {
            errorOutput += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                if (ENABLE_LOGGING) console.log(`Command ${command} executed successfully`);
                resolve(output);
            } else {
                console.error(`Error executing ${command}: ${errorOutput}`); // Log error output
                reject(new Error(`Command failed with code ${code}`));
            }
        });
    });
}
abstract class CliTool<T> {
  abstract parse(output: string): T;

  async run(command: string, args: string[]): Promise<T> {
    const output = await runCommand(command, args);
    return this.parse(output);
  }
}

class TcpTraceroute extends CliTool<TcpTracerouteResult> {
  parse(output: string): TcpTracerouteResult {
    const lines = output.split('\n');
    const hops: TcpTracerouteHop[] = [];
    let destination = '';
    let port = 0;

    lines.forEach((line, index) => {
      if (index === 1) {
        const match = line.match(/Tracing the path to (.+) \(([\d.]+)\) on TCP port (\d+)/);
        if (match) {
          destination = match[2];
          port = parseInt(match[3]);
        }
      } else if (line.match(/^\s*\d+/)) {
        const parts = line.trim().split(/\s+/);
        hops.push({
          hopNumber: parseInt(parts[0]),
          ip: parts[1],
          rtt1: parseFloat(parts[2]),
          rtt2: parseFloat(parts[3]),
          rtt3: parseFloat(parts[4])
        });
      }
    });

    return { hops, destination, port };
  }
}

class Dig extends CliTool<DigResult> {
  parse(output: string): DigResult {
    const lines = output.split('\n');
    const answers: DigAnswer[] = [];
    let queryTime = 0;
    let server = '';
    let when = '';
    let rcvdSize = 0;

    lines.forEach(line => {
      if (line.includes('ANSWER SECTION')) {
        const answerLines = lines.slice(lines.indexOf(line) + 1);
        for (const answerLine of answerLines) {
          if (answerLine.trim() === '') break;
          const parts = answerLine.split(/\s+/);
          answers.push({
            name: parts[0],
            type: parts[3],
            ttl: parseInt(parts[1]),
            data: parts[4]
          });
        }
      } else if (line.includes('Query time:')) {
        queryTime = parseInt(line.split(':')[1].trim().split(' ')[0]);
      } else if (line.includes('SERVER:')) {
        server = line.split(':')[1].trim();
      } else if (line.includes('WHEN:')) {
        when = line.split(':')[1].trim();
      } else if (line.includes('MSG SIZE')) {
        rcvdSize = parseInt(line.split(':')[1].trim().split(' ')[0]);
      }
    });

    return { answers, queryTime, server, when, rcvdSize };
  }
}


class Curl extends CliTool<CurlResult> {
    parse(output: string): CurlResult {
      const lines = output.split('\n');
      const result: CurlResult = {
        statusCode: 0,
        timeSplit: {
          dnsLookup: 0,
          tcpConnection: 0,
          tlsHandshake: 0,
          firstByte: 0,
          total: 0
        },
        ttfb: 0,
        latency: 0,
        sizeDownload: 0,
        speedDownload: 0,
        speedUpload: 0
      };
  
      lines.forEach(line => {
        const [key, value] = line.split(': ');
        const timeValue = parseFloat(value);
        switch (key.trim()) {
          case 'DNS Lookup':
            result.timeSplit.dnsLookup = timeValue;
            break;
          case 'TCP Connection':
            result.timeSplit.tcpConnection = timeValue;
            break;
          case 'TLS Handshake':
            result.timeSplit.tlsHandshake = timeValue;
            break;
          case 'Start Transfer':
            result.timeSplit.firstByte = timeValue;
            break;
          case 'Total Time':
            result.timeSplit.total = timeValue;
            break;
          case 'Download Speed':
            result.speedDownload = parseFloat(value);
            break;
          case 'Upload Speed':
            result.speedUpload = parseFloat(value);
            break;
          case 'Size of Download':
            result.sizeDownload = parseInt(value, 10);
            break;
          case 'HTTP Code':
            result.statusCode = parseInt(value, 10);
            break;
        }
      });
  
      result.ttfb = result.timeSplit.dnsLookup + result.timeSplit.tcpConnection + result.timeSplit.tlsHandshake + result.timeSplit.firstByte;
      result.latency = result.timeSplit.tcpConnection;
  
      return result;
    }
  }

async function runDiagnosticTool(tool: string, args: string[]): Promise<DiagnosticResult> {
  const stopwatch = new Stopwatch();
  stopwatch.start();
  const rawOutput = await runCommand(tool, args);
  stopwatch.stop();

  let parsedOutput;
  switch (tool) {
    case 'tcptraceroute':
      parsedOutput = new TcpTraceroute().parse(rawOutput);
      break;
    case 'dig':
      parsedOutput = new Dig().parse(rawOutput);
      break;
    case 'ping':
      parsedOutput = rawOutput; // For simplicity, we're not parsing ping output
      break;
    // Add more cases for other tools as needed
  }

  return {
    tool,
    rawOutput,
    parsedOutput,
    timing: stopwatch.getTiming()
  };
}


async function performWebTest(url: string): Promise<CurlResult> {
    const stopwatch = new Stopwatch();
    stopwatch.start();
    const curlOutput = await runCommand('curl', [
      '-w', '\
      DNS Lookup: %{time_namelookup}s\n\
      TCP Connection: %{time_connect}s\n\
      TLS Handshake: %{time_appconnect}s\n\
      Start Transfer: %{time_starttransfer}s\n\
      Total Time: %{time_total}s\n\
      Download Speed: %{speed_download} bytes/sec\n\
      Upload Speed: %{speed_upload} bytes/sec\n\
      HTTP Code: %{http_code}\n\
      Size of Download: %{size_download} bytes\n',
      '-o', '/dev/null',
      '-s',
      url
    ]);
    stopwatch.stop();
  
    return new Curl().parse(curlOutput);
  }

  async function performFileTransfer(url: string, sizeMB: number): Promise<CurlResult> {
    const sizeBytes = Math.round(sizeMB * 1024 * 1024); // Convert MB to bytes
    const stopwatch = new Stopwatch();
    stopwatch.start();
    
    if (ENABLE_LOGGING) {
        console.log(`Performing file transfer from URL: ${url}`); // Log the URL
    }

    const curlOutput = await runCommand('curl', [
      '-w', '\
      DNS Lookup: %{time_namelookup}s\n\
      TCP Connection: %{time_connect}s\n\
      TLS Handshake: %{time_appconnect}s\n\
      Start Transfer: %{time_starttransfer}s\n\
      Total Time: %{time_total}s\n\
      Download Speed: %{speed_download} bytes/sec\n\
      Upload Speed: %{speed_upload} bytes/sec\n\
      HTTP Code: %{http_code}\n\
      Size of Download: %{size_download} bytes\n',
      '-o', '/dev/null',
      '-s',
      url
    ]);
    stopwatch.stop();
  
    const parsedOutput = new Curl().parse(curlOutput);
    const actualSize = parsedOutput.sizeDownload;
  
    if (actualSize !== sizeBytes) {
      console.warn(`Warning: Expected size ${sizeBytes} bytes, but got ${actualSize} bytes.`);
    }
  
    return parsedOutput;
}

  function parseCurlOutput(output: string): { timeSplit: TimeSplit, sizeDownload: string, speedDownload: string } {
    const lines = output.split('\n');
    const timeSplit: TimeSplit = {
      dnsLookup: 0,
      tcpConnection: 0,
      tlsHandshake: 0,
      firstByte: 0,
      download: 0,
      total: 0
    };
    let sizeDownload = '0';
    let speedDownload = '0';
  
    lines.forEach(line => {
      const [key, value] = line.split(': ');
      const timeValue = parseFloat(value);
      switch (key.trim()) {
        case 'DNS Lookup':
          timeSplit.dnsLookup = timeValue;
          break;
        case 'TCP Connection':
          timeSplit.tcpConnection = timeValue;
          break;
        case 'TLS Handshake':
          timeSplit.tlsHandshake = timeValue;
          break;
        case 'Start Transfer':
          timeSplit.firstByte = timeValue;
          break;
        case 'Total Time':
          timeSplit.total = timeValue;
          break;
        case 'Download Speed':
          speedDownload = value.trim();
          break;
        case 'Size of Download':
          sizeDownload = value.trim();
          break;
      }
    });
  
    return { timeSplit, sizeDownload, speedDownload };
  }

  async function startPcapCapture(toolName: string): Promise<[any, string]> {
    if (!ENABLE_PCAP) {
    console.log('PCAP capturing is disabled.');
    return [null, ''];
    }
    if (ENABLE_LOGGING) console.log('Starting PCAP capture');
    const date = new Date().toISOString().split('T')[0];
    const filename = `client_capture_${toolName}_${date}.pcap`;
    const pcapSession = pcap.createSession('eth0', '');
    const writeStream = fs.createWriteStream(filename);
    pcapSession.on('packet', (rawPacket: any) => {
    writeStream.write(rawPacket.buf);
    });
    if (ENABLE_LOGGING) console.log(`PCAP capture started, saving to ${filename}`);
    return [pcapSession, filename];
}

async function performMeasurements(tunnelTool: TunnelTool, enablePcap: boolean, numMeasurements: number): Promise<RunResult> {
    const totalStopwatch = new Stopwatch();
    const setupStopwatch = new Stopwatch();
    const diagnosticsStopwatch = new Stopwatch();
  
    totalStopwatch.start();
    setupStopwatch.start();
  
    if (ENABLE_LOGGING) console.log(`Starting tunnel with ${tunnelTool.name}`);
    const tunnelUrl = await tunnelTool.start({ port: 3000 });
    console.log(`Tunnel started: ${tunnelUrl}`);
  
    let pcapSession = null;
    let pcapFilePath = null;
    if (enablePcap) {
      [pcapSession, pcapFilePath] = await startPcapCapture(tunnelTool.name);
    }
  
    setupStopwatch.stop();
  
    const url = new URL(tunnelUrl);
    const domain = url.hostname;
  
    diagnosticsStopwatch.start();
    const diagnostics: DiagnosticResult[] = [];
    diagnostics.push(await runDiagnosticTool('ping', [domain, '-c', '10']));
    diagnostics.push(await runDiagnosticTool('dig', [domain]));
    diagnostics.push(await runDiagnosticTool('tcptraceroute', [domain]));
    
    diagnosticsStopwatch.stop();
  
    const measurements: Measurement[] = [];
    let totalMeasurementDuration = 0;
  
    for (let i = 0; i < numMeasurements; i++) {
      const measurementsStopwatch = new Stopwatch();
      measurementsStopwatch.start();
  
      const fileTransfers: { [key: string]: CurlResult } = {};
      const webTests: WebTestResult[] = [];
  
      // Perform file transfers
      for (const sizeMB of FILE_SIZES_MB) {
        if (ENABLE_LOGGING) console.log(`Downloading file of size ${sizeMB} MB`);
        const result = await performFileTransfer(`${tunnelUrl}/download/${sizeMB * 1024 * 1024}`, sizeMB);
        const key = `${sizeMB}MB_buffer`;
        fileTransfers[key] = result; // Store the result directly
      }
  
      // Perform web test
      // const webTestResult = await performWebTest(`${tunnelUrl}/health`);
      // webTests.push(webTestResult);
  
      measurementsStopwatch.stop();
      const measurementDuration = measurementsStopwatch.getTiming().duration;
      totalMeasurementDuration += measurementDuration;
  
      measurements.push({
        measurementNumber: i + 1, // Add measurement number
        fileTransfers,
        webTests
      });
    }
  
    totalStopwatch.stop();
  
    if (pcapSession) {
      pcapSession.close();
    }
  
    await tunnelTool.stop();
  
    const totalDuration = totalStopwatch.getTiming().duration;
    const setupDuration = setupStopwatch.getTiming().duration;
    const diagnosticsDuration = diagnosticsStopwatch.getTiming().duration;
    const averageMeasurementDuration = totalMeasurementDuration / numMeasurements; // Calculate average duration
  
    return {
      tool: tunnelTool.name,
      diagnostics,
      measurements, // Now an array of Measurement objects
      durations: {
        total: { duration: totalDuration },
        toolSetup: { duration: setupDuration },
        diagnostics: { duration: diagnosticsDuration },
        measurements: {
          total: { duration: totalMeasurementDuration },
          average: { duration: averageMeasurementDuration }
        }
      },
      pcapFilePath
    };
  }

async function main() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  
    while (true) {
      console.log('Available tunneling tools:');
      tunnelTools.forEach((tool, index) => {
        console.log(`${index + 1}. ${tool.name}`);
      });
  
      const choice = await new Promise<string>((resolve) => rl.question('Choose a tunneling tool (number): ', resolve));
      const selectedTool = tunnelTools[parseInt(choice) - 1];
  
      if (!selectedTool) {
        console.log('Invalid choice. Please try again.');
        continue;
      }

    //   const numMeasurements = await new Promise<number>((resolve) => rl.question('Enter the number of measurements: ', (answer) => resolve(parseInt(answer))));
      const numMeasurements = NUM_MEASUREMENTS;
  
        
    try {
            const result = await performMeasurements(selectedTool, ENABLE_PCAP, numMeasurements);
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
            const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        
            const filename = `${date}_${time}.json`;
            const results_filepath = `results`;
            const tool_results = `${results_filepath}/${selectedTool.name}`;
        
            await fs.mkdir(tool_results, { recursive: true }); // Ensure the correct path is created
        
            await fs.writeFile(`${tool_results}/${filename}`, JSON.stringify(result, null, 2));
            if (ENABLE_LOGGING) console.log(`Results saved to ${tool_results}/${filename}`);
        } catch (error) {
            console.error('An error occurred:', error);
        }
  
  
      const continueChoice = await new Promise<string>((resolve) => rl.question('Do you want to continue with another tool? (y/n): ', resolve));
      if (continueChoice.toLowerCase() !== 'y') {
        break;
      }
    }
  
    rl.close();
    if (ENABLE_LOGGING) console.log('Main function completed');
 }
  
main();