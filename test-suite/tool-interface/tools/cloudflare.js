const { spawn } = require('child_process');

module.exports = async function cloudflare(port) {
    return new Promise((resolve, reject) => {
        const cloudflareProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);

        cloudflareProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const urlMatch = output.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
            if (urlMatch) {
                resolve(urlMatch[0]);
            }
        });

        cloudflareProcess.stderr.on('data', (data) => {
            console.error(`cloudflared STDERR: ${data}`);
        });

        cloudflareProcess.on('error', (error) => {
            reject(new Error(`Failed to start cloudflared: ${error.message}`));
        });

        cloudflareProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`cloudflared process exited with code ${code}`));
            }
        });
    });
};
