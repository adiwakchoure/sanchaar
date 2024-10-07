const { exec } = require('child_process');
const readline = require('readline');

// Start telebit using systemctl
exec('sudo systemctl start telebit', (error, stdout, stderr) => {
    if (error) {
        console.error(`Error starting Telebit: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`Telebit stderr: ${stderr}`);
        return;
    }
    console.log('Telebit started successfully.');
});

// Keep the process running until Enter is pressed
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('Press Enter to stop Telebit...');
rl.on('line', () => {
    exec('sudo systemctl stop telebit', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error stopping Telebit: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Telebit stderr: ${stderr}`);
            return;
        }
        console.log('Telebit stopped successfully.');
        rl.close();
    });
});