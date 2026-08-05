const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const sessionController = require('../../controllers/qas/sessionController');

const router = express.Router();
router.get('/ping', authenticationMiddleware, sessionController.ping);

module.exports = router;
