const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const userController = require('../../controllers/qas/userController');
const router = express.Router();
router.get('/', authenticationMiddleware, userController.listUsers);
router.patch('/:code/system-active', authenticationMiddleware, userController.updateSystemActive);
router.put('/:code/view-as', authenticationMiddleware, userController.setViewAs);
router.delete('/view-as', authenticationMiddleware, userController.clearViewAs);
module.exports = router;
