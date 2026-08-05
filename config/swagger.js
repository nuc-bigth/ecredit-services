const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./env');

/**
 * Swagger/OpenAPI Configuration Module
 * Generates OpenAPI 3.x specification for all endpoints
 * - Single-tenant MSAL bearer token authentication
 * - Environment-aware server definitions
 * - No secrets exposed in documentation
 */

/**
 * Base Swagger definition options
 */
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: config.swagger.title,
      description: config.swagger.description,
      version: config.swagger.version,
      contact: {
        name: 'e-Credit Support',
      },
    },
    servers: [
      {
        url: `${config.appBaseUrl}/${config.environment}/api`,
        description: `${config.environment.toUpperCase()} Environment`,
        variables: {
          protocol: {
            default: 'https',
            enum: ['https'],
          },
        },
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Microsoft Entra ID access token issued for the e-Credit Express API. ' +
            `Token must be requested with scope: ${config.msal.apiScope}`,
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Missing or invalid authentication token',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions for this resource',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
            },
          },
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          required: ['success', 'data', 'correlationId'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
              description: 'Indicates whether the request was successful',
            },
            data: {
              type: 'object',
              description: 'Response data payload',
            },
            correlationId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for request tracing',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['success', 'error', 'correlationId'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
              description: 'Indicates request failure',
            },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                  description: 'Machine-readable error code',
                },
                message: {
                  type: 'string',
                  example: 'One or more validation errors occurred',
                  description: 'Human-readable error message (sanitized)',
                },
              },
            },
            correlationId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for request tracing',
            },
          },
        },
        AuthenticatedUser: {
          type: 'object',
          required: ['oid', 'tid', 'email', 'displayName', 'roles'],
          properties: {
            oid: {
              type: 'string',
              format: 'uuid',
              description: 'User object ID from Microsoft Entra ID',
            },
            tid: {
              type: 'string',
              format: 'uuid',
              description: 'Tenant ID from Microsoft Entra ID',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            displayName: {
              type: 'string',
              description: 'User display name',
            },
            roles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Assigned application roles',
            },
          },
        },
        HealthResponse: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['live', 'ready'],
              description: 'Health check status',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp',
            },
          },
        },
      },
    },
    security: [],
    tags: [
      {
        name: 'Public',
        description: 'Endpoints accessible without authentication',
      },
      {
        name: 'Authentication',
        description: 'Endpoints requiring valid authentication token',
      },
      {
        name: 'Session',
        description: 'Session management endpoints',
      },
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
    ],
  },
  apis: [
    // Path patterns for API documentation files
    // Controllers will add detailed endpoint documentation via JSDoc comments
  ],
};

/**
 * Get Swagger/OpenAPI specification
 * Generated by swagger-jsdoc based on JSDoc comments in route files
 * 
 * @returns {Object} OpenAPI 3.x specification object
 */
function getSwaggerSpec() {
  return swaggerJsdoc(options);
}

module.exports = {
  getSwaggerSpec,
  options,
};
