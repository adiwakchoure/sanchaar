import { spawn } from 'child_process';
import http from 'http';
import axios from 'axios';

export interface TunnelTool {
  name: string;
  preSetupCommands?: string[][];
  preStartCommands?: string[][];
  postSetupCommands?: string[][];
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
  postSetupCommands?: string[][];

  async start(options: TunnelOptions = { port: 3000, urlPattern: /https:\/\/[^\s]+/ }): Promise<string> {
    await this.runPreSetupCommands();
    await this.runPreStartCommands();
    console.log(`Starting ${this.name} on port ${options.port}`);
    const url = await this.launchTunnel(options);
    // await this.runPostSetupCommands(); // Run post-setup commands after starting the tunnel
    return url;
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

  protected async runPostSetupCommands() {
    if (this.postSetupCommands) {
      for (const command of this.postSetupCommands) {
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
    postSetupCommands = [['echo', 'post cloudflare setup v2!!']];
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

export class PagekiteTunnel extends BaseTunnel {
  name = 'Pagekite';
  preSetupCommands = [];
  preStartCommands = [];

  async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
    this.process = spawn('python3', ['pagekite.py', port.toString(), 'sun4.pagekite.me']);

    return new Promise((resolve, reject) => {
      const url = `http://sun4.pagekite.me`;
      console.log(`Tunnel URL: ${url}`);
      resolve(url);

      this.process.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('error')) {
          reject(new Error('Failed to start Pagekite Tunnel'));
        }
      });

      setTimeout(() => {
        reject(new Error('Timeout: Failed to start Pagekite Tunnel'));
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
        this.process.stderr.on('data', (data: Buffer) => {
          console.error('Ngrok error:', data.toString());
        });
  
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
        }, 10000); // Increased delay to 10 seconds
      });
    }
  }

  export class ServeoTunnel extends BaseTunnel {
    name = 'Serveo';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('ssh', ['-R', `80:localhost:${port}`, 'serveo.net']);
  
      return new Promise((resolve, reject) => {
        this.process.stdout.on('data', (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(/Forwarding HTTP traffic from (https:\/\/[^\s]+)/);
  
          if (urlMatch) {
            const serveoUrl = urlMatch[1];
            console.log(`Serveo URL: ${serveoUrl}`);
            resolve(serveoUrl);
          }
        });
  
        this.process.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          if (output.includes('error')) {
            reject(new Error('Failed to start Serveo Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Serveo Tunnel'));
        }, 10000);
      });
    }
  }

  export class TelebitTunnel extends BaseTunnel {
    name = 'Telebit';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('~/telebit', ['http', port.toString()], { shell: true });
  
      return new Promise((resolve, reject) => {
        this.process.stdout.on('data', (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(/Forwarding (https:\/\/[^\s]+) =>/);
  
          if (urlMatch) {
            const telebitUrl = urlMatch[1];
            console.log(`Telebit URL: ${telebitUrl}`);
            resolve(telebitUrl);
          }
        });
  
        this.process.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          if (output.includes('error')) {
            reject(new Error('Failed to start Telebit Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Telebit Tunnel'));
        }, 10000);
      });
    }
  }

  export class BoreTunnel extends BaseTunnel {
    name = 'Bore';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      // Start the bore process
      this.process = spawn('bore', ['local', port.toString(), '--to', 'bore.pub'], { shell: true });
  
      return new Promise((resolve, reject) => {
        const handleOutput = (data: Buffer) => {
          const output = data.toString();
          const words = output.split(/\s+/);
          words.forEach(word => {
            if (word.startsWith('bore.pub')) {
              const boreUrl = `http://${word}`
              console.log(`Bore URL: ${boreUrl}`);
              resolve(boreUrl);
            }
          });
        };
        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Bore Tunnel'));
        }, 5000); 
      });
    }
  }

  export class LocalxposeTunnel extends BaseTunnel {
    name = 'Localxpose';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('pnpm', ['dlx', 'loclx', 'tunnel', 'http', '--to', `localhost:${port}`], { shell: true });
  
      return new Promise((resolve, reject) => {
        const urlRegex = /([a-z0-9]+\.loclx\.io)/;
  
        const handleOutput = (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(urlRegex);
  
          if (urlMatch) {
            const loclxUrl = `http://${urlMatch[0]}`;
            console.log(`Loclx URL: ${loclxUrl}`);
            resolve(loclxUrl);
          }
        };
  
        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);
  
        this.process.on('close', (code) => {
          console.log(`Localxpose process exited with code ${code}`);
          if (code !== 0) {
            reject(new Error('Failed to start Localxpose Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Localxpose Tunnel'));
        }, 10000);
      });
    }
  }

  
  export class ExposeTunnel extends BaseTunnel {
    name = 'Expose';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('expose', ['share', `http://localhost:${port}`], { shell: true });
  
      return new Promise((resolve, reject) => {
        const urlRegex = /Public HTTPS:\s+(https:\/\/[^\s]+)/;
  
        const handleOutput = (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(urlRegex);
  
          if (urlMatch) {
            const exposeUrl = urlMatch[1];
            console.log(`Expose URL: ${exposeUrl}`);
            resolve(exposeUrl);
          }
        };
  
        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);
  
        this.process.on('close', (code) => {
          console.log(`Expose process exited with code ${code}`);
          if (code !== 0) {
            reject(new Error('Failed to start Expose Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Expose Tunnel'));
        }, 10000);
      });
    }
  }

  export class LoopholeTunnel extends BaseTunnel {
    name = 'Loophole';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('./loophole', ['http', port.toString()]);
  
      return new Promise((resolve, reject) => {
        const urlRegex = /(https:\/\/[^\s]+) ->/;
  
        const handleOutput = (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(urlRegex);
  
          if (urlMatch) {
            const loopholeUrl = urlMatch[1];
            console.log(`Loophole URL: ${loopholeUrl}`);
            resolve(loopholeUrl);
          }
        };
  
        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);
  
        this.process.on('close', (code) => {
          console.log(`Loophole process exited with code ${code}`);
          if (code !== 0) {
            reject(new Error('Failed to start Loophole Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Loophole Tunnel'));
        }, 10000);
      });
    }
  }


  export class PinggyTunnel extends BaseTunnel {
    name = 'Pinggy';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('ssh', ['-p', '443', '-R0:localhost:3000', '-L4300:localhost:4300', 'qr@a.pinggy.io'], { shell: true });
  
      return new Promise((resolve, reject) => {
        const urlRegex = /(https:\/\/[^\s]+\.free\.pinggy\.link)/;
  
        const handleOutput = (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(urlRegex);
  
          if (urlMatch) {
            const pinggyUrl = urlMatch[1];
            console.log(`Pinggy URL: ${pinggyUrl}`);
            resolve(pinggyUrl);
          }
        };
  
        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);
  
        this.process.on('close', (code) => {
          console.log(`Pinggy process exited with code ${code}`);
          if (code !== 0) {
            reject(new Error('Failed to start Pinggy Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Pinggy Tunnel'));
        }, 10000); // Set a reasonable timeout
      });
    }
  }
  
  export class TailscaleTunnel extends BaseTunnel {
    name = 'Tailscale';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('sudo', ['tailscale', 'funnel', port.toString()], { shell: true });
  
      return new Promise((resolve, reject) => {
        const urlRegex = /(https:\/\/[^\s]+\.ts\.net\/)/;
  
        const handleOutput = (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(urlRegex);
  
          if (urlMatch) {
            const tailscaleUrl = urlMatch[1];
            console.log(`Tailscale URL: ${tailscaleUrl}`);
            resolve(tailscaleUrl);
          }
        };
  
        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);
  
        this.process.on('close', (code) => {
          console.log(`Tailscale process exited with code ${code}`);
          if (code !== 0) {
            reject(new Error('Failed to start Tailscale Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Tailscale Tunnel'));
        }, 10000); // Set a reasonable timeout
      });
    }
  }

  export class TunnelPyjamas extends BaseTunnel {
    name = 'TunnelPyjamas';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      return new Promise((resolve, reject) => {
        const tryStartTunnel = () => {
          const wgProcess = spawn('wg-quick', ['up', './tunnel.conf'], { shell: true });
  
          const urlRegex = /on (https:\/\/[^\s]+) ✨/;
  
          const handleOutput = (data: Buffer) => {
            const output = data.toString();
            const urlMatch = output.match(urlRegex);
  
            if (urlMatch) {
              const pyjamasUrl = urlMatch[1];
              console.log(`TunnelPyjamas URL: ${pyjamasUrl}`);
              resolve(pyjamasUrl);
            }
          };
  
          wgProcess.stdout.on('data', handleOutput);
          wgProcess.stderr.on('data', handleOutput);
  
          wgProcess.on('close', (code) => {
            console.log(`wg-quick process exited with code ${code}`);
            if (code !== 0) {
              console.log('Attempting to bring down the tunnel and retry...');
              spawn('wg-quick', ['down', './tunnel.conf'], { shell: true }).on('close', () => {
                tryStartTunnel();
              });
            }
          });
  
          setTimeout(() => {
            reject(new Error('Timeout: Failed to start TunnelPyjamas Tunnel'));
          }, 10000); // Set a reasonable timeout
        };
  
        tryStartTunnel();
      });
    }
  }

  export class ZrokTunnel extends BaseTunnel {
    name = 'Zrok';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('zrok', ['share', 'public', `http://localhost:${port}`], { shell: true });
  
      return new Promise((resolve, reject) => {
        this.process.stdout.on('data', (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(/https:\/\/[^\s]+/);
          if (urlMatch) {
            const url = urlMatch[0].split('│')[0].trim(); // Remove trailing ││[PUBLIC]
            console.log(`Zrok URL: ${url}`);
            resolve(url);
          }
        });
  
        this.process.stderr.on('data', (data: Buffer) => {
          // Suppress stderr output
        });
  
        this.process.on('close', (code) => {
          if (code !== 0) {
            reject(new Error('Failed to start Zrok Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Zrok Tunnel'));
        }, 10000); // Set a reasonable timeout
      });
    }
  }

  export class TunwgTunnel extends BaseTunnel {
    name = 'Tunwg';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('./tunwg', ['-p', port.toString()], { shell: true });
  
      return new Promise((resolve, reject) => {
        const urlRegex = /https:\/\/[^\s]+\.l\.tunwg\.com/;
  
        const handleOutput = (data: Buffer) => {
          const output = data.toString();
          const urlMatch = output.match(urlRegex);
  
          if (urlMatch) {
            const tunwgUrl = urlMatch[0];
            console.log(`Tunwg URL: ${tunwgUrl}`);
            resolve(tunwgUrl);
          }
        };
  
        this.process.stdout.on('data', handleOutput);
        this.process.stderr.on('data', handleOutput);
  
        this.process.on('close', (code) => {
          console.log(`Tunwg process exited with code ${code}`);
          if (code !== 0) {
            reject(new Error('Failed to start Tunwg Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Tunwg Tunnel'));
        }, 10000); // Set a reasonable timeout
      });
    }
  }

  export class PacketriotTunnel extends BaseTunnel {
    name = 'Packetriot';
    preSetupCommands = [];
    preStartCommands = [];
  
    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      this.process = spawn('pktriot', ['http', port.toString()]);
  
      return new Promise((resolve, reject) => {
        this.process.stdout.on('data', (data: Buffer) => {
          const output = data.toString();
          const subdomainMatch = output.match(/(\w+-\w+-\d+\.pktriot\.net)/);
          if (subdomainMatch) {
            const fullUrl = `http://${subdomainMatch[1]}`;
            console.log(`Packetriot URL: ${fullUrl}`);
            resolve(fullUrl);
          }
        });
  
        this.process.stderr.on('data', (data: Buffer) => {
          // Suppress stderr output
        });
  
        this.process.on('close', (code) => {
          if (code !== 0) {
            reject(new Error('Failed to start Packetriot Tunnel'));
          }
        });
  
        setTimeout(() => {
          reject(new Error('Timeout: Failed to start Packetriot Tunnel'));
        }, 10000); // Set a reasonable timeout
      });
    }
  }

  export class BoreDigitalTunnel extends BaseTunnel {
    name = 'BoreDigital';
    preSetupCommands = [];
    preStartCommands = [];
    private server: ChildProcess | null = null;
    private client: ChildProcess | null = null;
  
    async launchTunnel({ port = 8000 }: TunnelOptions): Promise<string> {
      return new Promise((resolve, reject) => {
        this.server = spawn('./bore-server_linux_amd64');
  
        this.server.stderr.on('data', (data) => {
          // Suppress server stderr output
        });
  
        this.server.stdout.on('data', (data) => {
          // Suppress server stdout output
        });
  
        this.server.on('close', (code) => {
          // Suppress server close output
        });
  
        // Wait a bit to ensure the server is up before starting the client
        setTimeout(() => {
          this.client = spawn('./bore_linux_amd64', ['-s', 'bore.digital', '-p', '2200', '-ls', 'localhost', '-lp', port.toString()]);
  
          const handleClientData = (data: Buffer) => {
            const output = data.toString();
            const urlMatch = output.match(/https:\/\/[^\s]+bore\.digital[^\s]*/);
            if (urlMatch) {
              const url = urlMatch[0].trim(); // Remove trailing whitespace
              console.log(`BoreDigital URL: ${url}`);
              resolve(url);
            }
          };
  
          this.client.stderr.on('data', handleClientData);
          this.client.stdout.on('data', handleClientData);
  
          this.client.on('close', (code) => {
            // Suppress client close output
          });
        }, 2000); // Adjust the delay as needed
      });
    }
  
    async stop(): Promise<void> {
      if (this.client) {
        this.client.kill();
      }
      if (this.server) {
        this.server.kill();
      }
      console.log(`Stopped ${this.name} tunnel.`);
    }
  }

  export class LocalhostRunTunnel extends BaseTunnel {
    name = 'LocalhostRun';
    preSetupCommands = [];
    preStartCommands = [];
    private server: ChildProcess | null = null;
    private client: ChildProcess | null = null;

    async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
        return new Promise((resolve, reject) => {
            this.client = spawn('ssh', ['-R', '80:localhost:' + port, 'nokey@localhost.run']);

            this.client.stderr.on('data', (data) => {
                // Suppress client stderr output
            });

            this.client.stdout.on('data', (data) => {
                const output = data.toString();
                const urlMatch = output.match(/https:\/\/[^\s]+\.lhr\.life[^\s]*/);
                if (urlMatch) {
                    const url = urlMatch[0].trim(); // Remove trailing whitespace
                    console.log(`Localhost.run URL: ${url}`);
                    resolve(url);
                }
            });

            this.client.on('close', (code) => {
                // Suppress client close output
                console.log(`LocalhostRun client exited with code ${code}`);
            });
        });
    }

    async stop(): Promise<void> {
        if (this.client) {
            this.client.kill();
        }
        console.log(`Stopped ${this.name} tunnel.`);
    }
}


export class DevTunnel extends BaseTunnel {
  name = 'DevTunnel';
  preSetupCommands = [];
  preStartCommands = [];
  private devtunnel: ChildProcess | null = null;

  async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
      return new Promise((resolve, reject) => {
          this.devtunnel = spawn('devtunnel', ['host', '-p', port.toString()]);

          let urlPrinted = false;
          const urlRegex = /https:\/\/[a-z0-9-]+\.inc1\.devtunnels\.ms(:\d+)?(?!-inspect)/;

          this.devtunnel.stdout.on('data', (data) => {
              const output = data.toString();
              const urlMatch = output.match(urlRegex);
              if (urlMatch && !urlPrinted) {
                  console.log(urlMatch[0]);
                  urlPrinted = true;
                  resolve(urlMatch[0]);
              }
          });

          this.devtunnel.stderr.on('data', (data) => {
              const output = data.toString();
              const urlMatch = output.match(urlRegex);
              if (urlMatch && !urlPrinted) {
                  console.log(urlMatch[0]);
                  urlPrinted = true;
                  resolve(urlMatch[0]);
              }
          });

          this.devtunnel.on('close', (code) => {
              console.log(`devtunnel process exited with code ${code}`);
              if (!urlPrinted) {
                  reject(new Error('Failed to get devtunnel URL'));
              }
          });
      });
  }

  async stop(): Promise<void> {
      if (this.devtunnel) {
          this.devtunnel.kill();
      }
      console.log(`Stopped ${this.name} tunnel.`);
  }
}

export class Btunnel extends BaseTunnel {
  name = 'Btunnel';
  preSetupCommands = [];
  preStartCommands = [];
  private process: ChildProcess | null = null;

  async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      this.process = spawn('./btunnel', ['http', '--port', port.toString(), '-k', 'JDJhJDEyJEYwLnRIUEVRMHEvbGlvczNmMTFSVnVaTEtoOGFObmhScHZNSHN6U3VYTHFGdmxyMWdteUUu'], { shell: true });

      const handleData = (data: Buffer) => {
        const output = data.toString();
        const urlMatch = output.match(/https:\/\/[^\s]+-free\.in\.btunnel\.co\.in/);
        if (urlMatch) {
          const url = urlMatch[0].trim(); // Remove trailing whitespace
          console.log(`Btunnel URL: ${url}`);
          resolve(url);
        }
      };

      this.process.stdout.on('data', handleData);
      this.process.stderr.on('data', handleData);

      this.process.on('close', (code) => {
        console.log(`Btunnel process exited with code ${code}`);
        if (code !== 0) {
          reject(new Error('Failed to start Btunnel'));
        }
      });

      setTimeout(() => {
        reject(new Error('Timeout: Failed to start Btunnel'));
      }, 10000); // Set a reasonable timeout
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
    }
    console.log(`Stopped ${this.name} tunnel.`);
  }
}


export class BeeceptorTunnel extends BaseTunnel {
  name = 'Beeceptor';
  preSetupCommands = [];
  preStartCommands = [];
  private process: ChildProcess | null = null;

  async launchTunnel({ port = 3000 }: TunnelOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      this.process = spawn('beeceptor-cli', ['-p', port.toString()]);

      // Simulate pressing Enter to select the default option
      this.process.stdin.write('\n');

      const handleData = (data: Buffer) => {
        const output = data.toString();
        const urlMatch = output.match(/https:\/\/\S+\.free\.beeceptor\.com/);
        if (urlMatch) {
          const url = urlMatch[0].trim(); // Remove trailing whitespace
          console.log(`Beeceptor URL: ${url}`);
          resolve(url);
        }
      };

      this.process.stderr.on('data', handleData);
      this.process.stdout.on('data', handleData);

      this.process.on('close', (code) => {
        // Suppress process close output
      });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
    }
    console.log(`Stopped ${this.name} tunnel.`);
  }
}

export const tunnelTools: TunnelTool[] = [
  new CloudflareTunnel(),
  new NgrokTunnel(),
  new LocalTunnel(),
  new PagekiteTunnel(),
  new ServeoTunnel(),
  new TelebitTunnel(),
  new BoreTunnel(),
  new LocalxposeTunnel(),
  new ExposeTunnel(),
  new LoopholeTunnel(),
  new PinggyTunnel(),
  new TailscaleTunnel(),
  // new TunnelPyjamas(),
  new ZrokTunnel(),
  new TunwgTunnel(),
  new PacketriotTunnel(),
  // new BoreDigitalTunnel(),
  new LocalhostRunTunnel(),
  new BeeceptorTunnel(),
  new DevTunnel(),
  new Btunnel()
]

// async function executeTool(toolName: string, options: TunnelOptions = { port: 3000, urlPattern: /https:\/\/[^\s]+/ }) {
//   const tool = tunnelTools.find(t => t.name === toolName);
//   if (!tool) {
//     console.error(`Tool ${toolName} not found.`);
//     return;
//   }

//   try {
//     const url = await tool.start(options);
//     console.log(`Executing ${tool.name} Tunnel URL: ${url}`);

//     console.log('Press any key to stop the tunnel...');
//     process.stdin.setRawMode(true);
//     process.stdin.resume();
//     process.stdin.on('data', async () => {
//       await tool.stop();
//       process.stdin.setRawMode(false);
//       process.stdin.pause();
//       console.log('Tunnel stopped.');
//     });
//   } catch (error) {
//     console.error(`Failed to execute tool ${toolName}:`, error);
//   }
// }

async function main() {
  const args = process.argv.slice(2);
  const autoMode = args.includes('--auto');

  if (autoMode) {
    console.log('Running in auto mode...');
    for (const tool of tunnelTools) {
      try {
        console.log(`Testing ${tool.name}...`);
        const url = await tool.start(); 
        console.log(`${tool.name} launched successfully: ${url}`);
        await tool.stop();
      } catch (error) {
        console.error(`${tool.name} failed:`, error);
      }
    }
  } else {
    console.log('Available tools:');
    tunnelTools.forEach((tool, index) => console.log(`${index + 1}. ${tool.name}`));

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.question('Enter the number of the tool to test (or "all" to test all): ', async (input) => {
      if (input.toLowerCase() === 'all') {
        // Run all tests (similar to auto mode)
        for (const tool of tunnelTools) {
          try {
            console.log(`Testing ${tool.name}...`);
            const url = await tool.start();
            console.log(`${tool.name} launched successfully: ${url}`);
            await tool.stop();
          } catch (error) {
            console.error(`${tool.name} failed:`, error);
          }
        }
      } else {
        const toolIndex = parseInt(input) - 1;
        if (toolIndex >= 0 && toolIndex < tunnelTools.length) {
          const tool = tunnelTools[toolIndex];
          try {
            console.log(`Testing ${tool.name}...`);
            const url = await tool.start();
            console.log(`${tool.name} launched successfully: ${url}`);
            await tool.stop();
          } catch (error) {
            console.error(`${tool.name} failed:`, error);
          }
        } else {
          console.log('Invalid input.');
        }
      }
      readline.close();
    });
  }
}

// main();
// executeTool("BoreDigital");


async function executeTool(tool: TunnelTool, options: TunnelOptions = { port: 3000, urlPattern: /https:\/\/[^\s]+/ }): Promise<boolean> {
  try {
    const url = await tool.start(options);
    console.log(`✓ ${tool.name} - URL: ${url}`);
    await tool.stop();
    return true;
  } catch (error) {
    console.error(`✗ ${tool.name} - Error: ${error.message}`);
    return false;
  }
}

async function runAllTools() {
  let successCount = 0;
  let failCount = 0;

  for (const tool of tunnelTools) {
    const success = await executeTool(tool);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\nResults:');
  console.log(`✓ Successful: ${successCount}`);
  console.log(`✗ Failed: ${failCount}`);
  console.log(`Total tools: ${tunnelTools.length}`);
}

// runAllTools();

// executeTool(new BoreDigitalTunnel());
