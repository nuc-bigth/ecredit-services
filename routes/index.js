const express = require('express');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Environment-Specific Route Loader
 * Dynamically loads routes based on NODE_ENV
 * - Reads validated NODE_ENV from config
 * - Loads exactly one environment route module
 * - Mounts routes at /{env}/api prefix
 * - Rejects unsupported environments
 */

const router = express.Router();

/**
 * Load environment-specific routes
 * Mounts all routes from the active environment
 */
try {
  const environment = config.environment;
  
  logger.info(`Loading routes for environment: ${environment}`);
  
  // Dynamically require the environment-specific route module
  const envRoutes = require(`./${environment}/index`);
  
  // Mount environment-specific routes at /{env}/api prefix
  router.use(`/${environment}/api`, envRoutes);
  
  logger.info(`Routes mounted at /${environment}/api`);
} catch (error) {
  logger.error(`Failed to load environment routes: ${error.message}`);
  throw error;
}

module.exports = router;
