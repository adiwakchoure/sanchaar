const { spawn } = require('child_process');

// Function to share using ngtor
const shareWithNgtor = () => {
    const service = spawn('java', ['-jar', 'ngtor-0.1.0-boot.jar', 'http', '--port=8000']);

    service.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/http:\/\/\S+\.onion/);
        if (match) {
            console.log(match[0]);
        }
    });

    service.stderr.on('data', (data) => {
        // Suppress stderr output
    });

    service.on('close', (code) => {
        // Suppress process exit message
    });
};

// Start sharing with ngtor
shareWithNgtor();