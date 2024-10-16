// config.js
const config = {
    numRuns: 1,
    numMeasurements: 1,
    // fileSizes: ['100KB', '500KB', '1MB', '5MB', '10MB', '50MB', '100MB'],
    fileSizes: ['100KB', '500KB', '1MB',  '5MB'],
    diagnosticTimeout: 30000,
    websocketTimeout: 5000 // milliseconds
};

// index.js
const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const pino = require('pino');
const { performance } = require('perf_hooks');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { chromium } = require('playwright');

const logger = pino();

function validateInput(url, toolName) {
    if (!url || !toolName) {
        throw new Error('URL and tool name are required');
    }
    try {
        new URL(url);
    } catch (error) {
        throw new Error('Invalid URL provided');
    }
}

const url = process.argv[2];
const toolName = process.argv[3];

validateInput(url, toolName);

    const metrics = {
        downloadTimes: {},
        transferRate: null,
        latency: null,
        jitter: null,
        packetLoss: null,
        connectionEstablishmentTime: null,
        tlsHandshakeTime: null,
        dnsLookupTime: null,
        timeToFirstByte: null,
        totalTime: null,
        loadTime: null,
        domContentLoaded: null,
        timeToInteractive: null,
        firstContentfulPaint: null,
        largestContentfulPaint: null,
        cumulativeLayoutShift: null,
    };

    let diagnostics = {};

async function runTests() {
    try {
        logger.info('Starting network tests');
        const allMetrics = [];
        const startTime = performance.now();

        // Collect diagnostics once
        // await collectNetworkDiagnostics();

        for (let i = 0; i < config.numRuns; i++) {
            logger.info(`Starting run ${i + 1} of ${config.numRuns}`);
            
            for (let j = 0; j < config.numMeasurements; j++) {
                logger.info(`Starting measurement ${j + 1} of ${config.numMeasurements}`);
                
                // Reset metrics for each measurement
                Object.keys(metrics).forEach(key => metrics[key] = null);
                metrics.downloadTimes = {};

                // Measure latency, jitter, and packet loss for each measurement
                await measureLatency();
                await testFileDownloading();
                await testWebSocket();
                await measureWebPerformance();
                
                allMetrics.push(_.cloneDeep(metrics));
            }
        }

        const endTime = performance.now();
        const totalDuration = endTime - startTime;

        // Calculate summary statistics
        const summaryStats = calculateSummaryStats(allMetrics);

        // Combine diagnostics, all metrics, and summary stats
        const results = formatResults(allMetrics, summaryStats, totalDuration);

        // Create the directory if it doesn't exist
        const resultsDir = path.join('../../testbed/results');
        // const resultsDir = path.join('../../testbed/results', toolName);
        fs.mkdirSync(resultsDir, { recursive: true });

        // Save combined results to a file
        const resultsFile = path.join(resultsDir, `${Date.now()}_${toolName}.json`);
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        logger.info(`All tests completed and results saved to ${resultsFile}`);
    } catch (error) {
        logger.error(`Error during tests: ${error.message}`);
    }
}

function calculateSummaryStats(allMetrics) {
    const summaryStats = {};
    
    for (const key of Object.keys(metrics)) {
        if (key === 'downloadTimes') {
            summaryStats.downloadTimes = {};
            for (const size of config.fileSizes) {
                const axiosTimes = allMetrics.map(m => m.downloadTimes[`axios_${size}`]).filter(v => v !== null);
                const curlTimes = allMetrics.map(m => m.downloadTimes[`curl_${size}`]).filter(v => v !== null);
                const curlThroughputs = allMetrics.map(m => m.downloadTimes[`curl_${size}_throughput`]).filter(v => v !== null);
                summaryStats.downloadTimes[`axios_${size}`] = calculateStatistics(axiosTimes);
                summaryStats.downloadTimes[`curl_${size}`] = calculateStatistics(curlTimes);
                summaryStats.downloadTimes[`curl_${size}_throughput`] = calculateStatistics(curlThroughputs);
            }
        } else {
            const values = allMetrics.map(m => m[key]).filter(v => v !== null);
            if (values.length > 0) {
                summaryStats[key] = calculateStatistics(values);
            }
        }
    }
    
    return summaryStats;
}

function calculateStatistics(values) {
    return {
        mean: _.mean(values),
        min: _.min(values),
        max: _.max(values),
    };
}

function formatResults(allMetrics, summaryStats, totalDuration) {
    return {
        run_id: `${toolName}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        duration: totalDuration,
        total_measurements: allMetrics.length,
        tool: toolName,
        measurements: [
            {
                protocol_id: 'tcp',
                measurements: allMetrics.map((m, index) => ({
                    measurement_id: `measurement_${index + 1}`,
                    url: url,
                    metrics: {
                        download_time: m.downloadTimes,
                        transfer_rate: m.transferRate,
                        latency: m.latency,
                        jitter: m.jitter,
                        packet_loss: m.packetLoss,
                        connection_time: m.connectionEstablishmentTime,
                        tls_handshake_time: m.tlsHandshakeTime,
                        dns_lookup_time: m.dnsLookupTime,
                        time_to_first_byte: m.timeToFirstByte,
                        total_time: m.totalTime,
                        load_time: m.loadTime,
                        dom_content_loaded: m.domContentLoaded,
                        time_to_interactive: m.timeToInteractive,
                        first_contentful_paint: m.firstContentfulPaint,
                        largest_contentful_paint: m.largestContentfulPaint,
                        cumulative_layout_shift: m.cumulativeLayoutShift,
                    },
                    errors: [] // Add error handling logic to populate this
                })),
                diagnostics: diagnostics,
                aggregates: summaryStats
            }
        ]
    };
}

async function testFileDownloading() {
    for (const size of config.fileSizes) {
        const fileUrl = `${url}/file_${size}`;
        try {
            // Axios download
            const axiosStart = performance.now();
            await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const axiosDuration = performance.now() - axiosStart;
            logger.info(`Axios downloaded ${size} in ${axiosDuration} milliseconds`);
            metrics.downloadTimes[`axios_${size}`] = axiosDuration;

            // Curl download with throughput
            const curlCommand = `curl -s -w "%{time_total},%{speed_download}" -o /dev/null ${fileUrl}`;
            const curlResult = await safeExec(curlCommand);
            if (curlResult !== null) {
                const [time, speed] = curlResult.trim().split(',').map(parseFloat);
                const curlDuration = time * 1000; // Convert to milliseconds
                const throughput = speed * 8 / 1024 / 1024; // Convert B/s to Mbps
                logger.info(`Curl downloaded ${size} in ${curlDuration} milliseconds with throughput ${throughput.toFixed(2)} Mbps`);
                metrics.downloadTimes[`curl_${size}`] = curlDuration;
                metrics.downloadTimes[`curl_${size}_throughput`] = throughput;
            } else {
                logger.error(`Error downloading ${size} file with curl`);
                metrics.downloadTimes[`curl_${size}`] = null;
                metrics.downloadTimes[`curl_${size}_throughput`] = null;
            }
        } catch (error) {
            logger.error(`Error downloading ${size} file: ${error.message}`);
            metrics.downloadTimes[`axios_${size}`] = null;
            metrics.downloadTimes[`curl_${size}`] = null;
            metrics.downloadTimes[`curl_${size}_throughput`] = null;
        }
    }
}

async function testWebSocket() {
    const wsUrl = url.replace(/^http/, 'ws');
    const ws = new WebSocket(wsUrl);
    const start = performance.now();

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            logger.warn('WebSocket connection timed out');
            ws.close();
            metrics.connectionEstablishmentTime = null;
            resolve();
        }, config.websocketTimeout);

        ws.on('open', () => {
            clearTimeout(timeout);
            ws.send('ping');
            logger.info('WebSocket connection established');
            metrics.connectionEstablishmentTime = (performance.now() - start);
            ws.close();
            resolve();
        });

        ws.on('message', (message) => {
            logger.info(`WebSocket received: ${message}`);
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            logger.error(`WebSocket error: ${error.message}`);
            metrics.connectionEstablishmentTime = null;
            resolve();
        });
    });
}

async function safeExec(command) {
    try {
        const { stdout } = await exec(command, { timeout: config.diagnosticTimeout });
        return stdout;
    } catch (error) {
        logger.error(`Command execution failed: ${error.message}`);
        return null;
    }
}

async function collectNetworkDiagnostics() {
    const hostname = new URL(url).hostname;
    diagnostics = {};

    logger.info('Running Ping tool');
    diagnostics.ping = await safeExec(`ping -c 10 ${hostname}`);
    logger.info(`Ping tool completed, Result: ${diagnostics.ping !== null ? 'Success' : 'Failed'}`);

    logger.info('Running Traceroute tool');
    diagnostics.traceroute = await safeExec(`traceroute ${hostname}`);
    logger.info(`Traceroute tool completed, Result: ${diagnostics.traceroute !== null ? 'Success' : 'Failed'}`);

    logger.info('Running dig tool');
    diagnostics.dig = await safeExec(`dig +stats ${hostname}`);
    logger.info(`dig tool completed, Result: ${diagnostics.dig !== null ? 'Success' : 'Failed'}`);

    logger.info('Running curl tool');
    diagnostics.curl = await safeExec(`curl -w "\n%{time_namelookup},%{time_connect},%{time_appconnect},%{time_pretransfer},%{time_starttransfer},%{time_total}" -o /dev/null -s ${url}`);
    logger.info(`curl tool completed, Result: ${diagnostics.curl !== null ? 'Success' : 'Failed'}`);

    parseDiagnostics();
}

function parseDiagnostics() {
    if (diagnostics.curl) {
        logger.info('Parsing curl results');
        const [nameLookup, connect, appConnect, preTransfer, startTransfer, total] = diagnostics.curl.trim().split(',').map(parseFloat);
        metrics.dnsLookupTime = nameLookup * 1000;
        metrics.connectionEstablishmentTime = Math.max(0, connect - nameLookup) * 1000;
        metrics.tlsHandshakeTime = Math.max(0, appConnect - connect) * 1000;
        metrics.timeToFirstByte = Math.max(0, startTransfer - appConnect) * 1000;
        metrics.totalTime = total * 1000;
        logger.info(`DNS Lookup: ${metrics.dnsLookupTime}ms, Connection: ${metrics.connectionEstablishmentTime}ms, TLS: ${metrics.tlsHandshakeTime}ms, TTFB: ${metrics.timeToFirstByte}ms, Total: ${metrics.totalTime}ms`);
    }
}

async function measureWebPerformance() {
    logger.info('Measuring web performance metrics');
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle' });
        
        // Collect performance metrics
        const performanceMetrics = await page.evaluate(() => {
            const { loadEventEnd, domContentLoadedEventEnd, domInteractive, requestStart } = performance.timing;
            const navigationEntry = performance.getEntriesByType('navigation')[0];
            const paintEntries = performance.getEntriesByType('paint');
            
            const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
            
            return new Promise((resolve) => {
                let lcpValue = 0;
                let clsValue = 0;
                
                new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    lcpValue = entries[entries.length - 1].startTime;
                }).observe({type: 'largest-contentful-paint', buffered: true});
                
                new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (!entry.hadRecentInput) {
                            clsValue += entry.value;
                        }
                    }
                }).observe({type: 'layout-shift', buffered: true});
                
                // Wait a bit to ensure LCP and CLS are collected
                setTimeout(() => {
                    resolve({
                        loadTime: loadEventEnd - requestStart,
                        domContentLoaded: domContentLoadedEventEnd - requestStart,
                        timeToInteractive: domInteractive - requestStart,
                        firstContentfulPaint: fcpEntry ? fcpEntry.startTime : null,
                        largestContentfulPaint: lcpValue,
                        cumulativeLayoutShift: clsValue,
                        timeToFirstByte: navigationEntry.responseStart - navigationEntry.requestStart,
                   });
                }, 3000);
            });
        });
        
        Object.assign(metrics, performanceMetrics);
        
        logger.info(`Web performance metrics:`, performanceMetrics);
    } catch (error) {
        logger.error(`Error measuring web performance: ${error.message}`);
    } finally {
        await browser.close();
    }
}

async function measureLatency() {
    const hostname = new URL(url).hostname;
    const pingResult = await safeExec(`ping -c 10 ${hostname}`);
    
    if (pingResult) {
        const pingLines = pingResult.split('\n');
        const rttLine = pingLines.find(line => line.includes('rtt min/avg/max/mdev'));
        if (rttLine) {
            const [min, avg, max, mdev] = rttLine.split('=')[1].trim().split('/').map(parseFloat);
            metrics.latency = avg;
            metrics.jitter = mdev;
            logger.info(`Measured latency: ${metrics.latency}ms, jitter: ${metrics.jitter}ms`);
        } else {
            logger.warn('Could not find RTT line in ping results');
        }
        
        const packetLossLine = pingLines.find(line => line.includes('packet loss'));
        if (packetLossLine) {
            const packetLossMatch = packetLossLine.match(/(\d+(?:\.\d+)?)% packet loss/);
            if (packetLossMatch) {
                metrics.packetLoss = parseFloat(packetLossMatch[1]);
                logger.info(`Measured packet loss: ${metrics.packetLoss}%`);
            } else {
                logger.warn('Could not extract packet loss percentage');
            }
        } else {
            logger.warn('Could not find packet loss line in ping results');
        }
    } else {
        logger.warn('No ping results to parse for latency measurement');
    }
}

runTests();