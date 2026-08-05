const logger = require('../../config/logger');

async function ping(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const user = req.user;

    const response = {
      success: true,
      data: {
        message: 'pong',
        timestamp: new Date().toISOString(),
      },
      correlationId,
    };

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json(response);

    logger.debug(`Session ping from ${user.oid}`, {
      correlationId,
      oid: user.oid,
    });
  } catch (error) {
    logger.error(`Error in ping: ${error.message}`, {
      correlationId: res.locals.correlationId,
      stack: error.stack,
    });
    next(error);
  }
}

module.exports = {
  ping,
};
