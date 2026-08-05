const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const requestController = require('../../controllers/prd/requestController');

const router = express.Router();

router.get('/', authenticationMiddleware, requestController.listRequests);

module.exports = router;