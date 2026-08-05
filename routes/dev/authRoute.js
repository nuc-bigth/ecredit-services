const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const authController = require('../../controllers/dev/authController');

/**
 * Authentication Route - Dev Environment
 * Endpoints for user authentication and profile
 */

const router = express.Router();

/**
 * GET /dev/api/auth/me
 * Returns authenticated user profile
 * Requires: Valid Microsoft Entra ID access token
 */
router.get('/me', authenticationMiddleware, authController.getCurrentUser);

module.exports = router;
