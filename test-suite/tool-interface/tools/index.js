const ngrok = require('./ngrok');
const cloudflare = require('./cloudflare');

const tools = {
    ngrok,
    cloudflare,
};

async function runTool(toolName, port) {
    if (!tools[toolName]) {
        throw new Error(`Tool "${toolName}" not found.`);
    }
    return await tools[toolName](port);
}

module.exports = { runTool };
