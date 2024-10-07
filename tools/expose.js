const { spawn } = require('child_process');
const readline = require('readline');

// Start Expose in the background
const expose = spawn('./expose', ['share', 'http://localhost:8000']);

// Create an interface to read the output line by line from stdout
const rlStdout = readline.createInterface({
    input: expose.stdout,
    output: process.stdout,
    terminal: false
});

// Create an interface to read the output line by line from stderr
const rlStderr = readline.createInterface({
    input: expose.stderr,
    output: process.stderr,
    terminal: false
});

// Regular expression to match the expose public URL
const urlRegex = /(https?:\/\/[^\s]+\.sharedwithexpose\.com)/;

// Process each line of output from stdout
rlStdout.on('line', (line) => {
    const urlMatch = line.match(urlRegex);
    if (urlMatch) {
        console.log(urlMatch[0]);
    }
});

// Process each line of output from stderr
rlStderr.on('line', (line) => {
    const urlMatch = line.match(urlRegex);
    if (urlMatch) {
        console.log(urlMatch[0]);
    }
});

// Handle Expose process exit
expose.on('close', (code) => {
    console.log(`Expose process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
