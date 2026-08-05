# e-Credit Backend API

Express.js backend service for e-Credit application with:
- Microsoft Entra ID single-tenant authentication
- SQL Server database integration via Sequelize ORM
- Multi-environment support (dev, qas, prd)
- HTTPS with certificate-based security
- Comprehensive logging with daily rotation
- Swagger/OpenAPI 3.x documentation
- Environment-specific route isolation

## Quick Start

### Prerequisites
- Node.js 22.12.0
- SQL Server (clouddb01\dev, clouddb01\qas, or clouddb01\prd)
- HTTPS certificates on UNC paths (\\Cloudapp02\d\Certificates\)
- Service account with read permissions to certificate share

### Installation

```bash
# Install dependencies
npm install

# Verify ESLint configuration
npm run lint
```

### Development

```bash
# Start dev environment (NODE_ENV=dev)
npm run start:dev

# Start with auto-reload (requires nodemon)
npm run dev
```

The API will be available at: `https://localhost:3035/dev/api`

Swagger UI: `https://localhost:3035/dev/api/docs`

### Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch
```

### Linting

```bash
# Check code quality
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

## Environment Configuration

Each environment uses a dedicated `.env` file:

- `.env.dev` - Development configuration
- `.env.qas` - QAS/Staging configuration
- `.env.prd` - Production configuration

**Do not commit .env files to Git** - they are in `.gitignore`

Copy `.env.example` and update with actual values:

```bash
NODE_ENV=dev
PORT=3035
DB_SERVER=clouddb01
DB_INSTANCE_NAME=dev
DB_USER=sa
DB_PASSWORD=<actual_password>
# ... other required variables
```

## Available Environments

Start the API for a specific environment:

```bash
npm run start:dev    # PORT 3035, NODE_ENV=dev
npm run start:qas    # PORT 3035, NODE_ENV=qas
npm run start:prd    # PORT 3035, NODE_ENV=prd
```

**Important**: Only routes for the active environment are exposed.

- `NODE_ENV=dev` exposes only `/dev/api/*`
- `NODE_ENV=qas` exposes only `/qas/api/*`
- `NODE_ENV=prd` exposes only `/prd/api/*`

Cross-environment routes return 404.

## API Endpoints

### Public Endpoints

#### GET `/api/home`
Returns API information and status
```json
{
  "success": true,
  "data": {
    "apiName": "e-Credit Express API",
    "environment": "dev",
    "status": "operational"
  },
  "correlationId": "uuid"
}
```

#### GET `/api/health/live`
Liveness probe - indicates if application is running
```json
{
  "success": true,
  "data": { "status": "live", "timestamp": "2026-08-05T10:00:00Z" },
  "correlationId": "uuid"
}
```

#### GET `/api/health/ready`
Readiness probe - indicates if application is ready to handle requests

#### GET `/api/docs`
Swagger UI interface for interactive API exploration

#### GET `/api/docs/openapi.json`
OpenAPI 3.x specification as JSON

### Protected Endpoints (Require Authentication)

#### GET `/api/auth/me`
Returns authenticated user profile
**Header**: `Authorization: Bearer <msal_access_token>`
```json
{
  "success": true,
  "data": {
    "oid": "user-object-id",
    "tid": "tenant-id",
    "email": "user@company.com",
    "displayName": "John Doe",
    "roles": ["admin"]
  },
  "correlationId": "uuid"
}
```

#### GET `/api/session/ping`
Validates session and resets idle timeout
**Header**: `Authorization: Bearer <msal_access_token>`
```json
{
  "success": true,
  "data": { "message": "pong", "timestamp": "2026-08-05T10:00:00Z" },
  "correlationId": "uuid"
}
```

## Authentication

The API uses **Microsoft Entra ID (Azure AD)** with MSAL for authentication.

### Token Requirements

Access tokens must be:
1. Issued for the e-Credit Express API application (client ID: `94ea24c7-b390-4ef8-9f97-c9b4bebe3298`)
2. Requested with scope: `api://94ea24c7-b390-4ef8-9f97-c9b4bebe3298/access_as_user`
3. Valid and not expired
4. Signed with RS256 algorithm
5. From the configured single-tenant (tenant ID: `c5e7210b-25bc-45c8-ad35-0ac4c50ca2f4`)

### Token Validation

The API validates:
- JWT signature (using MSAL public keys)
- Expiration time
- Intended audience
- Issuer
- Tenant ID
- Delegated scope (`access_as_user`)

### Invalid Token Errors

```json
{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_TOKEN",
    "message": "Authentication token is invalid or expired."
  },
  "correlationId": "uuid"
}
```

## HTTPS and Certificates

The API requires HTTPS on port 3035. Certificates are loaded from UNC paths during startup.

### Certificate Configuration

Set in `.env` files:
```
KEY_PATH=\\Cloudapp02\d\Certificates\private.key
CERT_PATH=\\Cloudapp02\d\Certificates\bigth.crt
CA_PATH=\\Cloudapp02\d\Certificates\CA_root.crt
```

### Service Account Permissions

The Windows service account running Node.js must have **read access** to:
- Private key file
- Certificate files
- CA root certificate

Verify permissions:
```powershell
Get-Acl "\\Cloudapp02\d\Certificates\"
```

### Troubleshooting

If certificates cannot be loaded:
1. Verify service account has read permissions
2. Check certificate file paths are correct
3. Ensure certificate files are not corrupted
4. Check Windows firewall allows access to network share

## Database

### SQL Server Configuration

Configured via environment variables:
```
DB_SERVER=clouddb01
DB_INSTANCE_NAME=dev
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=***
DB_NAME=eCredit
DB_ENCRYPT=false (dev), true (qas/prd)
DB_TRUST_SERVER_CERTIFICATE=true (dev), false (qas/prd)
DB_POOL_MIN=2
DB_POOL_MAX=10 (dev/qas), 20 (prd)
```

### Connection Pooling

- Minimum connections: 2 (dev/qas), 5 (prd)
- Maximum connections: 10 (dev/qas), 20 (prd)
- Acquire timeout: 30 seconds
- Idle timeout: 10 seconds

### Database Connection

The app connects to the database during startup. If the connection fails, the application will exit with a fatal error.

To test connectivity:
```bash
npm run start:dev  # Check logs for connection status
```

## Logging

### Log Files

Logs are written to daily-rotating text files in the `logs/` directory:

- `ecredit-dev-YYYY-MM-DD.txt` - Dev application logs
- `ecredit-error-dev-YYYY-MM-DD.txt` - Dev error logs
- `ecredit-qas-YYYY-MM-DD.txt` - QAS application logs
- `ecredit-error-qas-YYYY-MM-DD.txt` - QAS error logs
- `ecredit-prd-YYYY-MM-DD.txt` - PRD application logs
- `ecredit-error-prd-YYYY-MM-DD.txt` - PRD error logs

### Log Format

Logs include:
- Timestamp (ISO 8601)
- Log level (debug, info, warn, error)
- Environment name
- Correlation ID (for request tracing)
- HTTP method and route (for request logs)
- Status code and response time
- Error messages

### Sensitive Data Redaction

The logger automatically redacts:
- Authorization headers
- Access tokens
- Database passwords
- Client secrets
- Certificate contents

Example redacted log:
```
[2026-08-05 10:00:00] [WARN] [dev] [abc-123] POST /dev/api/home - 401 (45ms)
Authorization: ***REDACTED***
access_token: ***REDACTED***
```

### Console Output

- **Development** (`NODE_ENV=dev`): Application logs printed to console (useful for debugging)
- **QAS/PRD** (`NODE_ENV=qas|prd`): No console output (logs to files only)

## API Response Format

All API responses follow a standard envelope:

### Success Response (2xx)
```json
{
  "success": true,
  "data": { /* response-specific data */ },
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Error Response (4xx, 5xx)
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  },
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Correlation ID

All responses include a correlation ID for request tracing. The ID is:
1. Extracted from `X-Correlation-ID` request header (if provided)
2. Generated as a new UUID (if not provided)
3. Included in all response headers and JSON body
4. Logged with all related log entries

Use correlation IDs to trace requests across logs and multiple services.

## Error Codes

Standard error codes returned by the API:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_MISSING_TOKEN` | 401 | Authorization header not provided |
| `AUTH_INVALID_TOKEN` | 401 | Token is invalid or malformed |
| `AUTH_TOKEN_EXPIRED` | 401 | Token has expired |
| `AUTH_INVALID_AUDIENCE` | 401 | Token intended for different API |
| `AUTH_INVALID_ISSUER` | 401 | Token issuer not trusted |
| `AUTH_INVALID_TENANT` | 401 | Token from unauthorized tenant |
| `AUTH_INSUFFICIENT_SCOPE` | 401 | Token missing required scope |
| `FORBIDDEN` | 403 | User lacks required permissions |
| `NOT_FOUND` | 404 | Requested resource not found |
| `VALIDATION_ERROR` | 400 | Request data validation failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Database or external service unavailable |

## Middleware Chain

Requests are processed through this middleware chain:

1. **Helmet** - Security headers (HSTS, CSP, etc.)
2. **Correlation ID** - Generate or extract request ID
3. **CORS** - Cross-origin request validation
4. **JSON Parser** - Parse request body
5. **Rate Limiter** - Protect against abuse (100 req/15min per IP)
6. **Request Logger** - Log incoming requests
7. **Environment Router** - Route to /dev, /qas, or /prd handler
8. **Authentication** - Validate JWT token (if required)
9. **Error Handler** - Catch and format errors

## Project Structure

```
ecredit-services/
├── app.js                          # Express server entry point
├── package.json                    # Dependencies and scripts
├── .env.dev, .env.qas, .env.prd   # Environment configuration
├── .env.example                    # Configuration template
├── .gitignore                      # Git ignore rules
├── .eslintrc.js                    # ESLint configuration
├── .prettierrc.json                # Prettier code formatting
├── jest.config.js                  # Jest testing configuration
│
├── config/                         # Application configuration
│   ├── env.js                      # Environment validation
│   ├── logger.js                   # Winston logger setup
│   ├── database.js                 # Sequelize ORM configuration
│   ├── https.js                    # HTTPS certificate loading
│   └── swagger.js                  # Swagger/OpenAPI configuration
│
├── middlewares/                    # Express middleware
│   ├── correlationId.js            # Request ID middleware
│   ├── requestLogger.js            # Request logging middleware
│   ├── errorHandler.js             # Error handling middleware
│   ├── authentication.js           # JWT validation middleware
│   └── cors.js                     # CORS configuration middleware
│
├── helpers/                        # Utility functions
│   ├── tokenValidator.js           # JWT token validation
│   └── errorCodes.js               # Standard error codes
│
├── models/                         # Sequelize database models
│   ├── user.js                     # User model
│   └── auditLog.js                 # Audit log model
│
├── routes/                         # API routes
│   ├── index.js                    # Environment router loader
│   ├── dev/                        # DEV environment routes
│   │   ├── index.js
│   │   ├── homeRoute.js
│   │   ├── authRoute.js
│   │   ├── sessionRoute.js
│   │   ├── healthRoute.js
│   │   └── docsRoute.js
│   ├── qas/                        # QAS environment routes (same structure)
│   └── prd/                        # PRD environment routes (same structure)
│
├── controllers/                    # Route handlers
│   ├── dev/                        # DEV environment controllers
│   │   ├── homeController.js
│   │   ├── authController.js
│   │   └── sessionController.js
│   ├── qas/                        # QAS environment controllers
│   └── prd/                        # PRD environment controllers
│
├── logs/                           # Application logs (git-ignored)
│   ├── ecredit-dev-*.txt
│   ├── ecredit-error-dev-*.txt
│   ├── ecredit-qas-*.txt
│   └── ecredit-error-qas-*.txt
│
└── tests/                          # Unit and integration tests
    ├── config/
    ├── middlewares/
    ├── controllers/
    └── integration/
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for IIS and Windows service setup.

## Security

See [SECURITY.md](SECURITY.md) for authentication, token validation, and credential management.

## Support

For issues or questions, contact the e-Credit development team.
