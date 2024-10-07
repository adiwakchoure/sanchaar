const { spawn } = require('child_process');

// Function to share using packetriot
const shareWithPacketriot = () => {
    const service = spawn('pktriot', ['http', '8000']);

    service.stdout.on('data', (data) => {
        const output = data.toString();
        // Updated regex to match the full subdomain format
        const subdomainMatch = output.match(/(\w+-\w+-\d+\.pktriot\.net)/);
        if (subdomainMatch) {
            const fullUrl = `http://${subdomainMatch[1]}`;
            console.log(fullUrl);
        }
    });

    service.stderr.on('data', (data) => {
        // Suppress stderr output
    });

    service.on('close', (code) => {
        // Suppress process exit message
    });
};

// Start sharing with packetriot
shareWithPacketriot();