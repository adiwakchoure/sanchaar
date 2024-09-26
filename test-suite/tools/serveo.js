const { spawn } = require('child_process');

let urlPrinted = false; // Flag to check if URL has been printed

// Start ssh with Serveo in the background
const serveo = spawn('ssh', ['-R', '80:localhost:8000', 'serveo.net']);

// Log any Serveo output and extract public URL
serveo.stdout.on('data', (data) => {
    const output = data.toString();
    // console.log(`STDOUT: ${output}`);

    if (!urlPrinted) {
        const urlMatch = output.match(/https:\/\/\S+\.serveo\.net/);
        if (urlMatch) {
            console.log(`${urlMatch[0]}`);
            urlPrinted = true; // Set flag to true after printing URL
        }
    }
});

serveo.stderr.on('data', (data) => {
    // console.error(`STDERR: ${data}`);
});

// Handle Serveo process exit
serveo.on('close', (code) => {
    console.log(`Serveo process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();