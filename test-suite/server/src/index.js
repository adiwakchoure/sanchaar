// config.js
const config = {
    port: process.env.PORT || 3000,
    fileSizes: ['500KB', '1MB', '5MB'],
    staticDir: 'static',
    logFormat: 'combined'
};

// server.js
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const morgan = require('morgan');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(morgan(config.logFormat));
app.use(express.static(path.join(__dirname, config.staticDir)));

// Serve index.html from the static directory
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, config.staticDir, 'index.html'));
});

// WebSocket Server
const wss = new WebSocket.Server({ noServer: true });
wss.on('connection', (ws) => {
    console.log('WebSocket connection established');
    ws.on('message', (message) => {
        console.log(`Received message => ${message}`);
        ws.send('pong');
    });
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Routes

app.get('/file_:size', (req, res) => {
    const size = req.params.size;
    const filePath = path.join(__dirname, config.staticDir, `file_${size}`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    const clientIP = req.ip;
    const tcpdumpCommand = `tcpdump -i any dst ${clientIP} -c 1000000 -l`;

    // Start tcpdump
    const tcpdump = exec(tcpdumpCommand);

    let packetCount = 0;

    tcpdump.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        packetCount += lines.length - 1; // Subtract 1 to account for the last empty line
    });

    const fileStream = fs.createReadStream(filePath);

    fileStream.on('end', () => {
        // Stop tcpdump
        tcpdump.kill();

        // Send packet count as a header
        res.setHeader('X-Packet-Count', packetCount.toString());
        res.end();
    });

    fileStream.pipe(res);
});

app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Transfer-Encoding': 'chunked'
    });

    const streamData = () => {
        const chunk = crypto.randomBytes(64 * 1024); // 64KB chunks of random data
        res.write(chunk);

        // Continue streaming indefinitely
        setTimeout(streamData, 100); // Adjust timing as needed
    };

    streamData();
});

// Start the server
server.listen(process.argv[2] || config.port, async () => {
    console.log(`Server running on port ${process.argv[2] || config.port}`);
    await generateFiles();
});

// File generation
async function generateFiles() {
    const staticDir = path.join(__dirname, config.staticDir);
    fs.ensureDirSync(staticDir);
    fs.ensureDirSync(path.join(staticDir, 'images'));
    fs.ensureDirSync(path.join(staticDir, 'videos'));
    fs.ensureDirSync(path.join(staticDir, 'audio'));

    // Generate random files
    config.fileSizes.forEach(size => {
        const filePath = path.join(staticDir, `file_${size}`);
        if (!fs.existsSync(filePath)) {
            const sizeInBytes = parseSize(size);
            const buffer = crypto.randomBytes(sizeInBytes);
            fs.writeFileSync(filePath, buffer);
            console.log(`Generated file: ${filePath}`);
        }
    });

    // Download sample media files if they don't exist
    const sampleFiles = [
        { url: 'https://via.placeholder.com/1200x800', dest: 'images/placeholder-1200x800-1.jpg' },
        { url: 'https://via.placeholder.com/1200x800', dest: 'images/placeholder-1200x800-2.jpg' },
        { url: 'https://media.giphy.com/media/3o6oztQz3PrkGTbgT6/giphy.gif', dest: 'images/sample-gif-1.gif' },
        { url: 'https://media.giphy.com/media/l0Iy5AiU70wH5VePE/giphy.gif', dest: 'images/sample-gif-2.gif' },
        { url: 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4', dest: 'videos/sample-video-1.mp4' },
        { url: 'https://www.w3schools.com/html/mov_bbb.mp4', dest: 'videos/sample-video-2.mp4' },
        { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', dest: 'audio/sample-audio-1.mp3' },
        { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', dest: 'audio/sample-audio-2.mp3' },
    ];

    for (const file of sampleFiles) {
        const destPath = path.join(staticDir, file.dest);
        if (!fs.existsSync(destPath)) {
            try {
                const response = await fetch(file.url);
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(destPath, Buffer.from(buffer));
                console.log(`Downloaded file: ${destPath}`);
            } catch (error) {
                console.error(`Error downloading ${file.url}: ${error.message}`);
            }
        }
    }
}

function parseSize(size) {
    const units = {
        'KB': 1024,
        'MB': 1024 * 1024
    };
    const [value, unit] = size.match(/(\d+)([KM]B)/).slice(1);
    return parseInt(value) * units[unit];
}

// Cleanup function
function cleanup() {
    const staticDir = path.join(__dirname, config.staticDir);
    fs.readdirSync(staticDir).forEach(file => {
        if (file.startsWith('file_')) {
            fs.unlinkSync(path.join(staticDir, file));
            console.log(`Removed file: ${file}`);
        }
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Cleaning up...');
    cleanup();
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('Cleaning up...');
    cleanup();
    process.exit();
});