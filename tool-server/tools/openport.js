const { spawn } = require('child_process');

// Start openport in the background
const openport = spawn('openport', ['8000']);

// Log any openport output and extract public URL
openport.stdout.on('data', (data) => {
    const output = data.toString();
    // console.log(`STDOUT: ${output}`);

    const urlMatch = output.match(/https:\/\/spr\.openport\.io\/l\/\d+\/\w+/);
    if (urlMatch) {
        console.log(`${urlMatch[0]}`);
    }
});

openport.stderr.on('data', (data) => {
    // console.error(`STDERR: ${data}`);
});

// Handle openport process exit
openport.on('close', (code) => {
    console.log(`openport process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();
