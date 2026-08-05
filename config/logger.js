const winston = require('winston');
const path = require('path');
const fs = require('fs');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('./env');

/**
 * Logger Configuration Module
 * Sets up Winston logger with:
 * - Console transport (dev only)
 * - Daily rotating file transports (all environments)
 * - Token/secret redaction
 * - Correlation ID support
 */

// Ensure logs directory exists
if (!fs.existsSync(config.logging.directory)) {
  fs.mkdirSync(config.logging.directory, { recursive: true });
}

/**
 * List of sensitive fields to redact in logs
 */
const REDACTED_FIELDS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'id_token',
  'refresh_token',
  'client_secret',
  'db_password',
  'password',
  'secret',
];

const CONSOLE_COLORS = {
  info: '\x1b[32m',
  warn: '\x1b[38;5;208m',
  error: '\x1b[31m',
  debug: '\x1b[36m',
};
const CONSOLE_COLOR_RESET = '\x1b[0m';

/**
 * Redact sensitive values from log message
 * @param {string} message - Log message
 * @returns {string} Redacted message
 */
function redactSensitiveData(message) {
  if (typeof message !== 'string') {
    return message;
  }

  let redacted = message;
  REDACTED_FIELDS.forEach((field) => {
    const regex = new RegExp(`(${field}\\s*[:=]\\s*)[^\\s,}]*`, 'gi');
    redacted = redacted.replace(regex, '$1***REDACTED***');
  });
  return redacted;
}

/**
 * Removes sensitive values from structured log payloads without dropping
 * the surrounding context needed to investigate a request.
 */
function redactPayload(value, fieldName = '') {
  const normalizedFieldName = fieldName.toLowerCase();
  if (REDACTED_FIELDS.includes(normalizedFieldName)) {
    return '***REDACTED***';
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactPayload(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactPayload(entry, key)]),
    );
  }

  return typeof value === 'string' ? redactSensitiveData(value) : value;
}

/**
 * Normalizes Winston's extra fields into a stable log schema.
 */
function createLogEntry(info) {
  const {
    timestamp,
    level,
    message,
    correlationId,
    route,
    method,
    path: requestPath,
    stack,
    environment,
    payload,
    ...metadata
  } = info;
  const normalizedRoute = route || (method || requestPath
    ? { method, path: requestPath }
    : undefined
  );

  const logEntry = {
    timestamp,
    env: environment || config.environment,
    level,
    correlationId: correlationId || 'N/A',
    message: redactSensitiveData(message),
  };

  if (normalizedRoute) {
    logEntry.route = redactPayload(normalizedRoute);
  }

  const combinedPayload = {
    ...(payload || {}),
    ...metadata,
  };
  if (Object.keys(combinedPayload).length > 0) {
    logEntry.payload = redactPayload(combinedPayload);
  }

  if (stack && config.isDevelopment()) {
    logEntry.stack = stack;
  }

  return logEntry;
}

function formatReadableEntry(entry) {
  const route = entry.route
    ? ` route=${entry.route.method || ''} ${entry.route.path || ''}`.trimEnd()
    : '';
  const payload = entry.payload
    ? ` payload=${JSON.stringify(entry.payload)}`
    : '';
  const stack = entry.stack ? `\n${entry.stack}` : '';

  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [env=${entry.env}] [correlationId=${entry.correlationId}]${route} ${entry.message}${payload}${stack}`;
}

/**
 * Custom format for log entries
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const entry = createLogEntry(info);
    return formatReadableEntry(entry);
  }),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const entry = createLogEntry(info);
    const color = CONSOLE_COLORS[entry.level] || '';

    return `${color}${formatReadableEntry(entry)}${CONSOLE_COLOR_RESET}`;
  }),
);

/**
 * JSON format for logging (alternative)
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => JSON.stringify(createLogEntry(info))),
);

/**
 * Select format based on environment configuration
 */
const logFormat =
  config.logging.format === 'json' ? jsonFormat : customFormat;

/**
 * Create transports array
 */
const transports = [];

// Console transport: enabled only in development
if (config.isDevelopment()) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    }),
  );
}

// File transports: enabled in all environments
// Main application log
transports.push(
  new DailyRotateFile({
    filename: path.join(config.logging.directory, `ecredit-%environment%-${config.environment}-%date%.txt`),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxDays: '30d',
    level: config.logging.level,
    format: logFormat,
  }),
);

// Error log (only errors and above)
transports.push(
  new DailyRotateFile({
    filename: path.join(config.logging.directory, `ecredit-error-${config.environment}-%date%.txt`),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxDays: '30d',
    level: 'error',
    format: logFormat,
  }),
);

/**
 * Create and export logger instance
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    environment: config.environment,
  },
  transports,
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(config.logging.directory, `ecredit-exceptions-${config.environment}-%date%.txt`),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxDays: '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(config.logging.directory, `ecredit-rejections-${config.environment}-%date%.txt`),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxDays: '30d',
    }),
  ],
});

module.exports = logger;
