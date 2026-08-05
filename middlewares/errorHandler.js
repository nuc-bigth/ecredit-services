const logger = require('../config/logger');
const config = require('../config/env');
const errorCodes = require('../helpers/errorCodes');

/**
 * Centralized Error Handler Middleware
 * Catches and formats all application errors
 * - Standard error response envelope
 * - Sanitized error messages (no stack traces in production)
 * - Logs errors for debugging
 * - Includes correlation ID for tracing
 */

/**
 * Standard error response envelope
 * @param {boolean} success - Indicates success/failure
 * @param {Object} error - Error details
 * @param {string} correlationId - Correlation ID for tracing
 * @returns {Object} Standard API error response
 */
function errorResponse(success, error, correlationId) {
  return {
    success,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An internal error occurred',
    },
    correlationId,
  };
}

/**
 * Express error handler middleware
 * Must be registered AFTER all route handlers
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function (for chaining)
 */
function errorHandlerMiddleware(err, req, res, next) {
  const correlationId = res.locals.correlationId || 'N/A';
  const environment = config.environment;

  // Log error with full context
  logger.error(`Unhandled error: ${err.message}`, {
    correlationId,
    errorCode: err.code || 'INTERNAL_ERROR',
    statusCode: err.statusCode || 500,
    stack: err.stack,
    method: req.method,
    path: req.path,
  });

  // Determine HTTP status code
  let statusCode = err.statusCode || 500;
  if (statusCode < 100 || statusCode > 599) {
    statusCode = 500;
  }

  // Determine error code
  let errorCode = err.code || errorCodes.INTERNAL_ERROR;

  // Sanitize error message based on environment
  let errorMessage = err.message || 'An internal error occurred';

  if (!config.isDevelopment()) {
    // In non-development environments, provide generic messages for 5xx errors
    if (statusCode >= 500) {
      errorMessage = 'An internal server error occurred. Please contact support if this persists.';
    }
  }

  // Build response
  const response = errorResponse(false, {
    code: errorCode,
    message: errorMessage,
  }, correlationId);

  // Set response headers
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Correlation-ID', correlationId);

  // Send response
  res.json(response);
}

module.exports = errorHandlerMiddleware;
