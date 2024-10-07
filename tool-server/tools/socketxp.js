const { spawn } = require('child_process');

// Start socketxp in the background
const socketxp = spawn('socketxp', ['connect', 'http://localhost:8000']);

// Log any socketxp output and extract public URL
socketxp.stdout.on('data', (data) => {
    const output = data.toString();
    // console.log(`STDOUT: ${output}`);

    const urlMatch = output.match(/https:\/\/\S+\.socketxp\.com/);
    if (urlMatch) {
        console.log(`${urlMatch[0]}`);
    }
});

socketxp.stderr.on('data', (data) => {
    // console.error(`STDERR: ${data}`);
});

// Handle socketxp process exit
socketxp.on('close', (code) => {
    console.log(`socketxp process exited with code ${code}`);
});

// Keep the process alive
process.stdin.resume();