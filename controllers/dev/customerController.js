const logger = require('../../config/logger');
const customerService = require('../../services/customerService');

async function listCustomers(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const data = await customerService.listCustomers(req.query);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId });

    logger.debug('Customers returned', {
      correlationId,
      route: { method: req.method, path: req.path },
      payload: { page: data.pagination.page, pageSize: data.pagination.pageSize, totalItems: data.pagination.totalItems },
    });
  } catch (error) {
    logger.error(`Error in listCustomers: ${error.message}`, {
      correlationId: res.locals.correlationId,
      route: { method: req.method, path: req.path },
      stack: error.stack,
    });
    next(error);
  }
}

async function getCustomer(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const customer = await customerService.getCustomerById(req.params.id);

    if (!customer) {
      const error = new Error(`Customer ${req.params.id} was not found.`);
      error.statusCode = 404;
      error.code = 'RESOURCE_NOT_FOUND';
      throw error;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data: customer, correlationId });

    logger.debug('Customer returned', {
      correlationId,
      route: { method: req.method, path: req.path },
      payload: { id: customer.id },
    });
  } catch (error) {
    logger.error(`Error in getCustomer: ${error.message}`, {
      correlationId: res.locals.correlationId,
      route: { method: req.method, path: req.path },
      stack: error.stack,
    });
    next(error);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const updatedBy = req.user?.profile?.CODE;
    if (!updatedBy) {
      const error = new Error('Authenticated user profile is missing an employee code.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    const deleted = await customerService.softDeleteCustomer(req.params.id, updatedBy);

    if (!deleted) {
      const error = new Error(`Customer ${req.params.id} was not found.`);
      error.statusCode = 404;
      error.code = 'RESOURCE_NOT_FOUND';
      throw error;
    }

    res.status(200).json({ success: true, data: { id: req.params.id }, correlationId });

    logger.debug('Customer soft deleted', {
      correlationId,
      route: { method: req.method, path: req.path },
      payload: { id: req.params.id, updatedBy },
    });
  } catch (error) {
    logger.error(`Error in deleteCustomer: ${error.message}`, {
      correlationId: res.locals.correlationId,
      route: { method: req.method, path: req.path },
      stack: error.stack,
    });
    next(error);
  }
}

module.exports = { listCustomers, getCustomer, deleteCustomer };
