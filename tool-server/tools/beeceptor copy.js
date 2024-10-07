const { spawn } = require('child_process');

// Start beeceptor-cli in the background
const beeceptor = spawn('beeceptor-cli', ['-p', '8000']);

// Simulate pressing Enter to select the default option
beeceptor.stdin.write('\n');

// Log any beeceptor-cli output and extract public URL
beeceptor.stdout.on('data', (data) => {
    const output = data.toString();
    // console.log(`STDOUT: ${output}`);

    const urlMatch = output.match(/https:\/\/\S+\.free\.beeceptor\.com/);
    if (urlMatch) {
        console.log(`${urlMatch[0]}`);
    }
});

beeceptor.stderr.on('data', (data) => {
    // console.error(`STDERR: ${data}`);
});

// Handle beeceptor-cli process exit
beeceptor.on('close', (code) => {
    console.log(`beeceptor-cli process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();