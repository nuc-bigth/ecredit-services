const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { getSwaggerSpec } = require('../../config/swagger');

/**
 * Documentation Route - Dev Environment
 * Serves Swagger UI and OpenAPI specification
 */

const router = express.Router();

// Get OpenAPI spec
const swaggerSpec = getSwaggerSpec();

/**
 * GET /dev/api/docs
 * Serves Swagger UI interface
 * No authentication required
 */
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    url: '/dev/api/openapi.json',
  },
}));

/**
 * GET /dev/api/docs/openapi.json
 * Returns OpenAPI 3.x specification as JSON
 * No authentication required
 */
router.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});

module.exports = router;
