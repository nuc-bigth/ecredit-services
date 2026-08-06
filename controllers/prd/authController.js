const logger = require('../../config/logger');

async function getCurrentUser(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const user = req.user;

    const userProfile = {
      oid: user.oid,
      tid: user.tid,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      profile: user.profile || null,
    };

    const response = {
      success: true,
      data: userProfile,
      correlationId,
    };

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json(response);

    logger.debug(`User profile returned for ${user.oid}`, {
      correlationId,
      oid: user.oid,
    });
  } catch (error) {
    logger.error(`Error in getCurrentUser: ${error.message}`, {
      correlationId: res.locals.correlationId,
      stack: error.stack,
    });
    next(error);
  }
}

async function validateSession(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const user = req.user;

    const response = {
      success: true,
      data: {
        valid: true,
        oid: user.oid,
      },
      correlationId,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error(`Error in validateSession: ${error.message}`, {
      correlationId: res.locals.correlationId,
      stack: error.stack,
    });
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';

    const response = {
      success: true,
      data: {
        message: 'Logout initiated. Clear browser session and tokens.',
      },
      correlationId,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error(`Error in logout: ${error.message}`, {
      correlationId: res.locals.correlationId,
      stack: error.stack,
    });
    next(error);
  }
}

module.exports = {
  getCurrentUser,
  validateSession,
  logout,
};
