const { spawn } = require('child_process');
const readline = require('readline');

// Start Pinggy in the background
const pinggy = spawn('ssh', ['-p', '443', '-R0:localhost:8000', '-L4300:localhost:4300', 'qr@a.pinggy.io']);

// Create an interface to read the output line by line from stdout
const rlStdout = readline.createInterface({
    input: pinggy.stdout,
    output: process.stdout,
    terminal: false
});

// Create an interface to read the output line by line from stderr
const rlStderr = readline.createInterface({
    input: pinggy.stderr,
    output: process.stderr,
    terminal: false
});

// Regular expression to match the Pinggy URL
const urlRegex = /https?:\/\/([a-z0-9-]+\.a\.free\.pinggy\.link)/;

// Process each line of output from stdout
rlStdout.on('line', (line) => {
    const urlMatch = line.match(urlRegex);
    if (urlMatch) {
        console.log(`${urlMatch[0]}`);
    }
});

// Process each line of output from stderr
rlStderr.on('line', (line) => {
    const urlMatch = line.match(urlRegex);
    if (urlMatch) {
        console.log(`${urlMatch[0]}`);
    }
});

// Handle Pinggy process exit
pinggy.on('close', (code) => {
    console.log(`Pinggy process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();