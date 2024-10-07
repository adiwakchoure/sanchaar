const { spawn } = require('child_process');

// console.log('Starting cloudflared...');

const cloudflared = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8000']);

let output = '';

// Capture stdout and stderr
cloudflared.stdout.on('data', (data) => {
    output += data.toString();
    // console.log(`STDOUT: ${data.toString()}`);
});

cloudflared.stderr.on('data', (data) => {
    const stderrOutput = data.toString();
    output += stderrOutput;
    // console.error(`STDERR: ${stderrOutput}`);

    // Check for URL in the stderr output
    const urlMatch = stderrOutput.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
    if (urlMatch) {
        console.log(`Cloudflare Tunnel URL: ${urlMatch[0]}`);
    }
});

// Log when the process exits
cloudflared.on('close', (code) => {
    console.log(`cloudflared process exited with code ${code}`);
});

// Keep the process running
process.stdin.resume();
