const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const { getModels } = require('../models');

const LOG_TYPE_IDS = {
  success: '23556cea-337f-475c-9b6a-830bfa08ab93',
  error: '2d8e6e9d-0b7b-427f-a5ba-0e65f61d945b',
  warning: '69bd78f0-a012-4d47-bfed-4c0abd316877',
  debug: 'e5bcffe9-8d7e-4d30-b828-37de41561f25',
};
const MAX_DESCRIPTION_BYTES = 32 * 1024;

function requestIdFromPath(requestPath) {
  const match = String(requestPath || '').match(/\/requests\/([^/?]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function isEventLogReadRequest(method, requestPath) {
  return (
    String(method).toUpperCase() === 'GET' &&
    /\/requests\/[^/?]+\/event-logs(?:\/[^/?]+)?\/?(?:\?.*)?$/i.test(String(requestPath || ''))
  );
}

function logTypeForStatus(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warning';
  return 'success';
}

function actionFromRequest(method, requestPath) {
  const normalizedPath = String(requestPath || '')
    .replace(/\?.*$/, '')
    .replace(/^\/(?:dev|qas|prd)\/api\/?/i, '');
  const actionPath = normalizedPath
    .replace(/^requests\/[^/]+\/?/i, 'request ')
    .replace(/\//g, ' ')
    .trim();
  return `${method} ${actionPath || 'api request'}`;
}

function categoryFromPath(requestPath) {
  const normalizedPath = String(requestPath || '')
    .replace(/\?.*$/, '')
    .replace(/^\/(?:dev|qas|prd)\/api\/?/i, '');
  const actionPath = normalizedPath
    .replace(/^requests\/[^/]+\/?/i, 'request/')
    .replace(/\//g, '.')
    .replace(/[^a-z0-9._-]/gi, '')
    .replace(/\.+$/, '');
  return `api${actionPath ? `.${actionPath.toLowerCase()}` : ''}`;
}

function uploadedFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.map((file) => ({
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  }));
}

function serializeDescription(payload) {
  const redactedPayload = logger.redactPayload(payload);
  let serialized = JSON.stringify(redactedPayload);
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_DESCRIPTION_BYTES) return serialized;

  const truncatedPayload = {
    correlationId: redactedPayload.correlationId,
    requestId: redactedPayload.requestId,
    actor: redactedPayload.actor,
    request: {
      method: redactedPayload.request.method,
      path: redactedPayload.request.path,
      query: redactedPayload.request.query,
      params: redactedPayload.request.params,
      bodyFields: Object.keys(redactedPayload.request.body || {}),
      files: redactedPayload.request.files,
    },
    response: redactedPayload.response,
    payloadTruncated: true,
  };
  serialized = JSON.stringify(truncatedPayload);

  if (Buffer.byteLength(serialized, 'utf8') <= MAX_DESCRIPTION_BYTES) return serialized;
  return JSON.stringify({
    correlationId: redactedPayload.correlationId,
    requestId: redactedPayload.requestId,
    payloadTruncated: true,
    truncationReason: 'Event payload exceeded the maximum storage size.',
  });
}

function employeeCode(user) {
  const value = Number(user?.profile?.LOGGED_IN_CODE ?? user?.profile?.CODE);
  return Number.isSafeInteger(value) ? value : null;
}

function normalizePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDescription(description) {
  try {
    return JSON.parse(description);
  } catch {
    return { raw: description };
  }
}

function mapEventLog(log, includeDescription = false) {
  const record = log.get ? log.get({ plain: true }) : log;
  const payload = includeDescription ? parseDescription(record.DESCRIPTION) : undefined;
  const employee = record.updatedByEmployee;
  const actor = employee ? `${employee.INITIALS ?? ''}-${employee.USERNAME ?? ''}` : null;

  return {
    id: record.ID,
    name: record.NAME,
    category: record.CATEGORY,
    logTypeId: record.LOG_TYPE_ID,
    createdDate: record.CREATED_DATE,
    createdBy: record.CREATED_BY,
    actor,
    ...(includeDescription ? { payload } : {}),
  };
}

async function assertActiveRequest(requestId) {
  const { Request } = getModels();
  const request = await Request.findOne({
    where: { ID: requestId, ENABLED: true },
    attributes: ['ID'],
  });

  if (!request) {
    const error = new Error(`Request ${requestId} was not found.`);
    error.statusCode = 404;
    error.code = 'RESOURCE_NOT_FOUND';
    throw error;
  }
}

async function listRequestEvents(requestId, query) {
  await assertActiveRequest(requestId);
  const { Employee, Log } = getModels();
  const page = normalizePage(query.page, 1);
  const pageSize = Math.min(normalizePage(query.pageSize, 20), 100);
  const where = { REQUEST_ID: requestId, ENABLED: true };

  if (Object.values(LOG_TYPE_IDS).includes(query.logTypeId)) {
    where.LOG_TYPE_ID = query.logTypeId;
  }

  const { count, rows } = await Log.findAndCountAll({
    where,
    include: [{ model: Employee, as: 'updatedByEmployee', attributes: ['INITIALS', 'USERNAME'], required: false }],
    order: [['CREATED_DATE', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return {
    items: rows.map((log) => mapEventLog(log)),
    pagination: {
      page,
      pageSize,
      totalItems: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
    },
  };
}

async function getRequestEvent(requestId, logId) {
  await assertActiveRequest(requestId);
  const { Employee, Log } = getModels();
  const log = await Log.findOne({
    where: { ID: logId, REQUEST_ID: requestId, ENABLED: true },
    include: [{ model: Employee, as: 'updatedByEmployee', attributes: ['INITIALS', 'USERNAME'], required: false }],
  });

  if (!log) {
    const error = new Error(`Event log ${logId} was not found for request ${requestId}.`);
    error.statusCode = 404;
    error.code = 'RESOURCE_NOT_FOUND';
    throw error;
  }

  return mapEventLog(log, true);
}

async function persistRequestEvent({ req, res, durationMs }) {
  const requestPath = req.originalUrl || req.path;

  if (isEventLogReadRequest(req.method, requestPath)) {
    return;
  }

  const requestId = requestIdFromPath(requestPath);

  const statusCode = res.statusCode;
  const logType = logTypeForStatus(statusCode);
  const actorCode = employeeCode(req.user);

  if (actorCode === null) {
    return;
  }

  const description = serializeDescription({
    correlationId: res.locals.correlationId || 'N/A',
    requestId,
    actor: {
      employeeCode: actorCode,
      displayName: req.user?.displayName || null,
      email: req.user?.email || null,
    },
    request: {
      method: req.method,
      path: requestPath,
      query: req.query,
      params: { requestId },
      body: req.body || {},
      files: uploadedFiles(req.files),
    },
    response: { statusCode, durationMs },
  });

  const { Log } = getModels();
  const databaseNow = Log.sequelize.literal('GETDATE()');
  await Log.create({
    ID: uuidv4(),
    NAME: actionFromRequest(req.method, requestPath),
    DESCRIPTION: description,
    LOG_TYPE_ID: LOG_TYPE_IDS[logType],
    CATEGORY: categoryFromPath(requestPath),
    REQUEST_ID: requestId,
    CREATED_DATE: databaseNow,
    UPDATED_DATE: databaseNow,
    CREATED_BY: actorCode,
    UPDATED_BY: actorCode,
    ENABLED: true,
  });
}

module.exports = {
  LOG_TYPE_IDS,
  getRequestEvent,
  listRequestEvents,
  persistRequestEvent,
  requestIdFromPath,
  serializeDescription,
};
