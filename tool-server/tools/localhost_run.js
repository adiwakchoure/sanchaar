const { spawn } = require('child_process');
const readline = require('readline');

// Start localhost.run in the background
const localhostRun = spawn('ssh', ['-R', '80:localhost:8000', 'nokey@localhost.run']);

// Create an interface to read the output line by line from stdout
const rlStdout = readline.createInterface({
    input: localhostRun.stdout,
    output: process.stdout,
    terminal: false
});

// Create an interface to read the output line by line from stderr
const rlStderr = readline.createInterface({
    input: localhostRun.stderr,
    output: process.stderr,
    terminal: false
});

// Regular expression to match the localhost.run URL
const urlRegex = /https:\/\/([a-z0-9-]+\.lhr\.life)/;

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

// Handle localhost.run process exit
localhostRun.on('close', (code) => {
    console.log(`localhost.run process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();