const { spawn } = require('child_process');
const readline = require('readline');

// Start LocalXpose in the background
const loclx = spawn('loclx', ['tunnel', 'http', '--to', 'localhost:8000']);

// Create an interface to read the output line by line from stdout
const rlStdout = readline.createInterface({
    input: loclx.stdout,
    output: process.stdout,
    terminal: false
});

// Create an interface to read the output line by line from stderr
const rlStderr = readline.createInterface({
    input: loclx.stderr,
    output: process.stderr,
    terminal: false
});

// Regular expression to match the loclx.io subdomain
const urlRegex = /([a-z0-9]+\.loclx\.io)/;

// Process each line of output from stdout
rlStdout.on('line', (line) => {
    const urlMatch = line.match(urlRegex);
    if (urlMatch) {
        console.log(`https://${urlMatch[0]}`);
    }
});

// Process each line of output from stderr
rlStderr.on('line', (line) => {
    const urlMatch = line.match(urlRegex);
    if (urlMatch) {
        console.log(`https://${urlMatch[0]}`);
    }
});

// Handle LocalXpose process exit
loclx.on('close', (code) => {
    console.log(`LocalXpose process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
