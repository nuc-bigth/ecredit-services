const logger = require('../config/logger');
const attachmentUpload = require('../middlewares/attachmentUpload');
const attachmentService = require('../services/attachmentService');

function requireUpdater(req) {
  const updatedBy = req.user?.profile?.CODE;
  const employeeId = Number(updatedBy);
  if (Number.isSafeInteger(employeeId)) return employeeId;

  const error = new Error('Authenticated user profile must contain a numeric employee code.');
  error.statusCode = 500;
  error.code = 'INVALID_EMPLOYEE_CODE';
  throw error;
}

function uploadError(error) {
  if (error.code === 'LIMIT_FILE_SIZE') {
    error.statusCode = 400;
    error.code = 'FILE_TOO_LARGE';
    error.message = 'Each attachment must be 10 MB or smaller.';
  } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    error.statusCode = 400;
    error.code = 'INVALID_UPLOAD';
    error.message = 'Use the files field to upload attachments.';
  }
  return error;
}

async function listAttachments(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const data = await attachmentService.listAttachments(req.params.requestId);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).json({ success: true, data, correlationId });
  } catch (error) {
    next(error);
  }
}

function contentDispositionFileName(value) {
  return String(value || 'attachment')
    .replace(/[\r\n"]/g, '_');
}

async function downloadAttachment(req, res, next) {
  try {
    const download = await attachmentService.getAttachmentDownload(req.params.requestId, req.params.attachmentId);
    res.setHeader('Content-Type', download.contentType);
    if (download.contentLength) res.setHeader('Content-Length', download.contentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${contentDispositionFileName(download.originalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    download.stream.on('error', next);
    download.stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

function uploadAttachments(req, res, next) {
  attachmentUpload.array('files')(req, res, async (error) => {
    if (error) {
      next(uploadError(error));
      return;
    }

    try {
      const correlationId = res.locals.correlationId || 'N/A';
      const updatedBy = requireUpdater(req);
      const data = await attachmentService.createAttachments(req.params.requestId, req.files, updatedBy);

      res.status(201).json({ success: true, data, correlationId });
      logger.info('Request attachments uploaded', {
        correlationId,
        route: { method: req.method, path: req.path },
        payload: { requestId: req.params.requestId, count: data.length, updatedBy },
      });
    } catch (uploadFailure) {
      next(uploadFailure);
    }
  });
}

async function deleteAttachment(req, res, next) {
  try {
    const correlationId = res.locals.correlationId || 'N/A';
    const updatedBy = requireUpdater(req);
    await attachmentService.softDeleteAttachment(req.params.requestId, req.params.attachmentId, updatedBy);

    res.status(200).json({ success: true, data: { id: req.params.attachmentId }, correlationId });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  downloadAttachment,
  listAttachments,
  uploadAttachments,
  deleteAttachment,
};
