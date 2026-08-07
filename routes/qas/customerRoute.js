const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const customerController = require('../../controllers/qas/customerController');

const router = express.Router();

router.get('/', authenticationMiddleware, customerController.listCustomers);
router.get('/:id', authenticationMiddleware, customerController.getCustomer);
router.delete('/:id', authenticationMiddleware, customerController.deleteCustomer);

module.exports = router;
