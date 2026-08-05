const express = require('express');
const homeController = require('../../controllers/qas/homeController');

const router = express.Router();
router.get('/', homeController.getHome);

module.exports = router;
