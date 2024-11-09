import express from 'express';
import { TunnelTool, tunnelTools } from './tools';
import fs from 'fs/promises';
import fsSync from 'fs'; // Import the synchronous fs module for streaming
import pcap from 'pcap';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import mime from 'mime-types';

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

// Add this type definition at the top with other imports
interface FileMetadata {
  filename: string;
  size: number;
  hash: string;
  contentType: string;
  timestamp: string;
}

// Remove one of the duplicate /files endpoints and modify the remaining one
app.get('/files', async (req, res) => {
  try {
    // Check if directory exists first
    await fs.access(INPUT_FILES_DIR);
    
    const files = await fs.readdir(INPUT_FILES_DIR);
    const filesMetadata = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(INPUT_FILES_DIR, filename);
        return await getFileMetadata(filePath);
      })
    );
    res.json(filesMetadata);
  } catch (error) {
    const errorMessage = `Failed to list files: ${(error as Error).message}`;
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

app.get('/download/:filename', async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(INPUT_FILES_DIR, filename);

  if (ENABLE_LOGGING) console.log(`Received download request for file: ${filename}`);

  try {
    // Check if file exists
    await fs.access(filePath);
    
    // Calculate file hash before streaming
    const fileHash = await calculateFileHash(filePath);
    const stats = await fs.stat(filePath);
    
    // Get file metadata
    const metadata = {
      filename: path.basename(filePath),
      size: stats.size,
      hash: fileHash,
      contentType: mime.lookup(filePath) || 'application/octet-stream',
      timestamp: stats.mtime.toISOString()
    };
    
    // Set response headers with integrity information
    res.set({
      'Content-Type': metadata.contentType,
      'X-File-Metadata': JSON.stringify(metadata),
      'X-File-Hash': fileHash,
      'X-File-Size': stats.size.toString()
    });

    // Stream the file
    const fileStream = fsSync.createReadStream(filePath);
    fileStream.pipe(res);

    if (ENABLE_LOGGING) console.log(`Sending file ${filename} (${metadata.size} bytes) with hash ${fileHash}`);
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

app.get('/webtest', (req, res) => {
  if (ENABLE_LOGGING) console.log('Received webtest request');
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Heavy Web Test Page</title>
        
        <!-- Bootstrap CSS framework to add extra weight -->
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" integrity="sha384-9ndCyUaPp2pC++p7+qF8ebQPO5z8r3D7xQmiBm5/dEe6Pik+8C64Q4nVf5p4/ltw" crossorigin="anonymous">
        
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .content-block { height: 300px; background-color: #e0e0e0; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1 class="text-center">Heavy Web Test Page</h1>

        <!-- High-Resolution Image from Picsum CDN -->
        <img src="https://picsum.photos/1920/1080" alt="High-Resolution Image 1" width="100%" height="auto">

        <!-- Lodash JavaScript library from a CDN for additional load -->
        <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js" integrity="sha384-M9nCjApRKoA0VNfH4Iay8bLZ8RA1DWl3rkOIoPujVjyB6xTJRvJ8M9GAHkJwsMbt" crossorigin="anonymous"></script>

        <!-- Large video from a CDN -->
        <video controls width="100%">
          <source src="https://media.w3.org/2010/05/sintel/trailer_hd.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>

        <!-- Additional content blocks for a scrolling load test -->
        <div class="content-block"></div>
        <div class="content-block"></div>
        <div class="content-block"></div>
        <div class="content-block"></div>

        <!-- Another high-resolution image for extra load from Picsum CDN -->
        <img src="https://picsum.photos/1920/1080?random=2" alt="High-Resolution Image 2" width="100%" height="auto">
        
        <!-- Computational JavaScript to create some processing load -->
        <script>
          // Generate some computational load with a simple loop
          const heavyComputation = () => {
            const array = Array(100000).fill().map((_, i) => i * Math.random());
            return _.shuffle(array);
          };
          heavyComputation();
        </script>

        <p class="text-center">This page includes multiple heavy elements to simulate a real-world heavy load.</p>
      </body>
    </html>
  `);
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

app.listen(PORT, async () => {
  try {
    // Create input_files directory if it doesn't exist
    await fs.mkdir(INPUT_FILES_DIR, { recursive: true });
    
    if (ENABLE_LOGGING) console.log(`Server running on port ${PORT}`);
    if (ENABLE_PCAP) {
      if (ENABLE_LOGGING) console.log('Starting daily PCAP capture');
      setInterval(startPcapCapture, 24 * 60 * 60 * 1000);
    }
  } catch (error) {
    console.error(`Failed to initialize server: ${(error as Error).message}`);
    process.exit(1);
  }
});

// Add these at the top with other constants
const INPUT_FILES_DIR = path.join(__dirname, 'input_files');

// Add this function to calculate file hash
async function calculateFileHash(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// Add this function to get file metadata
async function getFileMetadata(filePath: string): Promise<FileMetadata> {
  const stats = await fs.stat(filePath);
  const hash = await calculateFileHash(filePath);
  
  return {
    filename: path.basename(filePath),
    size: stats.size,
    hash,
    contentType: mime.lookup(filePath) || 'application/octet-stream',
    timestamp: stats.mtime.toISOString()
  };
}
