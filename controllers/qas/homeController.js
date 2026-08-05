const config = require('../../config/env');
const logger = require('../../config/logger');

async function getHome(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';

    const response = {
      success: true,
      data: {
        apiName: 'e-Credit Express API',
        environment: config.environment,
        version: config.swagger.version,
        status: 'operational',
        timestamp: new Date().toISOString(),
      },
      correlationId,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error(`Error in getHome: ${error.message}`, {
      correlationId: res.locals.correlationId,
      stack: error.stack,
    });
    next(error);
  }
}

async function getHealthStatus(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';

    const response = {
      success: true,
      data: {
        status: 'live',
        timestamp: new Date().toISOString(),
      },
      correlationId,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error(`Error in getHealthStatus: ${error.message}`, {
      correlationId: res.locals.correlationId,
      stack: error.stack,
    });
    next(error);
  }
}

module.exports = {
  getHome,
  getHealthStatus,
};
