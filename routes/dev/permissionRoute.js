const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const permissionController = require('../../controllers/dev/permissionController');

/**
 * Permission Route - Dev Environment
 * Endpoints for the authenticated user's own effective permissions
 */

const router = express.Router();

router.get('/me', authenticationMiddleware, permissionController.getMyPermissions);
router.put('/me', authenticationMiddleware, permissionController.updateMyPermissions);

module.exports = router;
