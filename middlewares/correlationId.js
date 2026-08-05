const { v4: uuidv4 } = require('uuid');

/**
 * Correlation ID Middleware
 * Generates or extracts correlation ID for request tracing
 * - Extracts from X-Correlation-ID header if provided
 * - Generates new UUID if not provided
 * - Attaches to response headers
 * - Stores in res.locals for use in handlers and loggers
 */

/**
 * Express middleware to handle correlation IDs
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function correlationIdMiddleware(req, res, next) {
  // Extract correlation ID from request header or generate new one
  const correlationId =
    req.get('X-Correlation-ID') ||
    req.get('x-correlation-id') ||
    uuidv4();

  // Attach to res.locals for use in handlers and loggers
  res.locals.correlationId = correlationId;

  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}

module.exports = correlationIdMiddleware;
