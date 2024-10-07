const { spawn } = require('child_process');

let server, client;

// Function to share using bore
const shareWithBore = () => {
    server = spawn('./bore-server_linux_amd64');

    server.stderr.on('data', (data) => {
        // Suppress server stderr output
    });

    server.stdout.on('data', (data) => {
        // Suppress server stdout output
    });

    server.on('close', (code) => {
        // Suppress server close output
    });

    // Wait a bit to ensure the server is up before starting the client
    setTimeout(() => {
        client = spawn('./bore_linux_amd64', ['-s', 'bore.digital', '-p', '2200', '-ls', 'localhost', '-lp', '8000']);

        const handleClientData = (data) => {
            const output = data.toString();
            const urlMatch = output.match(/https:\/\/[^\s]+bore\.digital[^\s]*/);
            if (urlMatch) {
                const url = urlMatch[0].trim(); // Remove trailing whitespace
                console.log(url);
            }
        };

        client.stderr.on('data', handleClientData);
        client.stdout.on('data', handleClientData);

        client.on('close', (code) => {
            // Suppress client close output
        });
    }, 2000); // Adjust the delay as needed
};

// Function to gracefully shut down both server and client
const shutdown = () => {
    if (client) {
        client.kill();
    }
    if (server) {
        server.kill();
    }
};

// Start sharing with bore
shareWithBore();

// Handle graceful shutdown on process exit
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);