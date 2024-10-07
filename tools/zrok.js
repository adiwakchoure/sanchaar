const { spawn } = require('child_process');

// Function to share using zrok
const shareWithZrok = () => {
    const service = spawn('zrok', ['share', 'public', 'http://localhost:8000']);

    service.stdout.on('data', (data) => {
        const output = data.toString();
        const urlMatch = output.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
            const url = urlMatch[0].split('│')[0].trim(); // Remove trailing ││[PUBLIC]
            console.log(url);
        }
    });

    service.stderr.on('data', (data) => {
        // Suppress stderr output
    });

    service.on('close', (code) => {
        // Suppress process exit message
    });
};

// Start sharing with zrok
shareWithZrok();