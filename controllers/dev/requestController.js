const { listMockRequests, getMockRequestById, deleteMockRequest } = require('../../helpers/mockRequests');
const logger = require('../../config/logger');

async function listRequests(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const data = listMockRequests(req.query);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId });

    logger.debug('Mock requests returned', {
      correlationId,
      route: { method: req.method, path: req.path },
      payload: { page: data.pagination.page, pageSize: data.pagination.pageSize, totalItems: data.pagination.totalItems },
    });
  } catch (error) {
    logger.error(`Error in listRequests: ${error.message}`, {
      correlationId: res.locals.correlationId,
      route: { method: req.method, path: req.path },
      stack: error.stack,
    });
    next(error);
  }
}

async function getRequest(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const request = getMockRequestById(req.params.id);

    if (!request) {
      const error = new Error(`Request ${req.params.id} was not found.`);
      error.statusCode = 404;
      error.code = 'RESOURCE_NOT_FOUND';
      throw error;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data: request, correlationId });

    logger.debug('Mock request returned', {
      correlationId,
      route: { method: req.method, path: req.path },
      payload: { id: request.id },
    });
  } catch (error) {
    logger.error(`Error in getRequest: ${error.message}`, {
      correlationId: res.locals.correlationId,
      route: { method: req.method, path: req.path },
      stack: error.stack,
    });
    next(error);
  }
}

async function deleteRequest(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const deleted = deleteMockRequest(req.params.id);

    if (!deleted) {
      const error = new Error(`Request ${req.params.id} was not found.`);
      error.statusCode = 404;
      error.code = 'RESOURCE_NOT_FOUND';
      throw error;
    }

    res.status(200).json({ success: true, data: { id: req.params.id }, correlationId });

    logger.debug('Mock request deleted', {
      correlationId,
      route: { method: req.method, path: req.path },
      payload: { id: req.params.id },
    });
  } catch (error) {
    logger.error(`Error in deleteRequest: ${error.message}`, {
      correlationId: res.locals.correlationId,
      route: { method: req.method, path: req.path },
      stack: error.stack,
    });
    next(error);
  }
}

module.exports = { listRequests, getRequest, deleteRequest };