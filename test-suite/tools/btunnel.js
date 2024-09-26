const { spawn } = require('child_process');
const readline = require('readline');

// Start btunnel in the background
const btunnel = spawn('./btunnel', ['http', '--port', '8000', '-k', 'JDJhJDEyJEYwLnRIUEVRMHEvbGlvczNmMTFSVnVaTEtoOGFObmhScHZNSHN6U3VYTHFGdmxyMWdteUUu']);

// Create an interface to read the output line by line from stdout
const rlStdout = readline.createInterface({
    input: btunnel.stdout,
    output: process.stdout,
    terminal: false
});

// Create an interface to read the output line by line from stderr
const rlStderr = readline.createInterface({
    input: btunnel.stderr,
    output: process.stderr,
    terminal: false
});

let urlPrinted = false;

// Regular expression to match the btunnel URL
const urlRegex = /https:\/\/[a-z0-9-]+\.in\.btunnel\.co\.in/;

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

// Handle btunnel process exit
btunnel.on('close', (code) => {
    console.log(`btunnel process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
