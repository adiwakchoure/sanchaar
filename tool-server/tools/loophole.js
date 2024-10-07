const { spawn } = require('child_process');
const readline = require('readline');

// Start Loophole in the background
const loophole = spawn('./loophole', ['http', '8000']);

// Create an interface to read the output line by line from stdout
const rlStdout = readline.createInterface({
    input: loophole.stdout,
    output: process.stdout,
    terminal: false
});

// Create an interface to read the output line by line from stderr
const rlStderr = readline.createInterface({
    input: loophole.stderr,
    output: process.stderr,
    terminal: false
});

// Regular expression to match the loophole.site subdomain
const urlRegex = /https:\/\/([a-z0-9]+\.loophole\.site)/;

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

// Handle Loophole process exit
loophole.on('close', (code) => {
    console.log(`Loophole process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
