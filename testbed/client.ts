import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import pcap from 'pcap';
import readline from 'readline';
import { TunnelTool, tunnelTools } from './tools';
import { performance } from 'perf_hooks';

// const SERVER_HOST = 'localhost';
const SERVER_HOST = 'localhost';
const SERVER_PORT = 3000;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
// const FILE_SIZES = [1024, 10240, 102400, 1048576]; // All sizes in bytes
const FILE_SIZES_MB = [1]; // All sizes in megabytes (MB)
const NUM_MEASUREMENTS = 5;

const ENABLE_LOGGING = false;
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
    error?: string;
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
    measurements: Measurement[];
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
    allDownloadsComplete: boolean;
    errors: { stage: string; error: string }[];
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
      console.log(`Performing file transfer from URL: ${url}`);
    }
  
    let curlOutput = '';
    let error: Error | null = null;
  
    try {
      curlOutput = await runCommand('curl', [
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
        '-C', '-', // Add resume capability
        '-o', '/dev/null',
        '-s',
        url
      ]);
    } catch (err) {
      error = err as Error;
      if (ENABLE_LOGGING) {
        console.error(`Error during file transfer: ${error.message}`);
      }
    }
  
    stopwatch.stop();
  
    const parsedOutput = new Curl().parse(curlOutput);
    const actualSize = parsedOutput.sizeDownload;
  
    let downloadStatus: 'complete' | 'partial' | 'failed';
    if (error) {
      downloadStatus = 'failed';
    } else if (actualSize < sizeBytes) {
      downloadStatus = 'partial';
    } else {
      downloadStatus = 'complete';
    }
  
    return {
      ...parsedOutput,
      bytesDownloaded: actualSize,
      downloadStatus,
      error: error ? error.message : undefined
    };
  }


  async function startPcapCapture(toolName: string): Promise<[any, string]> {
    if (!ENABLE_PCAP) {
    console.log('PCAP capturing is disabled.');
    return [null, ''];
    }
    if (ENABLE_LOGGING) console.log('Starting PCAP capture');
    const date = new Date().toISOString().split('T')[0];
    const filename = `client_capture_${toolName}_${date}.pcap`;
    const pcapSession = pcap.createSession('wlp2s0', '');
    const writeStream = fs.createWriteStream(filename);
    pcapSession.on('packet', (rawPacket: any) => {
    writeStream.write(rawPacket.buf);
    });
    if (ENABLE_LOGGING) console.log(`PCAP capture started, saving to ${filename}`);
    return [pcapSession, filename];
}

async function performMeasurementsRun(tunnelTool: TunnelTool, enablePcap: boolean, numMeasurements: number): Promise<RunResult> {
  const totalStopwatch = new Stopwatch();
  const setupStopwatch = new Stopwatch();
  const diagnosticsStopwatch = new Stopwatch();

  totalStopwatch.start();
  setupStopwatch.start();

  let tunnelUrl = ''; 
  let allDownloadsComplete = true;
  let errors: { stage: string; error: string }[] = [];

  // Tunnel Setup Stage
  if (ENABLE_LOGGING) console.log(`Requesting server to start tunnel with ${tunnelTool.name}`);
  try {
    const response = await axios.post(`${SERVER_URL}/start-tunnel`, { toolName: tunnelTool.name });
    tunnelUrl = response.data.url;
    if (ENABLE_LOGGING) console.log(`Tunnel received: ${tunnelUrl}`);
  } catch (error) {
    errors.push({ stage: 'Tunnel Setup', error: `Failed to start tunnel: ${(error as Error).message}` });
  }
  
  if (!tunnelUrl) {
    errors.push({ stage: 'Tunnel Setup', error: 'Tunnel URL is empty or invalid' });
  }

  // Post-setup Commands Stage
  if (tunnelTool.postSetupCommands) {
    for (const command of tunnelTool.postSetupCommands) {
      try {
        await runCommand(command[0], command.slice(1));
      } catch (error) {
        errors.push({ stage: 'Post-setup Commands', error: `Failed to run command ${command[0]}: ${(error as Error).message}` });
      }
    }
  }

  // PCAP Capture Setup Stage
  let pcapSession = null;
  let pcapFilePath = null;
  if (enablePcap) {
    try {
      [pcapSession, pcapFilePath] = await startPcapCapture(tunnelTool.name);
    } catch (error) {
      errors.push({ stage: 'PCAP Setup', error: `Failed to start PCAP capture: ${(error as Error).message}` });
    }
  }
  
  setupStopwatch.stop();
  
  // Diagnostics Stage
  diagnosticsStopwatch.start();
  const diagnostics: DiagnosticResult[] = [];
  if (tunnelUrl) {
    const url = new URL(tunnelUrl); 
    const domain = url.hostname;
    try {
      diagnostics.push(await runDiagnosticTool('dig', [domain]));
    } catch (error) {
      errors.push({ stage: 'Diagnostics', error: `Failed to run dig: ${(error as Error).message}` });
      diagnostics.push({
        tool: 'dig',
        rawOutput: '',
        parsedOutput: null,
        timing: { duration: 0 },
        error: (error as Error).message
      });
    }
  } else {
    errors.push({ stage: 'Diagnostics', error: 'Skipped diagnostics due to missing tunnel URL' });
  }
  diagnosticsStopwatch.stop();
  
  
  // Measurements Stage
  const measurements: Measurement[] = [];
  let totalMeasurementDuration = 0;

  // Create a progress bar for the measurements
  const measurementsProgressBar = new cliProgress.SingleBar(
    {
      format: `Measurements for ${tunnelTool.name} | {bar} | {percentage}% | {value}/{total} Runs`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    },
    cliProgress.Presets.shades_classic
  );

  measurementsProgressBar.start(numMeasurements, 0);
  
  for (let i = 0; i < numMeasurements; i++) {
    const measurementsStopwatch = new Stopwatch();
    measurementsStopwatch.start();
  
    const fileTransfers: { [key: string]: CurlResult } = {};
    const webTests: WebTestResult[] = [];
  
    if (tunnelUrl) {
      // Perform file transfers
      for (const sizeMB of FILE_SIZES_MB) {
        if (ENABLE_LOGGING) console.log(`Downloading file of size ${sizeMB} MB`);
        try {
          const result = await performFileTransfer(`${tunnelUrl}/download/${sizeMB * 1024 * 1024}`, sizeMB);
          const key = `${sizeMB}MB_buffer`;
          fileTransfers[key] = result;

          if (result.downloadStatus !== 'complete') {
            allDownloadsComplete = false;
          }
        } catch (error) {
          errors.push({ stage: 'File Transfer', error: `Failed to download ${sizeMB}MB file: ${(error as Error).message}` });
          fileTransfers[`${sizeMB}MB_buffer`] = {
            statusCode: 0,
            timeSplit: { dnsLookup: 0, tcpConnection: 0, tlsHandshake: 0, firstByte: 0, total: 0 },
            ttfb: 0,
            latency: 0,
            sizeDownload: 0,
            speedDownload: 0,
            speedUpload: 0,
            error: (error as Error).message,
            downloadStatus: 'failed'
          };
          allDownloadsComplete = false;
        }
      }

      // Perform web test (if implemented)
      // try {
      //   const webTestResult = await performWebTest(`${tunnelUrl}/health`);
      //   webTests.push(webTestResult);
      // } catch (error) {
      //   errors.push({ stage: 'Web Test', error: `Failed to perform web test: ${(error as Error).message}` });
      // }
    } else {
      errors.push({ stage: 'Measurements', error: 'Skipped file transfers and web tests due to missing tunnel URL' });
    }
  
    measurementsStopwatch.stop();
    const measurementDuration = measurementsStopwatch.getTiming().duration;
    totalMeasurementDuration += measurementDuration;

    measurements.push({
      measurementNumber: i + 1,
      fileTransfers,
      webTests
    });
    measurementsProgressBar.update(i + 1);
  }

  measurementsProgressBar.stop();

  totalStopwatch.stop();
  
  // Cleanup Stage
  if (pcapSession) {
    try {
      pcapSession.close();
    } catch (error) {
      errors.push({ stage: 'PCAP Cleanup', error: `Failed to close PCAP session: ${(error as Error).message}` });
    }
  }
  
  // Stop Tunnel Stage
  try {
    await axios.post(`${SERVER_URL}/stop-tunnel`, { toolName: tunnelTool.name });
    if (ENABLE_LOGGING) console.log('Tunnel successfully stopped, run concluded.');
  } catch (error) {
    errors.push({ stage: 'Tunnel Cleanup', error: `Failed to stop tunnel: ${(error as Error).message}` });
  }
  
  const totalDuration = totalStopwatch.getTiming().duration;
  const setupDuration = setupStopwatch.getTiming().duration;
  const diagnosticsDuration = diagnosticsStopwatch.getTiming().duration;
  const averageMeasurementDuration = measurements.length > 0 ? totalMeasurementDuration / measurements.length : 0;
  
  return {
    tool: tunnelTool.name,
    diagnostics,
    measurements,
    durations: {
      total: { duration: totalDuration },
      toolSetup: { duration: setupDuration },
      diagnostics: { duration: diagnosticsDuration },
      measurements: {
        total: { duration: totalMeasurementDuration },
        average: { duration: averageMeasurementDuration }
      }
    },
    pcapFilePath,
    allDownloadsComplete,
    errors
  };
}

const cliProgress = require('cli-progress');

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const modeChoice = await new Promise<string>((resolve) =>
    rl.question('Choose mode: auto (a) or tool-wise (t): ', resolve)
  );
  const isAutoMode = modeChoice.toLowerCase() === 'a';

  const now = new Date();
  const timestamp = `${now.getFullYear().toString().slice(-2)}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(
    now.getHours()
  ).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(
    now.getSeconds()
  ).padStart(2,  
 '0')}`;

  if (isAutoMode) {
    const resultsDir = `results/all-${timestamp}`;
    await fs.mkdir(resultsDir, { recursive: true });

    const executionTimes = [];

    const progressBar = new cliProgress.SingleBar(
      {
        format:
          'Progress | {bar} | {percentage}% | {value}/{total} Tools | Fastest: {fastest}s | Slowest: {slowest}s',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    progressBar.start(tunnelTools.length, 0, {
      fastest: 0,
      slowest: 0,
    });

    let fastestTime = Number.MAX_SAFE_INTEGER;
    let slowestTime = 0;

    for (let i = 0; i < tunnelTools.length; i++) {
      const tool = tunnelTools[i];
      const startTime = new Date().getTime();

      const toolProgressBar = new cliProgress.SingleBar(
        {
          format: `${tool.name} | {bar} | {percentage}% | ETA: {eta}s | {stage}`,
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
        },
        cliProgress.Presets.shades_classic
      );

      toolProgressBar.start(100, 0, { stage: 'Starting' });

      try {
        const result = await performMeasurementsRun(
          tool,
          ENABLE_PCAP,
          NUM_MEASUREMENTS
        );

        toolProgressBar.update(20, { stage: 'Diagnostics' });
        toolProgressBar.update(60, { stage: 'Measurements' });
        toolProgressBar.update(80, { stage: 'Cleanup' });
        toolProgressBar.update(100, { stage: 'Completed' });

        await saveResults(resultsDir, tool.name, result);
      } catch (error) {
        toolProgressBar.stop();
        console.error(`An error occurred with tool ${tool.name}:`, error);
      }

      toolProgressBar.stop();

      const endTime = new Date().getTime();
      const executionTime = (endTime - startTime) / 1000;

      executionTimes.push({ tool: tool.name, time: executionTime });

      if (executionTime < fastestTime) fastestTime = executionTime;
      if (executionTime > slowestTime) slowestTime = executionTime;

      progressBar.update(i + 1, {
        fastest: fastestTime.toFixed(2),
        slowest: slowestTime.toFixed(2),
      });
    }

    progressBar.stop();

    const fastestTool = executionTimes.reduce((prev, curr) =>
      prev.time < curr.time ? prev : curr
    );
    const slowestTool = executionTimes.reduce((prev, curr) =>
      prev.time > curr.time ? prev : curr
    );

    console.log(
      `\nFastest tool: ${fastestTool.tool} (${fastestTool.time.toFixed(
        2
      )} seconds)`
    );
    console.log(
      `Slowest tool: ${slowestTool.tool} (${slowestTool.time.toFixed(
        2
      )} seconds)`
    );
  } else {
    while (true) {
      console.log('Available tunneling tools:');
      tunnelTools.forEach((tool, index) => {
        console.log(`${index + 1}. ${tool.name}`);
      });

      const choice = await new Promise<string>((resolve) =>
        rl.question('Choose a tunneling tool (number): ', resolve)
      );
      const selectedTool = tunnelTools[parseInt(choice) - 1];

      if (!selectedTool) {
        console.log('Invalid choice. Please try again.');
        continue;
      }

      const toolProgressBar = new cliProgress.SingleBar(
        {
          format: `${selectedTool.name} | {bar} | {percentage}% | ETA: {eta}s | {stage}`,
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
        },
        cliProgress.Presets.shades_classic
      );

      toolProgressBar.start(100, 0, { stage: 'Starting' });

      try {
        const toolResultsDir = `results/${selectedTool.name}`;
        await fs.mkdir(toolResultsDir, { recursive: true });
        const result = await performMeasurementsRun(
          selectedTool,
          ENABLE_PCAP,
          NUM_MEASUREMENTS
        );

        toolProgressBar.update(20, { stage: 'Diagnostics' });
        toolProgressBar.update(60, { stage: 'Measurements' });
        toolProgressBar.update(80, { stage: 'Cleanup' });
        toolProgressBar.update(100, { stage: 'Completed' });

        await saveResults(toolResultsDir, timestamp, result);
      } catch (error) {
        toolProgressBar.stop();
        console.error('An error occurred:', error);
      }

      toolProgressBar.stop();

      const continueChoice = await new Promise<string>((resolve) =>
        rl.question('Do you want to continue with another tool? (y/n): ', resolve)
      );
      if (continueChoice.toLowerCase() !== 'y') {
        break;
      }
    }
  }

  rl.close();
  if (ENABLE_LOGGING) console.log('Main function completed');
}

async function saveResults(directory: string, toolName: string, result: RunResult) {
  const filename = `${toolName}.json`;
  const filePath = `${directory}/${filename}`;

  await fs.writeFile(filePath, JSON.stringify(result, null, 2));
  if (ENABLE_LOGGING) console.log(`Results saved to ${filePath}`);
}

main()