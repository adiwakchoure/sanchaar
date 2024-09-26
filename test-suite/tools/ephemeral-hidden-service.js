const { exec, spawn } = require('child_process');

// Function to check if Tor is running and start it if not
const ensureTorRunning = (callback) => {
    exec('pgrep tor', (error, stdout, stderr) => {
        if (error) {
            console.log('Tor is not running. Starting Tor...');
            exec('service tor start', (startError, startStdout, startStderr) => {
                if (startError) {
                    console.error(`Error starting Tor: ${startError.message}`);
                    return;
                }
                console.log('Tor started successfully.');
                callback();
            });
        } else {
            console.log('Tor is already running.');
            callback();
        }
    });
};

// Function to bring up the ephemeral hidden service
const startEphemeralHiddenService = () => {
    const service = spawn('ephemeral-hidden-service', ['-lp', '8000'], { stdio: 'inherit' });

    service.on('close', (code) => {
        console.log(`ephemeral-hidden-service process exited with code ${code}`);
    });
};

// Ensure Tor is running, then start the ephemeral hidden service
ensureTorRunning(() => {
    console.log('Starting ephemeral hidden service...');
    startEphemeralHiddenService();
});