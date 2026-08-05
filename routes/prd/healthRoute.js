const express = require('express');
const healthController = require('../../controllers/prd/homeController');

const router = express.Router();
router.get('/live', healthController.getHealthStatus);
router.get('/ready', healthController.getHealthStatus);

module.exports = router;
