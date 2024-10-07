const { spawn } = require('child_process');
const readline = require('readline');

// Start devtunnel in the background
const devtunnel = spawn('devtunnel', ['host', '-p', '8000']);

// Create an interface to read the output line by line from stdout
const rlStdout = readline.createInterface({
    input: devtunnel.stdout,
    output: process.stdout,
    terminal: false
});

// Create an interface to read the output line by line from stderr
const rlStderr = readline.createInterface({
    input: devtunnel.stderr,
    output: process.stderr,
    terminal: false
});

let urlPrinted = false;

// Regular expression to match the devtunnel URL
const urlRegex = /https:\/\/[a-z0-9-]+\.inc1\.devtunnels\.ms(:\d+)?(?!-inspect)/;

// Process each line of output from stdout
rlStdout.on('line', (line) => {
    if (!urlPrinted) {
        const urlMatch = line.match(urlRegex);
        if (urlMatch) {
            console.log(urlMatch[0]);
            urlPrinted = true;
        }
    }
});

// Process each line of output from stderr
rlStderr.on('line', (line) => {
    if (!urlPrinted) {
        const urlMatch = line.match(urlRegex);
        if (urlMatch) {
            console.log(urlMatch[0]);
            urlPrinted = true;
        }
    }
});

// Handle devtunnel process exit
devtunnel.on('close', (code) => {
    console.log(`devtunnel process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
