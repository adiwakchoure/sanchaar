import { spawn } from 'child_process';
import https from 'https';

async function startCloudflaredTunnel(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Starting Cloudflared tunnel...');
    const cloudflared = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);

    cloudflared.stderr.on('data', (data) => {
    //   console.log(`Cloudflared stdout: ${data}`);
      if (data.toString().includes('https://')) {
        const url = data.toString().match(/(https:\/\/[^\s]+)/)[0];
        console.log(`Detected tunnel URL: ${url}`);
        checkTunnelStatus(url).then(resolve).catch(reject);
      }
    });

    // cloudflared.stderr.on('data', (data) => {
    //   console.error(`Cloudflared stderr: ${data}`);
    // });

    cloudflared.on('error', (error) => {
      console.error(`Failed to start Cloudflared: ${error.message}`);
      reject(error);
    });

    cloudflared.on('close', (code) => {
      console.log(`Cloudflared process exited with code ${code}`);
      if (code !== 0) {
        reject(new Error(`Cloudflared exited with code ${code}`));
      }
    });
  });
}

async function checkTunnelStatus(url: string): Promise<void> {
  console.log(`Checking tunnel status for ${url}`);
  return new Promise((resolve, reject) => {
    https.get(url, {
      rejectUnauthorized: false, // Ignore SSL certificate errors
      timeout: 5000 // 5 second timeout
    }, (res) => {
      console.log(`Received response with status code: ${res.statusCode}`);
      if (res.statusCode === 200) {
        console.log('Tunnel is working! for ${url}');
        resolve();
      } else {
        reject(new Error(`Unexpected status code: ${res.statusCode}`));
      }
    }).on('error', (error) => {
      console.error(`HTTPS request failed: ${error.message}`);
      reject(error);
    });
  });
}

async function main() {
  try {
    await startCloudflaredTunnel(3000);
    console.log('Tunnel started successfully');
  } catch (error) {
    console.error('Failed to start tunnel:', error);
  }
}

main();