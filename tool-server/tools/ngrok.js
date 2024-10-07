const { spawn } = require('child_process');
const http = require('http');
const fetch = require('node-fetch');

// console.log('Starting ngrok...');

// Start ngrok in the background
const ngrok = spawn('ngrok', ['http', '8000']);

// Wait for ngrok to initialize
setTimeout(async () => {
    try {
        // Fetch the public URL from ngrok's local API
        const response = await fetch('http://127.0.0.1:4040/api/tunnels');
        const data = await response.json();
        const ngrokUrl = data.tunnels[0]?.public_url;

        if (ngrokUrl) {
            console.log(`Ngrok public URL: ${ngrokUrl}`);
        } else {
            console.error('Could not retrieve ngrok URL.');
        }
    } catch (error) {
        console.error('Error fetching ngrok URL:', error);
    }
}, 5000); // Adjust the timeout if needed

// Log any ngrok output
ngrok.stdout.on('data', (data) => {
    console.log(`STDOUT: ${data}`);
});

ngrok.stderr.on('data', (data) => {
    console.error(`STDERR: ${data}`);
});

// Handle ngrok process exit
ngrok.on('close', (code) => {
    console.log(`ngrok process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
