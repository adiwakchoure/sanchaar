const { exec, spawn } = require('child_process');

// Function to reset Tailscale
const resetTailscale = (callback) => {
    exec('tailscale funnel reset', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error resetting Tailscale: ${stderr}`);
            return;
        }
        // console.log('Tailscale reset successfully.');
        callback();
    });
};

// Function to start Tailscale funnel
const startTailscaleFunnel = () => {
    const service = spawn('tailscale', ['funnel', '8000']);

    service.stdout.on('data', (data) => {
        const output = data.toString();
        const urlMatch = output.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
            console.log(`${urlMatch[0]}`);
        }
    });

    service.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    service.on('close', (code) => {
        console.log(`tailscale funnel process exited with code ${code}`);
    });
};

// Reset Tailscale and then start the funnel
// console.log('Resetting Tailscale and starting funnel...');
resetTailscale(startTailscaleFunnel);