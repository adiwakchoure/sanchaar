const { exec } = require('child_process');

// Bring up the tunnel
exec('wg-quick up ./tunnel.conf 2>/dev/null', (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }

    // Regular expression to match the tunnel URL
    const urlRegex = /https:\/\/([a-z0-9-]+\.tunnel\.pyjam\.as)/;
    const urlMatch = stdout.match(urlRegex);
    if (urlMatch) {
        console.log(`${urlMatch[0]}`);
    }
});

// Handle process exit and SIGINT (Ctrl+C)
const shutdownTunnel = () => {
    exec('wg-quick down ./tunnel.conf 2>/dev/null', (error, stdout, stderr) => {
        process.exit();
    });
};

process.on('exit', shutdownTunnel);
process.on('SIGINT', shutdownTunnel);

// Keep the process alive
process.stdin.resume();