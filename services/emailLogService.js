const { v4: uuidv4 } = require('uuid');
const { Op, literal } = require('sequelize');
const { getModels } = require('../models');
const { formatThaiDateTime } = require('../helpers/thaiDateTime');

const EMAIL_LOG_TYPE_ID = 'email';
const MAX_DESCRIPTION_BYTES = 1024 * 1024;
const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|api[-_]?key)/i;

function sanitizeValue(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[omitted]';
  if (typeof value === 'string' && value.length > 512) {
    if (/^[a-z0-9+/=\r\n]+$/i.test(value) && value.length > 256) return `[base64 omitted: ${value.length} chars]`;
    return `${value.slice(0, 512)}... [truncated]`;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeValue(child, childKey)]));
  }
  return value;
}

function parseDescription(description) {
  try {
    return JSON.parse(description || '{}');
  } catch {
    return { raw: description || '' };
  }
}

function employeeCode(user) {
  const value = Number(user?.profile?.LOGGED_IN_CODE ?? user?.profile?.CODE);
  return Number.isSafeInteger(value) ? value : null;
}

function buildDescription({ status, environment, template, subject, baseSubject, recipients, bcc, model, providerResult, error, resendOf }) {
  const displayPayload = sanitizeValue({
    status,
    environment,
    template,
    subject,
    baseSubject: baseSubject || subject,
    recipients,
    bccCount: Array.isArray(bcc) ? bcc.length : 0,
    providerMessageId: providerResult?.messageId || null,
    providerAccepted: providerResult?.accepted || [],
    providerRejected: providerResult?.rejected || [],
    error: error ? { message: error.message, code: error.code || null } : null,
    resendOf: resendOf || null,
  });
  const displayModel = sanitizeValue(model);
  displayPayload.model = displayModel;
  const rawSendParameters = {
    environment,
    template,
    baseSubject: baseSubject || subject,
    subject,
    recipients,
    bcc,
    model,
  };
  let serializedDisplay = JSON.stringify(displayPayload);
  if (Buffer.byteLength(serializedDisplay, 'utf8') > MAX_DESCRIPTION_BYTES) {
    serializedDisplay = JSON.stringify({ ...displayPayload, model: '[omitted: display payload exceeded storage limit]', payloadTruncated: true });
  }
  return JSON.stringify({ status, resendOf: resendOf || null, sendParameters: rawSendParameters, displayPayload: JSON.parse(serializedDisplay), providerResult: providerResult ? { messageId: providerResult.messageId || null } : null, error: error ? { message: error.message, code: error.code || null } : null });
}

async function createEmailLog(payload) {
  const { Email } = getModels();
  const databaseNow = Email.sequelize.literal('GETDATE()');
  return Email.create({
    ID: uuidv4(),
    NAME: payload.subject,
    DESCRIPTION: buildDescription(payload),
    LOG_TYPE_ID: EMAIL_LOG_TYPE_ID,
    REQUEST_ID: payload.requestId || null,
    CATEGORY: payload.template,
    CREATED_DATE: databaseNow,
    UPDATED_DATE: databaseNow,
    CREATED_BY: employeeCode(payload.user),
    UPDATED_BY: employeeCode(payload.user),
    ENABLED: true,
    SORTING: 0,
  });
}

async function updateEmailLog(emailLog, payload) {
  const { Email } = getModels();
  await emailLog.update({
    DESCRIPTION: buildDescription(payload),
    UPDATED_DATE: Email.sequelize.literal('GETDATE()'),
    UPDATED_BY: employeeCode(payload.user),
  });
  return emailLog;
}

function toEmailSummary(emailLog) {
  const payload = parseDescription(emailLog.DESCRIPTION);
  const displayPayload = payload.displayPayload || payload;
  const employee = emailLog.updatedByEmployee;
  return {
    id: emailLog.ID,
    name: emailLog.NAME,
    category: emailLog.CATEGORY,
    requestId: emailLog.REQUEST_ID,
    actor: employee ? `${employee.INITIALS ?? ''}-${employee.USERNAME ?? ''}` : null,
    status: payload.status || displayPayload.status || 'UNKNOWN',
    template: displayPayload.template || payload.template || emailLog.CATEGORY,
    recipients: displayPayload.recipients || payload.recipients || { to: [], cc: [] },
    providerMessageId: payload.providerResult?.messageId || displayPayload.providerMessageId || payload.providerMessageId || null,
    error: payload.error || null,
    createdDate: formatThaiDateTime(emailLog.CREATED_DATE),
    updatedDate: formatThaiDateTime(emailLog.UPDATED_DATE),
  };
}

async function listEmailLogs(requestId, query = {}) {
  const { Email } = getModels();
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 20, 1), 100);
  const where = { REQUEST_ID: requestId, ENABLED: true };
  const requestedStatus = String(query.status || '').toUpperCase();
  const statusMap = { SUCCESS: 'SENT', SENT: 'SENT', ERROR: 'FAILED', FAILED: 'FAILED', PENDING: 'PENDING' };
  if (statusMap[requestedStatus]) where[Op.and] = [literal(`JSON_VALUE([DESCRIPTION], '$.status') = '${statusMap[requestedStatus]}'`)];
  if (query.search) where[Op.or] = [
    { NAME: { [Op.like]: `%${String(query.search).slice(0, 100)}%` } },
    { CATEGORY: { [Op.like]: `%${String(query.search).slice(0, 100)}%` } },
  ];
  const { Employee } = getModels();
  const result = await Email.findAndCountAll({ where, include: [{ model: Employee, as: 'updatedByEmployee', attributes: ['INITIALS', 'USERNAME'], required: false }], order: [['CREATED_DATE', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize });
  return { items: result.rows.map(toEmailSummary), pagination: { page, pageSize, totalItems: result.count, totalPages: Math.ceil(result.count / pageSize) } };
}

async function getEmailLog(requestId, emailId) {
  const { Email, Employee } = getModels();
  const emailLog = await Email.findOne({ where: { ID: emailId, REQUEST_ID: requestId, ENABLED: true }, include: [{ model: Employee, as: 'updatedByEmployee', attributes: ['INITIALS', 'USERNAME'], required: false }] });
  if (!emailLog) {
    const error = new Error('Email log was not found.');
    error.statusCode = 404;
    throw error;
  }
  const summary = toEmailSummary(emailLog);
  const storedPayload = parseDescription(emailLog.DESCRIPTION);
  return { ...summary, payload: storedPayload.displayPayload || storedPayload };
}

async function findEmailLogs(requestId, emailIds) {
  const { Email } = getModels();
  return Email.findAll({ where: { ID: emailIds, REQUEST_ID: requestId, ENABLED: true } });
}

module.exports = { EMAIL_LOG_TYPE_ID, sanitizeValue, buildDescription, createEmailLog, updateEmailLog, listEmailLogs, getEmailLog, findEmailLogs, toEmailSummary, parseDescription };
