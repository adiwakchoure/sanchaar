const Traceroute = require('nodejs-traceroute');
const readline = require('readline');
const fs = require('fs');

// Set up readline interface for interactive input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to prompt user for a location
function askLocation() {
    return new Promise((resolve) => {
        rl.question('Please enter the domain or IP address to trace: ', (answer) => {
            resolve(answer);
        });
    });
}

// Main function to perform the traceroute and save the output
async function main() {
    try {
        const location = await askLocation();
        const tracer = new Traceroute();
        const result = [];

        tracer
            .on('pid', (pid) => {
                console.log(`pid: ${pid}`);
            })
            .on('destination', (destination) => {
                console.log(`destination: ${destination}`);
                result.push({ type: 'destination', data: destination });
            })
            .on('hop', (hop) => {
                console.log(`hop: ${JSON.stringify(hop)}`);
                result.push({ type: 'hop', data: hop });
            })
            .on('close', (code) => {
                console.log(`close: code ${code}`);
                result.push({ type: 'close', data: code });

                // Save the result to a JSON file
                fs.writeFile('traceroute_result.json', JSON.stringify(result, null, 2), (err) => {
                    if (err) {
                        console.error('Error writing to JSON file:', err);
                    } else {
                        console.log('Traceroute result saved to traceroute_result.json');
                    }
                    // Close readline interface
                    rl.close();
                });
            });

        // Start tracing
        tracer.trace(location);
    } catch (ex) {
        console.log('An error occurred:', ex);
    }
}

main();
