const eventLogService = require('../services/eventLogService');

async function listRequestEvents(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const data = await eventLogService.listRequestEvents(req.params.requestId, req.query);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId });
  } catch (error) {
    next(error);
  }
}

async function getRequestEvent(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const data = await eventLogService.getRequestEvent(req.params.requestId, req.params.logId);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId });
  } catch (error) {
    next(error);
  }
}

module.exports = { getRequestEvent, listRequestEvents };
