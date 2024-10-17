import express from 'express';
import { TunnelTool, tunnelTools } from './tools';
import fs from 'fs/promises';
import pcap from 'pcap';
import http from 'http';

const ENABLE_PCAP = false; // Set this to true to enable PCAP capturing
const ENABLE_LOGGING = true; // Set this to false to disable logging

const app = express();
const PORT = 3000;

let activeTunnel: TunnelTool | null = null;
let pcapSession: any = null;

app.use(express.json());

app.post('/start-tunnel', async (req, res) => {
  if (ENABLE_LOGGING) console.log('Received request to start tunnel');
  const { toolName } = req.body;
  const tool = tunnelTools.find(t => t.name === toolName);

  if (!tool) {
    const error = `Invalid tool name: ${toolName}`;
    if (ENABLE_LOGGING) console.log(error);
    return res.status(400).json({ error });
  }

  try {
    if (activeTunnel) {
      if (ENABLE_LOGGING) console.log('Stopping active tunnel before starting new one');
      await activeTunnel.stop();
    }
    const url = await tool.start({ port: PORT });
    activeTunnel = tool;
    if (ENABLE_LOGGING) console.log(`Tunnel started successfully with URL: ${url}`);
    res.json({ url });
  } catch (error) {
    const errorMessage = `Failed to start tunnel: ${(error as Error).message}`;
    console.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/stop-tunnel', async (req, res) => {
  if (ENABLE_LOGGING) console.log('Received request to stop tunnel');
  if (activeTunnel) {
    try {
      await activeTunnel.stop();
      activeTunnel = null;
      if (ENABLE_LOGGING) console.log('Tunnel stopped successfully');
      res.json({ message: 'Tunnel stopped' });
    } catch (error) {
      const errorMessage = `Failed to stop tunnel: ${(error as Error).message}`;
      console.error(errorMessage);
      res.status(500).json({ error: errorMessage });
    }
  } else {
    if (ENABLE_LOGGING) console.log('No active tunnel to stop');
    res.status(400).json({ error: 'No active tunnel' });
  }
});

app.get('/download/:fileSize', (req, res) => {
  const fileSize = parseInt(req.params.fileSize);
  if (ENABLE_LOGGING) console.log(`Received download request for file size: ${fileSize} bytes`);
  try {
    const buffer = Buffer.alloc(fileSize, 'x');
    res.send(buffer);
    if (ENABLE_LOGGING) console.log(`Sent ${fileSize} bytes of data`);
  } catch (error) {
    const errorMessage = `Failed to send file: ${(error as Error).message}`;
    console.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/health', (req, res) => {
  if (ENABLE_LOGGING) console.log('Received health check request');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/diagnostics', (req, res) => {
  if (ENABLE_LOGGING) console.log('Received diagnostics request');
  try {
    res.set('Content-Type', 'application/json');
    res.set('X-Diagnostics', 'true');
    res.send(JSON.stringify({ message: 'Diagnostics data' }));
    if (ENABLE_LOGGING) console.log('Sent diagnostics data');
  } catch (error) {
    const errorMessage = `Failed to send diagnostics: ${(error as Error).message}`;
    console.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/upload-test', (req, res) => {
  if (ENABLE_LOGGING) console.log('Received upload test request');

  let fileData = Buffer.alloc(0);

  req.on('data', (chunk) => {
    fileData = Buffer.concat([fileData, chunk]);
  });

  req.on('end', () => {
    if (fileData.length === 0) {
      if (ENABLE_LOGGING) console.log('No file data received');
      return res.status(400).json({ error: 'No file data received' });
    }

    if (ENABLE_LOGGING) console.log(`Received file data of length: ${fileData.length}`);
    res.json({ message: 'File processed successfully', fileSize: fileData.length });
  });

  req.on('error', (err) => {
    const errorMessage = `Error receiving file data: ${err.message}`;
    console.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  });
});

async function startPcapCapture() {
  if (!ENABLE_PCAP) {
    if (ENABLE_LOGGING) console.log('PCAP capturing is disabled.');
    return;
  }
  if (ENABLE_LOGGING) console.log('Starting PCAP capture');
  if (pcapSession) {
    if (ENABLE_LOGGING) console.log('Closing existing PCAP session');
    pcapSession.close();
  }
  try {
    const date = new Date().toISOString().split('T')[0];
    const filename = `capture_${date}.pcap`;
    if (ENABLE_LOGGING) console.log(`Creating new PCAP session, saving to file: ${filename}`);
    pcapSession = pcap.createSession('eth0', '');
    const writeStream = fs.createWriteStream(filename);
    pcapSession.on('packet', (rawPacket: any) => {
      writeStream.write(rawPacket.buf);
    });
    if (ENABLE_LOGGING) console.log('PCAP capture started');
  } catch (error) {
    console.error(`Failed to start PCAP capture: ${(error as Error).message}`);
  }
}

async function saveMeasurementResults(results: any) {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `results_${date}_${time}.json`;

  try {
    if (ENABLE_LOGGING) console.log(`Saving measurement results to file: ${filename}`);
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    if (ENABLE_LOGGING) console.log('Measurement results saved successfully');
  } catch (error) {
    console.error(`Failed to save measurement results: ${(error as Error).message}`);
  }
}

app.listen(PORT, () => {
  if (ENABLE_LOGGING) console.log(`Server running on port ${PORT}`);
  if (ENABLE_PCAP) {
    if (ENABLE_LOGGING) console.log('Starting daily PCAP capture');
    setInterval(startPcapCapture, 24 * 60 * 60 * 1000);
  }
});