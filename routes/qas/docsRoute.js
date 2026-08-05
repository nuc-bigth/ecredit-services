const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { getSwaggerSpec } = require('../../config/swagger');

const router = express.Router();
const swaggerSpec = getSwaggerSpec();

router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    url: '/qas/api/openapi.json',
  },
}));

router.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});

module.exports = router;
