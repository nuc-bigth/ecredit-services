const logger = require('../config/logger');
const config = require('../config/env');
const tokenValidator = require('../helpers/tokenValidator');
const errorCodes = require('../helpers/errorCodes');

/**
 * Authentication Middleware
 * Validates JWT access token from Microsoft Entra ID
 * - Validates signature, expiration, audience
 * - Validates issuer and tenant ID
 * - Extracts user context (oid, tid) from token
 * - Shared across all environments (dev, qas, prd)
 */

/**
 * Express middleware for JWT authentication
 * Validates authorization bearer token and extracts user context
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function authenticationMiddleware(req, res, next) {
  const correlationId = res.locals.correlationId || 'N/A';

  try {
    // Extract authorization header
    const authHeader = req.get('Authorization');

    if (!authHeader) {
      logger.warn('Authentication failed: Missing Authorization header', {
        correlationId,
        method: req.method,
        path: req.path,
      });

      return res.status(401).json({
        success: false,
        error: {
          code: errorCodes.AUTH_MISSING_TOKEN,
          message: 'Missing authorization token. Include Authorization: Bearer <token> header.',
        },
        correlationId,
      });
    }

    // Extract bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      logger.warn('Authentication failed: Invalid Authorization header format', {
        correlationId,
        method: req.method,
        path: req.path,
      });

      return res.status(401).json({
        success: false,
        error: {
          code: errorCodes.AUTH_INVALID_TOKEN,
          message: 'Invalid authorization header. Use format: Authorization: Bearer <token>',
        },
        correlationId,
      });
    }

    const token = parts[1];

    // Validate token
    const validation = tokenValidator.validateToken(token, correlationId);

    if (!validation.valid) {
      logger.warn(`Authentication failed: ${validation.reason}`, {
        correlationId,
        method: req.method,
        path: req.path,
        reason: validation.reason,
      });

      return res.status(401).json({
        success: false,
        error: {
          code: validation.code || errorCodes.AUTH_INVALID_TOKEN,
          message: validation.message || 'Authentication token is invalid or expired.',
        },
        correlationId,
      });
    }

    // Attach user context to request object
    req.user = {
      oid: validation.claims.oid,
      tid: validation.claims.tid,
      email: validation.claims.email,
      displayName: validation.claims.name,
      roles: validation.claims.roles || [],
    };

    logger.debug(`Authentication successful for user ${req.user.oid}`, {
      correlationId,
      oid: req.user.oid,
      tid: req.user.tid,
    });

    next();
  } catch (error) {
    logger.error(`Unexpected error in authentication middleware: ${error.message}`, {
      correlationId,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: {
        code: errorCodes.INTERNAL_ERROR,
        message: 'An authentication error occurred. Please try again.',
      },
      correlationId,
    });
  }
}

module.exports = authenticationMiddleware;
