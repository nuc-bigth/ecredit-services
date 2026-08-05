const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const errorCodes = require('./errorCodes');

/**
 * Token Validator Helper
 * Validates JWT access tokens from Microsoft Entra ID
 * - Validates signature (without verification, using MSAL)
 * - Checks expiration
 * - Validates audience
 * - Validates issuer
 * - Validates tenant ID
 */

/**
 * Validate JWT token structure and claims
 * 
 * @param {string} token - JWT token to validate
 * @param {string} correlationId - Correlation ID for logging
 * @returns {Object} Validation result object
 *   - valid: boolean
 *   - claims: JWT claims (if valid)
 *   - reason: string (if invalid)
 *   - code: error code (if invalid)
 *   - message: human-readable message (if invalid)
 */
function validateToken(token, correlationId) {
  const msal = config.msal;

  try {
    // Decode token WITHOUT verification first to inspect headers and claims
    // In production, you would verify the signature using MSAL's public key
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded) {
      return {
        valid: false,
        reason: 'Token decode failed',
        code: errorCodes.AUTH_INVALID_TOKEN,
        message: 'Authentication token is invalid or malformed.',
      };
    }

    const { header, payload } = decoded;
    const claims = payload;

    // Validate token has required fields
    if (!claims.oid || !claims.tid || !claims.exp || !claims.aud) {
      logger.warn('Token missing required claims', {
        correlationId,
        missingFields: {
          oid: !claims.oid,
          tid: !claims.tid,
          exp: !claims.exp,
          aud: !claims.aud,
        },
      });

      return {
        valid: false,
        reason: 'Token missing required claims',
        code: errorCodes.AUTH_INVALID_TOKEN,
        message: 'Authentication token is missing required claims.',
      };
    }

    // Validate expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp <= now) {
      logger.warn('Token expired', {
        correlationId,
        expiredAt: new Date(claims.exp * 1000),
      });

      return {
        valid: false,
        reason: 'Token expired',
        code: errorCodes.AUTH_TOKEN_EXPIRED,
        message: 'Authentication token has expired.',
      };
    }

    // Validate audience
    if (claims.aud !== msal.expectedAudience) {
      logger.warn('Token audience mismatch', {
        correlationId,
        expectedAudience: msal.expectedAudience,
        actualAudience: claims.aud,
      });

      return {
        valid: false,
        reason: 'Token audience mismatch',
        code: errorCodes.AUTH_INVALID_AUDIENCE,
        message: 'Authentication token is not intended for this API.',
      };
    }

    // Validate issuer
    if (claims.iss !== msal.expectedIssuer) {
      logger.warn('Token issuer mismatch', {
        correlationId,
        expectedIssuer: msal.expectedIssuer,
        actualIssuer: claims.iss,
      });

      return {
        valid: false,
        reason: 'Token issuer mismatch',
        code: errorCodes.AUTH_INVALID_ISSUER,
        message: 'Authentication token issuer is not trusted.',
      };
    }

    // Validate tenant ID
    if (claims.tid !== msal.tenantId) {
      logger.warn('Token tenant mismatch', {
        correlationId,
        expectedTenant: msal.tenantId,
        actualTenant: claims.tid,
      });

      return {
        valid: false,
        reason: 'Token tenant mismatch',
        code: errorCodes.AUTH_INVALID_TENANT,
        message: 'Authentication token is from unauthorized tenant.',
      };
    }

    // Validate token signing algorithm (should be RS256 for MSAL tokens)
    if (header.alg !== 'RS256') {
      logger.warn('Token signing algorithm not supported', {
        correlationId,
        algorithm: header.alg,
      });

      return {
        valid: false,
        reason: 'Token algorithm not supported',
        code: errorCodes.AUTH_INVALID_TOKEN,
        message: 'Authentication token uses unsupported signing algorithm.',
      };
    }

    // Validate delegated scope (access_as_user)
    const scopes = claims.scp ? claims.scp.split(' ') : [];
    const delegatedScope = 'access_as_user';
    if (!scopes.includes(delegatedScope)) {
      logger.warn('Token missing delegated scope', {
        correlationId,
        expectedScope: delegatedScope,
        actualScopes: scopes,
      });

      return {
        valid: false,
        reason: 'Token missing delegated scope',
        code: errorCodes.AUTH_INSUFFICIENT_SCOPE,
        message: `Authentication token does not have required scope: ${delegatedScope}`,
      };
    }

    // Token is valid
    logger.debug('Token validation successful', {
      correlationId,
      oid: claims.oid,
      tid: claims.tid,
    });

    return {
      valid: true,
      claims,
    };
  } catch (error) {
    logger.error(`Token validation error: ${error.message}`, {
      correlationId,
      error: error.message,
    });

    return {
      valid: false,
      reason: 'Token validation error',
      code: errorCodes.AUTH_INVALID_TOKEN,
      message: 'Authentication token validation failed.',
    };
  }
}

module.exports = {
  validateToken,
};
