import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import pcap from 'pcap';
import readline from 'readline';
import { TunnelTool, tunnelTools } from './tools';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { chromium } from 'playwright';


import SocksProxyAgent from 'socks-proxy-agent';
const TOR_SOCKS_PORT = 9050; // Default Tor SOCKS port
const TOR_SOCKS_HOST = '127.0.0.1';
const TOR_SOCKS_PROXY = `socks5h://${TOR_SOCKS_HOST}:${TOR_SOCKS_PORT}`;


// const SERVER_HOST = 'localhost';
const SERVER_HOST = 'localhost';
const SERVER_PORT = 3000;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
// const FILE_SIZES = [1024, 10240, 102400, 1048576]; // All sizes in bytes
// const FILE_SIZES_MB = [1]; // All sizes in megabytes (MB)
const NUM_MEASUREMENTS = 15;

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
    timestamp: number; // Performance.now() timestamp
    fileTransfers: { [key: string]: FileTransferResult };
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

  // Add these new interfaces at the top with the other interfaces
  interface FileMetadata {
    filename: string;
    size: number;
    hash: string;
    contentType: string;
    timestamp: string;
  }

  interface FileTransferResult {
    filename: string;
    timestamp: number; // Add this field
    originalMetadata: FileMetadata;
    receivedMetadata: FileMetadata;
    transferSuccess: boolean;
    hashMatch: boolean;
    metadataMatch: boolean;
    serverHash: string;
    clientHash: string;
    hashMatchDetails: {
      matched: boolean;
      serverHash: string;
      clientHash: string;
      timeTaken: number; // Time taken to calculate hash
    };
    sizeMatch: boolean;
    transferStats: CurlResult;
    error?: string;
  }

  interface WebTestResult {
    url: string;
    statusCode: number;
    speedDownload: number;
    speedUpload: number;
    timeSplit: TimeSplit;
    fcp: number;
    lcp: number;
    error?: string;
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
      parsedOutput = rawOutput;
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


async function performWebTest(url: string): Promise<WebTestResult> {
    const stopwatch = new Stopwatch();
    stopwatch.start();
    
    const isOnionUrl = url.includes('.onion');
    const curlArgs = [
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
      '-D', '-',  
      '-o', '/dev/null',  // Save actual file content to temp file
      '-s',  // Silent mode
    ];

    if (isOnionUrl) {
      curlArgs.push(
        '--socks5-hostname', `${TOR_SOCKS_HOST}:${TOR_SOCKS_PORT}`,
        '--insecure'
      );
    }

    curlArgs.push(url);
    const curlOutput = await runCommand('curl', curlArgs);
    stopwatch.stop();
  
    const curlResult = new Curl().parse(curlOutput);

    let fcp = 0;
    let lcp = 0;
    let error: string | undefined;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'load' });

        // Evaluate FCP and LCP using the performance API
        const metrics = await page.evaluate(() => {
            return new Promise((resolve) => {
                const observer = new PerformanceObserver((entryList) => {
                    const entries = entryList.getEntries();
                    const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
                    const lcpEntry = entries.find(entry => entry.entryType === 'largest-contentful-paint');
                    resolve({
                        fcp: fcpEntry ? fcpEntry.startTime : 0,
                        lcp: lcpEntry ? lcpEntry.startTime : 0
                    });
                });
                observer.observe({ type: 'paint', buffered: true });
                observer.observe({ type: 'largest-contentful-paint', buffered: true });
            });
        });

        fcp = metrics.fcp;
        lcp = metrics.lcp;
    } catch (err) {
        error = `Playwright error: ${(err as Error).message}`;
    } finally {
        await browser.close();
    }

    return {
      url,
      statusCode: curlResult.statusCode,
      speedDownload: curlResult.speedDownload,
      speedUpload: curlResult.speedUpload,
      timeSplit: curlResult.timeSplit,
      fcp,
      lcp,
      error: error || curlResult.error
    };
}

  const TEMP_DIR = path.join(os.tmpdir(), 'tunnel-testbed');

  // Add this function to calculate file hash
  async function calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  // Add this function to ensure temp directory exists
  async function ensureTempDir() {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }

  async function performFileTransfer(
    url: string, 
    filename: string, 
    originalMetadata: FileMetadata
  ): Promise<FileTransferResult> {
    const transferStartTime = performance.now();
    const tempFilePath = path.join(TEMP_DIR, `${Date.now()}-${filename}`);
    
    if (ENABLE_LOGGING) {
      console.log(`Performing file transfer from URL: ${url}`);
      console.log(`Saving to temporary file: ${tempFilePath}`);
    }

    try {
      await ensureTempDir();

      const isOnionUrl = url.includes('.onion');
      const curlArgs = [
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
        '-D', '-',  
        '-o', tempFilePath,  // Save actual file content to temp file
        '-s',  // Silent mode
      ];

      if (isOnionUrl) {
        curlArgs.push(
          '--socks5-hostname', `${TOR_SOCKS_HOST}:${TOR_SOCKS_PORT}`,
          '--insecure'
        );
      }

      curlArgs.push(url);
      const curlOutput = await runCommand('curl', curlArgs);

      const transferStats = new Curl().parse(curlOutput);

      const serverHash = originalMetadata.hash;
      const serverSize = originalMetadata.size;

      const hashStartTime = performance.now();
      const clientHash = await calculateFileHash(tempFilePath);
      const hashEndTime = performance.now();

      const stats = await fs.stat(tempFilePath);
      const receivedMetadata = {
        filename,
        size: stats.size,
        hash: clientHash,
        contentType: originalMetadata.contentType,
        timestamp: new Date().toISOString()
      };

      const hashMatch = serverHash === clientHash;
      const sizeMatch = serverSize === stats.size;

      await fs.unlink(tempFilePath);

      return {
        filename,
        timestamp: transferStartTime,
        originalMetadata,
        receivedMetadata,
        transferSuccess: transferStats.statusCode === 200,
        hashMatch,
        metadataMatch: sizeMatch && hashMatch,
        serverHash,
        clientHash,
        hashMatchDetails: {
          matched: hashMatch,
          serverHash,
          clientHash,
          timeTaken: hashEndTime - hashStartTime
        },
        sizeMatch,
        transferStats
      };
    } catch (error) {
      try {
        await fs.unlink(tempFilePath);
      } catch {} // Ignore cleanup errors

      return {
        filename,
        timestamp: transferStartTime,
        originalMetadata,
        receivedMetadata: {
          filename,
          size: 0,
          hash: '',
          contentType: originalMetadata.contentType,
          timestamp: new Date().toISOString()
        },
        transferSuccess: false,
        hashMatch: false,
        metadataMatch: false,
        serverHash: originalMetadata.hash,
        clientHash: '',
        hashMatchDetails: {
          matched: false,
          serverHash: originalMetadata.hash,
          clientHash: '',
          timeTaken: 0
        },
        sizeMatch: false,
        transferStats: {
          statusCode: 0,
          timeSplit: { dnsLookup: 0, tcpConnection: 0, tlsHandshake: 0, firstByte: 0, total: 0 },
          ttfb: 0,
          latency: 0,
          sizeDownload: 0,
          speedDownload: 0,
          speedUpload: 0
        },
        error: (error as Error).message
      };
    }
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
  let availableFiles: FileMetadata[] = [];

  // Pre-fetch file metadata from server
  try {
    const response = await axios.get(`${SERVER_URL}/files`);
    availableFiles = response.data;
    if (ENABLE_LOGGING) console.log(`Pre-fetched metadata for ${availableFiles.length} files`);
  } catch (error) {
    errors.push({ stage: 'File Metadata Fetch', error: `Failed to get file metadata: ${(error as Error).message}` });
  }

  // Create a map of filename to metadata for quick lookup
  const fileMetadataMap = new Map(
    availableFiles.map(metadata => [metadata.filename, metadata])
  );

  // Tunnel Setup Stage
  if (ENABLE_LOGGING) console.log(`Requesting server to start tunnel with ${tunnelTool.name}`);
  try {
    const response = await axios.post(`${SERVER_URL}/start-tunnel`, { toolName: tunnelTool.name });
    tunnelUrl = response.data.url;

    // Add check to remove trailing slash if present
    if (tunnelUrl.endsWith('/')) {
      tunnelUrl = tunnelUrl.slice(0, -1);
    }

    if (ENABLE_LOGGING) console.log(`Tunnel received: ${tunnelUrl}`);
  } catch (error) {
    errors.push({ stage: 'Tunnel Setup', error: `Failed to start tunnel: ${(error as Error).message}` });
  }
  
  if (!tunnelUrl) {
    errors.push({ stage: 'Tunnel Setup', error: 'Tunnel URL is empty or invalid' });
  }

  const isOnionUrl = tunnelUrl.includes('.onion');

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
  
  // Add delay after setup but before measurements
  if (ENABLE_LOGGING) console.log('Waiting 10 seconds for tunnel to stabilize...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Diagnostics Stage - Skip for .onion URLs
  diagnosticsStopwatch.start();
  const diagnostics: DiagnosticResult[] = [];
  if (tunnelUrl && !isOnionUrl) {
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
  } else if (isOnionUrl) {
    if (ENABLE_LOGGING) console.log('Skipping diagnostics for .onion URL');
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
  
  // Modify the measurements loop to use pre-fetched metadata
  for (let i = 0; i < numMeasurements; i++) {
    const measurementsStopwatch = new Stopwatch();
    measurementsStopwatch.start();
    const measurementStartTime = performance.now();
  
    const fileTransfers: { [key: string]: FileTransferResult } = {};
    const webTests: WebTestResult[] = [];
  
    if (tunnelUrl && availableFiles.length > 0) {
      for (const fileMetadata of availableFiles) {
        try {
          const result = await performFileTransfer(
            `${tunnelUrl}/download/${fileMetadata.filename}`,
            fileMetadata.filename,
            fileMetadata
          );
          fileTransfers[fileMetadata.filename] = result;

          if (!result.transferSuccess || !result.hashMatch || !result.metadataMatch) {
            allDownloadsComplete = false;
          }
        } catch (error) {
          errors.push({ 
            stage: 'File Transfer', 
            error: `Failed to download ${fileMetadata.filename}: ${(error as Error).message}` 
          });
          allDownloadsComplete = false;
        }
      }
    }

    // Perform web tests
    try {
      const webTestResult = await performWebTest(`${tunnelUrl}/webtest`);
      webTests.push(webTestResult);
    } catch (error) {
      errors.push({ 
        stage: 'Web Test', 
        error: `Failed to perform web test: ${(error as Error).message}` 
      });
    }
  
    measurementsStopwatch.stop();
    const measurementDuration = measurementsStopwatch.getTiming().duration;
    totalMeasurementDuration += measurementDuration;

    measurements.push({
      measurementNumber: i + 1,
      timestamp: measurementStartTime,
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

  // Create temp directory
  await ensureTempDir();

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

  // Clean up temp directory at the end
  try {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to clean up temp directory:', error);
  }

  rl.close();
  if (ENABLE_LOGGING) console.log('Main function completed');
}

async function saveResults(directory: string, toolName: string, result: RunResult) {
  // Save original format
  // const originalFilename = `${toolName}-original.json`;
  // const originalFilePath = `${directory}/${originalFilename}`;
  // await fs.writeFile(originalFilePath, JSON.stringify(result, null, 2));

  // Save flattened format
  const flattenedFilename = `${toolName}.json`;
  const flattenedFilePath = `${directory}/${flattenedFilename}`;
  const flattenedResults = flattenResults(result);
  await fs.writeFile(flattenedFilePath, JSON.stringify(flattenedResults, null, 2));

  if (ENABLE_LOGGING) {
    console.log(`Results saved to ${flattenedFilePath}`);
  }
}

function flattenResults(result: RunResult): FlattenedMeasurement[] {
  return result.measurements.map(measurement => {
    // Flatten file transfers
    const flattenedTransfers = Object.entries(measurement.fileTransfers).map(([filename, transfer]) => ({
      filename,
      timestamp: transfer.timestamp,
      fileSize: transfer.originalMetadata.size,
      contentType: transfer.originalMetadata.contentType,
      transferSuccess: transfer.transferSuccess,
      statusCode: transfer.transferStats.statusCode,
      downloadSpeed: transfer.transferStats.speedDownload,
      uploadSpeed: transfer.transferStats.speedUpload,
      dnsLookup: transfer.transferStats.timeSplit.dnsLookup * 1000, // Convert to ms
      tcpConnection: transfer.transferStats.timeSplit.tcpConnection * 1000,
      tlsHandshake: transfer.transferStats.timeSplit.tlsHandshake * 1000,
      timeToFirstByte: transfer.transferStats.timeSplit.firstByte * 1000,
      totalTransferTime: transfer.transferStats.timeSplit.total * 1000,
      hashMatch: transfer.hashMatch,
      sizeMatch: transfer.sizeMatch,
      // hashCalculationTime: transfer.hashMatchDetails.timeTaken,
      error: transfer.error
    }));

    return {
      toolName: result.tool,
      measurementNumber: measurement.measurementNumber,
      timestamp: measurement.timestamp,
      fileTransfers: flattenedTransfers,
      webTests: measurement.webTests.map(test => ({
        url: test.url,
        statusCode: test.statusCode,
        downloadSpeed: test.speedDownload,
        uploadSpeed: test.speedUpload,
        dnsLookup: test.timeSplit.dnsLookup * 1000,
        tcpConnection: test.timeSplit.tcpConnection * 1000,
        tlsHandshake: test.timeSplit.tlsHandshake * 1000,
        timeToFirstByte: test.timeSplit.firstByte * 1000,
        totalTime: test.timeSplit.total * 1000,
        fcp: test.fcp,
        lcp: test.lcp,
        error: test.error
      })),
      totalDuration: result.durations.total.duration,
      setupDuration: result.durations.toolSetup.duration,
      diagnosticsDuration: result.durations.diagnostics.duration,
      measurementDuration: result.durations.measurements.total.duration,
      hasErrors: result.errors.length > 0,
      errorCount: result.errors.length,
      errors: result.errors.map(e => `${e.stage}: ${e.error}`)
    };
  });
}

main()