const express = require('express');
const authenticationMiddleware = require('../../middlewares/authentication');
const customerController = require('../../controllers/prd/customerController');

const router = express.Router();

router.get('/', authenticationMiddleware, customerController.listCustomers);
router.get('/sizes', authenticationMiddleware, customerController.listEnabledSizes);
router.get('/:id', authenticationMiddleware, customerController.getCustomer);
router.patch('/:id', authenticationMiddleware, customerController.updateCustomer);
router.delete('/:id', authenticationMiddleware, customerController.deleteCustomer);

module.exports = router;
