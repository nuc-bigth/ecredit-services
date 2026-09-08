const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const requestController = require('../../controllers/qas/requestController');
const cloneRequestData = require('../../controllers/dev/requestController').cloneRequestData;
const updateRequestScoringAndPayment = require('../../controllers/dev/requestController').updateRequestScoringAndPayment;
const attachmentController = require('../../controllers/qas/attachmentController');
const eventLogController = require('../../controllers/eventLogController');
const approvalHistoryController = require('../../controllers/approvalHistoryController');
const requestMetadataController = require('../../controllers/requestMetadataController');

const router = express.Router();

router.get('/', authenticationMiddleware, requestController.listRequests);
router.get('/statuses', authenticationMiddleware, requestMetadataController.listEnabledStatuses);
router.get('/log-types', authenticationMiddleware, requestMetadataController.listEnabledLogTypes);
router.get('/ratings', authenticationMiddleware, requestMetadataController.listEnabledRatings);
router.get('/:requestId/event-logs', authenticationMiddleware, eventLogController.listRequestEvents);
router.get('/:requestId/event-logs/:logId', authenticationMiddleware, eventLogController.getRequestEvent);
router.get('/:requestId/approval-history', authenticationMiddleware, approvalHistoryController.listApprovalHistory);
router.get('/:requestId/attachments', authenticationMiddleware, attachmentController.listAttachments);
router.post('/:requestId/attachments', authenticationMiddleware, attachmentController.uploadAttachments);
router.get('/:requestId/attachments/:attachmentId/download', authenticationMiddleware, attachmentController.downloadAttachment);
router.delete('/:requestId/attachments/:attachmentId', authenticationMiddleware, attachmentController.deleteAttachment);
router.get('/:id', authenticationMiddleware, requestController.getRequest);
router.patch('/:id/customer-info', authenticationMiddleware, requestController.updateRequestCustomerInfo);
router.patch('/:id/scoring-payment', authenticationMiddleware, updateRequestScoringAndPayment);
router.post('/:id/clone-data', authenticationMiddleware, cloneRequestData);
router.patch('/:id/cancel', authenticationMiddleware, requestController.cancelRequest);
router.post('/:id/approval-action', authenticationMiddleware, approvalHistoryController.processApprovalAction);

module.exports = router;
