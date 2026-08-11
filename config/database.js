const { Sequelize } = require('sequelize');
const config = require('./env');
const logger = require('./logger');
const { resetModels } = require('../models');

/**
 * Database Configuration Module
 * Creates and manages Sequelize ORM instance for SQL Server connection
 * - Single instance per process
 * - Connection pooling with configurable min/max
 * - Graceful connection closing on shutdown
 * - No logging of credentials or sensitive data
 */

/**
 * Create Sequelize instance for SQL Server
 */
let sequelize;

async function initializeDatabase() {
  if (sequelize) {
    logger.warn('Database already initialized, returning existing instance');
    return sequelize;
  }

  const dbConfig = config.database;

  // Construct connection string for SQL Server
  // Format: server={host}\{instance};Database={database};...
  sequelize = new Sequelize({
    host: dbConfig.server,
    port: dbConfig.port,
    username: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        instanceName: dbConfig.instanceName,
        encrypt: dbConfig.encrypt,
        trustServerCertificate: dbConfig.trustServerCertificate,
      },
    },
    pool: {
      max: dbConfig.pool.max,
      min: dbConfig.pool.min,
      acquire: dbConfig.pool.acquire,
      idle: dbConfig.pool.idle,
    },
    logging: false, // Disable Sequelize's default logging
    retry: {
      max: 3,
      timeout: 3000,
    },
  });

  try {
    // Test database connection during startup
    await sequelize.authenticate();
    logger.info(`Database connection successful (${config.environment})`);
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    throw new Error(
      'Failed to connect to database. Check your configuration and ensure the database is accessible.',
    );
  }

  return sequelize;
}

/**
 * Get existing Sequelize instance
 * @throws {Error} If database has not been initialized
 */
function getDatabase() {
  if (!sequelize) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return sequelize;
}

/**
 * Close database connection gracefully
 */
async function closeDatabase() {
  if (!sequelize) {
    return;
  }

  try {
    await sequelize.close();
    sequelize = null;
    resetModels();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error(`Error closing database connection: ${error.message}`);
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase,
};
