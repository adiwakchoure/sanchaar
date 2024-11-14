const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');

const PORT = 3000;
const FILE_PATH = path.join(__dirname, 'test-file.dat');

// Middleware to check if file exists
app.use('/test-file', (req, res, next) => {
    if (!fs.existsSync(FILE_PATH)) {
        console.error('Test file not found!');
        return res.status(500).send('Test file missing');
    }
    next();
});

app.get('/test-file', (req, res) => {
    res.sendFile(FILE_PATH, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            res.status(500).send('Error serving file');
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    if (fs.existsSync(FILE_PATH)) {
        res.status(200).send('OK');
    } else {
        res.status(500).send('Test file missing');
    }
});

app.listen(PORT, () => {
    console.log(`Express server running on port ${PORT}`);
    console.log(`Test file size: ${fs.statSync(FILE_PATH).size / 1024 / 1024} MB`);
});
