const logger = require('../config/logger');

/**
 * Request Logger Middleware
 * Logs incoming HTTP requests and outgoing responses
 * - Sanitizes sensitive headers
 * - Logs response timing
 * - Uses centralized logger
 * - Includes correlation ID in all log entries
 */

/**
 * Express middleware to log requests and responses
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requestLoggerMiddleware(req, res, next) {
  const correlationId = res.locals.correlationId || 'N/A';
  const startTime = Date.now();
  const method = req.method;
  const path = req.path;
  const route = { method, path, query: req.query };
  const requestPayload = {
    query: req.query,
    bodyFields: Object.keys(req.body || {}),
  };

  // Log incoming request (development only)
  if (process.env.NODE_ENV === 'dev') {
    logger.debug('Request received', {
      correlationId,
      route,
      payload: {
        ...requestPayload,
        clientIp: req.ip,
      },
    });
  }

  // Capture response finish to log response metadata
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const logLevel = statusCode >= 400 ? 'warn' : 'info';

    logger.log(logLevel, 'Request completed', {
      correlationId,
      route,
      payload: {
        statusCode,
        durationMs: duration,
        clientIp: req.ip,
      },
    });
  });

  next();
}

module.exports = requestLoggerMiddleware;
