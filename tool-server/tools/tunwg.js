const { spawn } = require('child_process');

// Function to share using tunwg
const shareWithTunwg = () => {
    const service = spawn('./tunwg', ['-p', '8000']);

    service.stderr.on('data', (data) => {
        const output = data.toString();
        // console.log('Received stderr data:', output); // Debugging line
        const urlMatch = output.match(/https?:\/\/[^\s]+tunwg\.com[^\s]*/);
        if (urlMatch) {
            const url = urlMatch[0].trim(); // Remove trailing whitespace
            console.log(url); // Debugging line
        }
    });

    service.stdout.on('data', (data) => {
        // Suppress stdout output
    });

    service.on('close', (code) => {
        console.log(`Process exited with code ${code}`); // Debugging line
    });
};

// Start sharing with tunwg
shareWithTunwg();