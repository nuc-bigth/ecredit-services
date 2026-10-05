const customerLogService = require('../services/customerLogService');

async function listCustomerLogs(req, res, next) {
  try {
    const data = await customerLogService.listCustomerLogs(req.params.id, req.query);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId: res.locals.correlationId || 'N/A' });
  } catch (error) {
    next(error);
  }
}

async function getCustomerLog(req, res, next) {
  try {
    const data = await customerLogService.getCustomerLog(req.params.id, req.params.logId);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId: res.locals.correlationId || 'N/A' });
  } catch (error) {
    next(error);
  }
}

module.exports = { getCustomerLog, listCustomerLogs };
