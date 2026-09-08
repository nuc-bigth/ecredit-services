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

async function processApprovalAction(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const updatedBy = Number(req.user?.profile?.CODE);
    const isSystemAdmin = req.user?.profile?.ROLE_ID === 'd854d840-d18c-4a7d-87c1-a9186f8664e5';
    if (!Number.isInteger(updatedBy)) {
      const error = new Error('Authenticated user profile is missing a numeric employee code.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    const request = await requestService.processApprovalAction(
      req.params.id,
      req.body?.action,
      req.body ?? {},
      updatedBy,
      isSystemAdmin,
    );
    res.status(200).json({ success: true, data: request, correlationId });
  } catch (error) {
    next(error);
  }
}

module.exports = { listApprovalHistory, processApprovalAction };
