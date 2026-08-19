const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const requestController = require('../../controllers/prd/requestController');
const attachmentController = require('../../controllers/prd/attachmentController');
const eventLogController = require('../../controllers/eventLogController');
const requestMetadataController = require('../../controllers/requestMetadataController');

const router = express.Router();

router.get('/', authenticationMiddleware, requestController.listRequests);
router.get('/statuses', authenticationMiddleware, requestMetadataController.listEnabledStatuses);
router.get('/log-types', authenticationMiddleware, requestMetadataController.listEnabledLogTypes);
router.get('/ratings', authenticationMiddleware, requestMetadataController.listEnabledRatings);
router.get('/:requestId/event-logs', authenticationMiddleware, eventLogController.listRequestEvents);
router.get('/:requestId/event-logs/:logId', authenticationMiddleware, eventLogController.getRequestEvent);
router.get('/:requestId/attachments', authenticationMiddleware, attachmentController.listAttachments);
router.post('/:requestId/attachments', authenticationMiddleware, attachmentController.uploadAttachments);
router.get('/:requestId/attachments/:attachmentId/download', authenticationMiddleware, attachmentController.downloadAttachment);
router.delete('/:requestId/attachments/:attachmentId', authenticationMiddleware, attachmentController.deleteAttachment);
router.get('/:id', authenticationMiddleware, requestController.getRequest);
router.patch('/:id/cancel', authenticationMiddleware, requestController.cancelRequest);

module.exports = router;
