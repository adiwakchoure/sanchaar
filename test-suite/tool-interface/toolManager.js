const { runTool } = require('./tools');

async function startTunnel(toolName, port) {
    try {
        const url = await runTool(toolName, port);
        console.log(`Tunnel URL: ${url}`);
    } catch (error) {
        console.error(`Error starting tunnel with ${toolName}: ${error.message}`);
    }
}

// startTunnel('ngrok', 8000);
