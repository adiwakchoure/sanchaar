const { spawn } = require('child_process');
const http = require('http');

// console.log('Starting ngrok...');

// Start ngrok in the background
const ngrok = spawn('ngrok', ['http', '8000']);

// Wait for ngrok to initialize
setTimeout(() => {
    try {
        // Fetch the public URL from ngrok's local API using the https module
        const options = {
            hostname: '127.0.0.1',
            port: 4040,
            path: '/api/tunnels',
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';

            // A chunk of data has been received.
            res.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received.
            res.on('end', () => {
                const parsedData = JSON.parse(data);
                const ngrokUrl = parsedData.tunnels[0]?.public_url;

                if (ngrokUrl) {
                    console.log(`Ngrok public URL: ${ngrokUrl}`);
                } else {
                    console.error('Could not retrieve ngrok URL.');
                }
            });
        });

        req.on('error', (error) => {
            console.error('Error fetching ngrok URL:', error);
        });

        req.end();
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
