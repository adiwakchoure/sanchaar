const { spawn } = require('child_process');
const path = require('path');

// Function to share using PageKite
const shareWithPageKite = () => {
    const pythonScript = path.join(__dirname, 'pagekite.py');
    const service = spawn('python3', [pythonScript]);

    service.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output);
        // You can add logic here to extract and display the PageKite URL
    });

    service.stderr.on('data', (data) => {
        console.error(`PageKite Error: ${data}`);
    });

    service.on('close', (code) => {
        console.log(`PageKite process exited with code ${code}`);
    });
};

// Start sharing with PageKite
shareWithPageKite();