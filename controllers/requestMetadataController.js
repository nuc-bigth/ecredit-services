const requestMetadataService = require('../services/requestMetadataService');

async function listEnabledStatuses(req, res, next) {
  try {
    const data = await requestMetadataService.listEnabledStatuses();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId: res.locals.correlationId || 'N/A' });
  } catch (error) {
    next(error);
  }
}

async function listEnabledLogTypes(req, res, next) {
  try {
    const data = await requestMetadataService.listEnabledLogTypes();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId: res.locals.correlationId || 'N/A' });
  } catch (error) {
    next(error);
  }
}

async function listEnabledRatings(req, res, next) {
  try {
    const data = await requestMetadataService.listEnabledRatings();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId: res.locals.correlationId || 'N/A' });
  } catch (error) {
    next(error);
  }
}

module.exports = { listEnabledLogTypes, listEnabledRatings, listEnabledStatuses };
