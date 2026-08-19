const { Op, fn, col, where } = require('sequelize');
const { getModels } = require('../models');

const QUICK_FILTERS = new Set(['rating', 'limit', 'term']);
const CANCELLED_STATUS_ID = '31d531f4-0420-4db5-aecf-bcfe4a0e8c4a';
const COMPLETED_STATUS_ID = '407e23f9-caf5-4c4a-801d-598cf437d1ae';
const SORT_FIELDS = {
  NO: 'NO',
  CUSTOMER_NAME_TH: 'CUSTOMER_NAME_TH',
  CUSTOMER_NAME_ENG: 'CUSTOMER_NAME_ENG',
  CUSTOMER_SALES_GROUP: 'REQUESTED_SALES_GROUP',
  CRM_NO: 'CRM_NO',
  SUBJECT: 'DESCRIPTION',
  SOLD_TO: 'SOLD_TO',
  SEARCH_TERM: 'SEARCH_TERM',
  REQUESTED_LIMIT: 'REQUESTED_LIMIT_AMOUNT',
  APPROVED_LIMIT: 'APPROVED_LIMIT_AMOUNT',
  UPDATED_DATE: 'UPDATED_DATE',
};

const TEXT_FILTERS = {
  NO: 'NO',
  CUSTOMER_NAME_TH: 'CUSTOMER_NAME_TH',
  CUSTOMER_NAME_ENG: 'CUSTOMER_NAME_ENG',
  CUSTOMER_SALES_GROUP: 'REQUESTED_SALES_GROUP',
  CRM_NO: 'CRM_NO',
  SUBJECT: 'DESCRIPTION',
  SOLD_TO: 'SOLD_TO',
  CUSTOMER_TAX_NO: 'CUSTOMER_TAX_NO',
  SEARCH_TERM: 'SEARCH_TERM',
};

const RELATED_TEXT_FILTERS = {
  REQUESTED_RATING: ['requestedRating', 'NAME'],
  REQUESTED_TERM: ['requestedTerm', 'NAME'],
  APPROVED_RATING: ['approvedRating', 'NAME'],
  APPROVED_TERM: ['approvedTerm', 'NAME'],
  STATUS: ['status', 'NAME'],
};

function normalizePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeQuickFilters(value) {
  const filters = Array.isArray(value) ? value : value ? [value] : [];
  const unsupported = filters.find((filter) => !QUICK_FILTERS.has(filter));

  if (unsupported) {
    const error = new Error(`Unsupported quick filter: ${unsupported}`);
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  return [...new Set(filters)];
}

function nonBlankName(modelAlias) {
  return where(fn('LTRIM', fn('RTRIM', col(`${modelAlias}.NAME`))), { [Op.ne]: '' });
}

function buildWhere(query) {
  const conditions = [{ ENABLED: '1' }];

  const relatedCustomerNo = typeof query.relatedCustomerNo === 'string' ? query.relatedCustomerNo.trim() : '';
  const relatedTaxId = typeof query.relatedTaxId === 'string' ? query.relatedTaxId.trim() : '';
  const relatedCustomerConditions = [];
  if (relatedCustomerNo) relatedCustomerConditions.push({ SOLD_TO: relatedCustomerNo });
  if (relatedTaxId) relatedCustomerConditions.push({ CUSTOMER_TAX_NO: relatedTaxId });
  if (relatedCustomerConditions.length) {
    conditions.push({ [Op.or]: relatedCustomerConditions });
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push({
      [Op.or]: [
        { NO: { [Op.like]: searchPattern } },
        { SOLD_TO: { [Op.like]: searchPattern } },
        { CRM_NO: { [Op.like]: searchPattern } },
        { CUSTOMER_NAME_TH: { [Op.like]: searchPattern } },
        { CUSTOMER_NAME_ENG: { [Op.like]: searchPattern } },
        { CUSTOMER_TAX_NO: { [Op.like]: searchPattern } },
      ],
    });
  }

  Object.entries(TEXT_FILTERS).forEach(([queryKey, column]) => {
    const value = typeof query[queryKey] === 'string' ? query[queryKey].trim() : '';
    if (value) {
      conditions.push({ [column]: { [Op.like]: `%${value}%` } });
    }
  });

  Object.entries(RELATED_TEXT_FILTERS).forEach(([queryKey, [modelAlias, column]]) => {
    const value = typeof query[queryKey] === 'string' ? query[queryKey].trim() : '';
    if (value) {
      conditions.push(where(col(`${modelAlias}.${column}`), { [Op.like]: `%${value}%` }));
    }
  });

  ['REQUESTED_LIMIT', 'APPROVED_LIMIT'].forEach((queryKey) => {
    const value = typeof query[queryKey] === 'string' ? query[queryKey].trim() : '';
    if (!value) {
      return;
    }

    const amount = Number(value);
    if (Number.isFinite(amount)) {
      const column = queryKey === 'REQUESTED_LIMIT' ? 'REQUESTED_LIMIT_AMOUNT' : 'APPROVED_LIMIT_AMOUNT';
      conditions.push({ [column]: amount });
    }
  });

  ['REQUESTED_NAME', 'UPDATED_NAME'].forEach((queryKey) => {
    const value = typeof query[queryKey] === 'string' ? query[queryKey].trim() : '';
    if (value) {
      const modelAlias = queryKey === 'REQUESTED_NAME' ? 'requestedByEmployee' : 'updatedByEmployee';
      conditions.push(
        where(
          fn('CONCAT', col(`${modelAlias}.INITIALS`), '-', col(`${modelAlias}.USERNAME`)),
          { [Op.like]: `%${value}%` },
        ),
      );
    }
  });

  const updatedDate = typeof query.UPDATED_DATE === 'string' ? query.UPDATED_DATE.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(updatedDate)) {
    const start = new Date(`${updatedDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    conditions.push({ UPDATED_DATE: { [Op.gte]: start, [Op.lt]: end } });
  }

  const quickFilters = normalizeQuickFilters(query.quickFilter);
  if (quickFilters.length) {
    const quickConditions = [];

    if (quickFilters.includes('rating')) {
      quickConditions.push(nonBlankName('requestedRating'), nonBlankName('approvedRating'));
    }
    if (quickFilters.includes('limit')) {
      quickConditions.push(
        { REQUESTED_LIMIT_AMOUNT: { [Op.ne]: 0 } },
        { APPROVED_LIMIT_AMOUNT: { [Op.ne]: 0 } },
      );
    }
    if (quickFilters.includes('term')) {
      quickConditions.push(nonBlankName('requestedTerm'), nonBlankName('approvedTerm'));
    }

    conditions.push({ [Op.or]: quickConditions });
  }

  return { [Op.and]: conditions };
}

function buildIncludes(models) {
  const { Rating, Term, Status, Employee } = models;

  return [
    { model: Rating, as: 'existingRating', required: false },
    { model: Rating, as: 'requestedRating', required: false },
    { model: Rating, as: 'approvedRating', required: false },
    { model: Term, as: 'requestedTerm', required: false },
    { model: Term, as: 'approvedTerm', required: false },
    { model: Status, as: 'status', required: false },
    { model: Employee, as: 'requestedByEmployee', required: false },
    { model: Employee, as: 'updatedByEmployee', required: false },
  ];
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isNonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function employeeName(employee) {
  if (!employee || !isNonBlank(employee.INITIALS) || !isNonBlank(employee.USERNAME)) {
    return '';
  }
  return `${employee.INITIALS}-${employee.USERNAME}`;
}

function salesGroupName(code) {
  const salesGroups = {
    100: '100 - TGEE',
    200: '200 - MG',
    300: '300 - PG',
  };

  return salesGroups[code] || 'OTHERS';
}

function formatUpdatedDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '';

  return `${part('day')} ${part('month')} ${part('year')} ${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function mapRequest(request) {
  const existingRating = request.existingRating?.NAME || '';
  const requestedRating = request.requestedRating?.NAME || '';
  const approvedRating = request.approvedRating?.NAME || '';
  const requestedTerm = request.requestedTerm?.NAME || '';
  const approvedTerm = request.approvedTerm?.NAME || '';
  const requestedLimit = toNumber(request.REQUESTED_LIMIT_AMOUNT);
  const approvedLimit = toNumber(request.APPROVED_LIMIT_AMOUNT);

  return {
    id: request.ID,
    NO: request.NO || '',
    CUSTOMER_NAME_TH: request.CUSTOMER_NAME_TH || '',
    CUSTOMER_NAME_ENG: request.CUSTOMER_NAME_ENG || '',
    CUSTOMER_SALES_GROUP: salesGroupName(request.REQUESTED_SALES_GROUP),
    CUSTOMER_SALES_GROUP_CODE: request.REQUESTED_SALES_GROUP || '',
    CRM_NO: request.CRM_NO || '',
    SUBJECT: request.DESCRIPTION || '',
    SOLD_TO: request.SOLD_TO || '',
    CUSTOMER_TAX_NO: request.CUSTOMER_TAX_NO || '',
    SEARCH_TERM: request.SEARCH_TERM || '',
    EXISTING_RATING_ID: request.EXISTING_RATING_ID || '',
    EXISTING_RATING: existingRating,
    REQUESTED_RATING_ID: request.REQUESTED_RATING_ID || '',
    REQUESTED_RATING: requestedRating,
    REQUESTED_LIMIT: requestedLimit,
    REQUESTED_TERM: requestedTerm,
    PROPOSED_VALID_FROM: request.PROPOSED_VALID_FROM || null,
    PROPOSED_VALID_TO: request.PROPOSED_VALID_TO || null,
    APPROVED_RATING: approvedRating,
    APPROVED_LIMIT: approvedLimit,
    APPROVED_TERM: approvedTerm,
    STATUS_ID: request.STATUS_ID || '',
    STATUS: request.status?.NAME || '',
    REQUESTED_NAME: employeeName(request.requestedByEmployee),
    UPDATED_NAME: employeeName(request.updatedByEmployee),
    CREATED_DATE: formatUpdatedDate(request.CREATED_DATE),
    UPDATED_DATE: formatUpdatedDate(request.UPDATED_DATE),
    CUSTOMER_PHONE: request.CUSTOMER_PHONE || '',
    CUSTOMER_FAX: request.CUSTOMER_FAX || '',
    CUSTOMER_REGISTERED_DATE: formatDate(request.CUSTOMER_REGISTERED_DATE),
    CUSTOMER_REGISTERED_CAPITAL_AMOUNT: toNumber(request.CUSTOMER_REGISTERED_CAPITAL_AMOUNT),
    CUSTOMER_SIZE_ID: request.CUSTOMER_SIZE_ID || '',
    CUSTOMER_BUSINESS_TYPE_INTER: request.CUSTOMER_BUSINESS_TYPE_INTER || '',
    CUSTOMER_CUSTOMER_TYPE_INTER: request.CUSTOMER_CUSTOMER_TYPE_INTER || '',
    CUSTOMER_SHAREHOLDERS: request.CUSTOMER_SHAREHOLDERS || '',
    CUSTOMER_DIRECTORS: request.CUSTOMER_DIRECTORS || '',
    CUSTOMER_ADDRESS: request.CUSTOMER_ADDRESS || '',
    IS_RATING_REQUESTED: isNonBlank(requestedRating) ? 1 : 0,
    IS_LIMIT_REQUESTED: requestedLimit !== 0 ? 1 : 0,
    IS_TERM_REQUESTED: isNonBlank(requestedTerm) ? 1 : 0,
    IS_PERMANENT_PROPOSED: Boolean(request.IS_PERMANENT_PROPOSED),
    IS_TEMPORARY_PROPOSED: Boolean(request.IS_TEMPORARY_PROPOSED),
    IS_RATING_APPROVED: isNonBlank(approvedRating) ? 1 : 0,
    IS_LIMIT_APPROVED: approvedLimit !== 0 ? 1 : 0,
    IS_TERM_APPROVED: isNonBlank(approvedTerm) ? 1 : 0,
  };
}

function buildOrder(sort, dir) {
  if (!sort) {
    return [['UPDATED_DATE', 'DESC']];
  }

  const column = SORT_FIELDS[sort];
  if (!column) {
    const error = new Error(`Unsupported sort field: ${sort}`);
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  return [[column, dir === 'desc' ? 'DESC' : 'ASC']];
}

async function listRequests(query) {
  const models = getModels();
  const page = normalizePage(query.page, 1);
  const pageSize = Math.min(normalizePage(query.pageSize, 25), 100);
  const result = await models.Request.findAndCountAll({
    where: buildWhere(query),
    include: buildIncludes(models),
    order: buildOrder(query.sort, query.dir),
    offset: (page - 1) * pageSize,
    limit: pageSize,
    distinct: true,
  });

  return {
    items: result.rows.map(mapRequest),
    pagination: {
      page,
      pageSize,
      totalItems: result.count,
      totalPages: Math.ceil(result.count / pageSize),
    },
  };
}

async function getRequestById(id) {
  const models = getModels();
  const request = await models.Request.findOne({
    where: { ID: id, ENABLED: '1' },
    include: buildIncludes(models),
  });

  if (!request) return null;

  return mapRequest(request);
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function normalizeRequestCustomerInfo(payload) {
  const fields = [
    'CUSTOMER_TAX_NO',
    'CUSTOMER_REGISTERED_DATE',
    'CUSTOMER_REGISTERED_CAPITAL_AMOUNT',
    'CUSTOMER_SIZE_ID',
    'CUSTOMER_BUSINESS_TYPE_INTER',
    'CUSTOMER_CUSTOMER_TYPE_INTER',
    'CUSTOMER_DIRECTORS',
    'CUSTOMER_SHAREHOLDERS',
  ];
  const update = {};

  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) update[field] = payload[field];
  });

  if (!Object.keys(update).length) throw validationError('No request customer fields were supplied.');
  if (typeof update.CUSTOMER_TAX_NO === 'string' && update.CUSTOMER_TAX_NO.length > 13) {
    throw validationError('CUSTOMER_TAX_NO must not exceed 13 characters.');
  }
  if (typeof update.CUSTOMER_SIZE_ID === 'string' && update.CUSTOMER_SIZE_ID.length > 128) {
    throw validationError('CUSTOMER_SIZE_ID must not exceed 128 characters.');
  }
  ['CUSTOMER_BUSINESS_TYPE_INTER', 'CUSTOMER_CUSTOMER_TYPE_INTER', 'CUSTOMER_DIRECTORS', 'CUSTOMER_SHAREHOLDERS'].forEach((field) => {
    if (typeof update[field] === 'string' && update[field].length > 2048) {
      throw validationError(`${field} must not exceed 2048 characters.`);
    }
  });
  if (update.CUSTOMER_REGISTERED_DATE !== undefined && update.CUSTOMER_REGISTERED_DATE !== null && update.CUSTOMER_REGISTERED_DATE !== ''
    && !/^\d{4}-\d{2}-\d{2}$/.test(update.CUSTOMER_REGISTERED_DATE)) {
    throw validationError('CUSTOMER_REGISTERED_DATE must use YYYY-MM-DD.');
  }
  if (update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT !== undefined
    && update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT !== null
    && update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT !== '') {
    const capitalAmount = Number(update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT);
    if (!Number.isFinite(capitalAmount) || !/^\d+(\.\d{1,4})?$/.test(String(update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT))) {
      throw validationError('CUSTOMER_REGISTERED_CAPITAL_AMOUNT must be a decimal with up to 4 decimal places.');
    }
    update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT = capitalAmount;
  }

  return update;
}

async function updateRequestCustomerInfo(id, payload, updatedBy) {
  const { Request, Size } = getModels();
  const update = normalizeRequestCustomerInfo(payload);
  const request = await Request.findOne({ where: { ID: id, ENABLED: '1' } });

  if (!request) return null;
  if (request.STATUS_ID === CANCELLED_STATUS_ID || request.STATUS_ID === COMPLETED_STATUS_ID) {
    const error = new Error('Customer information cannot be edited after this request is cancelled or completed.');
    error.statusCode = 409;
    error.code = 'REQUEST_NOT_EDITABLE';
    throw error;
  }
  if (update.CUSTOMER_SIZE_ID) {
    const size = await Size.findOne({ where: { ID: update.CUSTOMER_SIZE_ID, ENABLED: '1' } });
    if (!size) throw validationError('CUSTOMER_SIZE_ID must reference an enabled size.');
  }

  await request.update({ ...update, UPDATED_DATE: new Date(), UPDATED_BY: updatedBy });
  return getRequestById(id);
}

async function cancelRequest(id, updatedBy) {
  const { Request } = getModels();

  const [affectedRows] = await Request.update(
    {
      STATUS_ID: CANCELLED_STATUS_ID,
      UPDATED_DATE: Request.sequelize.fn('GETDATE'),
      UPDATED_BY: updatedBy,
    },
    { where: { ID: id, ENABLED: '1' } },
  );

  return affectedRows > 0;
}

module.exports = {
  listRequests,
  getRequestById,
  updateRequestCustomerInfo,
  cancelRequest,
};
