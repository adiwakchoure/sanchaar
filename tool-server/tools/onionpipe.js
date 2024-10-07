const { spawn } = require('child_process');

// Function to share using onionpipe
const shareWithOnionpipe = () => {
    const service = spawn('./onionpipe', ['8000']);

    service.stdout.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');
        lines.forEach(line => {
            if (line.includes('.onion:')) {
                const parts = line.split('>');
                const onionUrl = parts[1].trim();
                console.log(onionUrl);
            }
        });
    });

    service.stderr.on('data', (data) => {
        // Suppress stderr output
    });

    service.on('close', (code) => {
        // Suppress process exit message
    });
};

// Start sharing with onionpipe
shareWithOnionpipe();