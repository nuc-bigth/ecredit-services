const logger = require('../../config/logger');
const requestService = require('../../services/requestService');

async function listRequests(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const data = await requestService.listRequests(req.query);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId });

    logger.debug('Requests returned', {
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
    const request = await requestService.getRequestById(req.params.id);

    if (!request) {
      const error = new Error(`Request ${req.params.id} was not found.`);
      error.statusCode = 404;
      error.code = 'RESOURCE_NOT_FOUND';
      throw error;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data: request, correlationId });

    logger.debug('Request returned', {
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
    const updatedBy = req.user?.profile?.CODE;
    if (!updatedBy) {
      const error = new Error('Authenticated user profile is missing an employee code.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    const deleted = await requestService.softDeleteRequest(req.params.id, updatedBy);

    if (!deleted) {
      const error = new Error(`Request ${req.params.id} was not found.`);
      error.statusCode = 404;
      error.code = 'RESOURCE_NOT_FOUND';
      throw error;
    }

    res.status(200).json({ success: true, data: { id: req.params.id }, correlationId });

    logger.debug('Request soft deleted', {
      correlationId,
      route: { method: req.method, path: req.path },
      payload: { id: req.params.id, updatedBy },
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
