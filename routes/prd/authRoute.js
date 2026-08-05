const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const authController = require('../../controllers/prd/authController');

const router = express.Router();
router.get('/me', authenticationMiddleware, authController.getCurrentUser);

module.exports = router;
