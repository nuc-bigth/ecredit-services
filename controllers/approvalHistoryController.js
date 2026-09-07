const requestService = require('../services/requestService');

async function listApprovalHistory(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const data = await requestService.listApprovalHistory(req.params.requestId);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId });
  } catch (error) {
    next(error);
  }
}

module.exports = { listApprovalHistory };
