interface FlattenedMeasurement {
  // Tool and Run Identification
  toolName: string;
  measurementNumber: number;
  timestamp: string;

  // File Transfer Metrics (one entry per file per measurement)
  fileTransfers: FlattenedFileTransfer[];
  
  // Web Test Metrics (one entry per test per measurement)
  webTests: FlattenedWebTest[];

  // Overall Run Statistics
  totalDuration: number;
  setupDuration: number;
  diagnosticsDuration: number;
  measurementDuration: number;
  
  // Error Tracking
  hasErrors: boolean;
  errorCount: number;
  errors: string[];
}

interface FlattenedFileTransfer {
  // File Identification
  filename: string;
  fileSize: number;
  contentType: string;
  
  // Transfer Performance
  transferSuccess: boolean;
  statusCode: number;
  downloadSpeed: number;  // bytes per second
  uploadSpeed: number;    // bytes per second
  
  // Timing Breakdown (all in ms)
  dnsLookup: number;
  tcpConnection: number;
  tlsHandshake: number;
  timeToFirstByte: number;
  totalTransferTime: number;
  
  // Validation
  hashMatch: boolean;
  sizeMatch: boolean;
  hashCalculationTime: number;
  
  // Error Information
  error?: string;
}

interface FlattenedWebTest {
  url: string;
  statusCode: number;
  downloadSpeed: number;
  uploadSpeed: number;
  
  // Timing Breakdown (all in ms)
  dnsLookup: number;
  tcpConnection: number;
  tlsHandshake: number;
  timeToFirstByte: number;
  totalTime: number;
  
  error?: string;
} 