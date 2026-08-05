const express = require('express');
const homeController = require('../../controllers/dev/homeController');

/**
 * Home Route - Dev Environment
 * Public endpoint for basic health and API information
 */

const router = express.Router();

/**
 * GET /dev/api/home
 * Returns basic API information
 * No authentication required
 */
router.get('/', homeController.getHome);

module.exports = router;
