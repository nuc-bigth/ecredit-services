const fs = require('fs');
const https = require('https');
const config = require('./env');
const logger = require('./logger');

/**
 * HTTPS Configuration Module
 * Loads SSL/TLS certificates from configured paths
 * - Reads certificate files during startup only
 * - Sanitizes error messages (no path exposure)
 * - Creates HTTPS server options
 * - Does not log certificate contents
 */

/**
 * Check if file exists and is readable
 * @param {string} filePath - Path to file
 * @param {string} fileType - Type of file (for error messages)
 * @throws {Error} If file does not exist or is not readable
 */
function validateFilePath(filePath, fileType) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`${fileType} file not found`);
    }
    // Test read access
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error) {
    throw new Error(
      `Cannot read ${fileType}. Ensure the file exists and the service account has read permissions. Error: ${error.message}`
    );
  }
}

/**
 * Load HTTPS certificate files
 * Reads key, certificate, and CA certificate from configured paths
 * 
 * @returns {Object} Object with key, cert, ca properties for https.createServer
 * @throws {Error} If certificate files cannot be read
 */
function loadHttpsCertificates() {
  const httpsConfig = config.https;
  const keyPath = httpsConfig.keyPath;
  const certPath = httpsConfig.certPath;
  const caPath = httpsConfig.caPath;

  try {
    // Validate all certificate paths exist and are readable
    validateFilePath(keyPath, 'Private key');
    validateFilePath(certPath, 'Certificate');
    validateFilePath(caPath, 'CA certificate');

    logger.info('Loading HTTPS certificates...');

    // Read certificate files (startup only, not per-request)
    const key = fs.readFileSync(keyPath, 'utf8');
    const cert = fs.readFileSync(certPath, 'utf8');
    const ca = fs.readFileSync(caPath, 'utf8');

    logger.info('HTTPS certificates loaded successfully');

    return {
      key,
      cert,
      ca,
    };
  } catch (error) {
    const sanitizedMessage = error.message
      .replace(/\\\\[^\s]*\\/g, '(path)')
      .replace(/[A-Z]:\\/g, '(path)');

    logger.error(`HTTPS certificate loading failed: ${sanitizedMessage}`);
    throw new Error(sanitizedMessage);
  }
}

/**
 * Create HTTPS server with loaded certificates
 * 
 * @param {Object} app - Express app instance
 * @returns {https.Server} HTTPS server instance
 * @throws {Error} If certificates cannot be loaded
 */
function createHttpsServer(app) {
  try {
    const certificates = loadHttpsCertificates();
    const httpsServer = https.createServer(certificates, app);
    return httpsServer;
  } catch (error) {
    logger.error(`Failed to create HTTPS server: ${error.message}`);
    throw error;
  }
}

module.exports = {
  loadHttpsCertificates,
  createHttpsServer,
};
