const { spawn } = require('child_process');

// Start bore in the background
const bore = spawn('bore', ['local', '8000', '--to', 'bore.pub']);

// Log any bore output and extract public URL
bore.stdout.on('data', (data) => {
    const output = data.toString();
    // console.log(`STDOUT: ${output}`);

    const urlMatch = output.match(/bore\.pub:\d+/);
    if (urlMatch) {
        console.log(`http://${urlMatch[0]}`);
    }
});

bore.stderr.on('data', (data) => {
    // console.error(`STDERR: ${data}`);
});

// Handle bore process exit
bore.on('close', (code) => {
    console.log(`bore process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
