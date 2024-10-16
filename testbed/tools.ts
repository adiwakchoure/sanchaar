import { spawn } from 'child_process';
import http from 'http';
import axios from 'axios';

export interface TunnelTool {
  name: string;
  preSetupCommands?: string[][];
  preStartCommands?: string[][];
  start: (options?: TunnelOptions) => Promise<string>;
  stop: () => Promise<void>;
}

interface TunnelOptions {
  port?: number;
  urlPattern?: string | RegExp;
}

abstract class BaseTunnel implements TunnelTool {
  abstract name: string;
  protected process: any;
  preSetupCommands?: string[][];
  preStartCommands?: string[][];

  async start(options: TunnelOptions = { port: 3000, urlPattern: /https:\/\/[^\s]+/ }): Promise<string> {
    await this.runPreSetupCommands();
    await this.runPreStartCommands();
    console.log(`Starting ${this.name} on port ${options.port}`);
    return this.launchTunnel(options);
  }

  abstract launchTunnel(options: TunnelOptions): Promise<string>;

  async stop(): Promise<void> {
    console.log(`Stopping ${this.name}`);
    this.process.kill();
  }

  protected async runPreSetupCommands() {
    if (this.preSetupCommands) {
      for (const command of this.preSetupCommands) {
        await this.runCommand(command[0], command.slice(1));
      }
    }
  }

  protected async runPreStartCommands() {
    if (this.preStartCommands) {
      for (const command of this.preStartCommands) {
        await this.runCommand(command[0], command.slice(1));
      }
    }
  }

  protected runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command ${command} failed with code ${code}`));
        }
      });
    });
  }
}

export class LocalTunnel extends BaseTunnel {
  name = 'LocalTunnel';
  preSetupCommands = [];
  preStartCommands = [];

  async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
    // Start the LocalTunnel process using the 'lt' command
    this.process = spawn('lt', ['--port', port.toString()]);

    return new Promise((resolve, reject) => {
      this.process.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        const urlMatch = output.match(/your url is: (https:\/\/[^\s]+)/);

        if (urlMatch) {
          const localTunnelUrl = urlMatch[1];
          console.log(`LocalTunnel URL: ${localTunnelUrl}`);
          
          // Get the tunnel password using the provided command
          this.getTunnelPassword()
            .then(password => {
              console.log(`Tunnel Password: ${password}`);
              resolve(localTunnelUrl);
            })
            .catch(err => {
              console.error('Failed to retrieve tunnel password:', err);
              reject(err);
            });
        }
      });

      this.process.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('error')) {
          reject(new Error('Failed to start LocalTunnel'));
        }
      });

      setTimeout(() => {
        reject(new Error('Timeout: Failed to start LocalTunnel'));
      }, 10000);
    });
  }

  // Function to retrieve the tunnel password from the loca.lt service
  async getTunnelPassword(): Promise<string> {
    try {
      const response = await axios.get('https://loca.lt/mytunnelpassword');
      return response.data;
    } catch (error) {
      throw new Error('Could not retrieve tunnel password');
    }
  }
}

export class CloudflareTunnel extends BaseTunnel {
    name = 'Cloudflared';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel(_: TunnelOptions): Promise<string> {
      this.process = spawn('cloudflared', ['tunnel', 'run', 'sanchaar']);
      
      return new Promise((resolve, reject) => {
        // Directly resolve with the fixed URL
        const url = 'https://sanchaar.remedium.world';
        console.log(`Tunnel URL: ${url}`);
        resolve(url);
  
        this.process.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          if (output.includes('error')) {
            reject(new Error('Failed to start Cloudflare Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Cloudflare Tunnel'));
        }, 10000);
      });
    }
  }

export class NgrokTunnel extends BaseTunnel {
  name = 'Ngrok';
  preSetupCommands = [['echo', 'Running pre-setup command for ngrok']];
  preStartCommands = [['echo', 'Running pre-start command for ngrok']];

  async launchTunnel({ port = 3000, urlPattern = /https:\/\/[^\s]+/ }: TunnelOptions): Promise<string> {
    this.process = spawn('ngrok', ['http', port.toString()]);

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const options = {
          hostname: '127.0.0.1',
          port: 4040,
          path: '/api/tunnels',
          method: 'GET'
        };

        const req = http.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const parsedData = JSON.parse(data);
              const ngrokUrl = parsedData.tunnels[0]?.public_url;

              if (ngrokUrl && ngrokUrl.match(urlPattern)) {
                console.log(`ngrok tunnel started with URL: ${ngrokUrl}`);
                resolve(ngrokUrl);
              } else {
                console.error('Could not retrieve ngrok URL.');
                reject(new Error('Could not retrieve ngrok URL.'));
              }
            } catch (error) {
              console.error('Error parsing ngrok response:', error);
              reject(error);
            }
          });
        });

        req.on('error', (error) => {
          console.error('Error fetching ngrok URL:', error);
          reject(error);
        });

        req.end();
      }, 5000);
    });
  }
}

export const tunnelTools: TunnelTool[] = [new CloudflareTunnel(), new NgrokTunnel(), new LocalTunnel()];

async function executeTool(toolName: string, options: TunnelOptions = { port: 3000, urlPattern: /https:\/\/[^\s]+/ }) {
  const tool = tunnelTools.find(t => t.name === toolName);
  if (!tool) {
    console.error(`Tool ${toolName} not found.`);
    return;
  }

  try {
    const url = await tool.start(options);
    console.log(`Tunnel URL: ${url}`);

    console.log('Press any key to stop the tunnel...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async () => {
      await tool.stop();
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log('Tunnel stopped.');
    });
  } catch (error) {
    console.error(`Failed to execute tool ${toolName}:`, error);
  }
}

executeTool('LocalTunnel');