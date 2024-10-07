const { spawn } = require('child_process');

module.exports = async function ngrok(port) {
    return new Promise((resolve, reject) => {
        const ngrokProcess = spawn('ngrok', ['http', port]);

        ngrokProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const urlMatch = output.match(/https:\/\/[a-z0-9\-]+\.ngrok\.io/);
            if (urlMatch) {
                resolve(urlMatch[0]);
            }
        });

        ngrokProcess.stderr.on('data', (data) => {
            console.error(`ngrok STDERR: ${data}`);
        });

        ngrokProcess.on('error', (error) => {
            reject(new Error(`Failed to start ngrok: ${error.message}`));
        });

        ngrokProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ngrok process exited with code ${code}`));
            }
        });
    });
};
