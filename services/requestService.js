const { Op, fn, col, where, QueryTypes } = require('sequelize');
const { getDatabase } = require('../config/database');
const { getModels } = require('../models');

const QUICK_FILTERS = new Set(['rating', 'limit', 'term']);
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

function mapRequest(request, customer) {
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
    SEARCH_TERM: request.SEARCH_TERM || '',
    REQUESTED_RATING_ID: request.REQUESTED_RATING_ID || '',
    REQUESTED_RATING: requestedRating,
    REQUESTED_LIMIT: requestedLimit,
    REQUESTED_TERM: requestedTerm,
    APPROVED_RATING: approvedRating,
    APPROVED_LIMIT: approvedLimit,
    APPROVED_TERM: approvedTerm,
    STATUS_ID: request.STATUS_ID || '',
    STATUS: request.status?.NAME || '',
    REQUESTED_NAME: employeeName(request.requestedByEmployee),
    UPDATED_NAME: employeeName(request.updatedByEmployee),
    CREATED_DATE: formatUpdatedDate(request.CREATED_DATE),
    UPDATED_DATE: formatUpdatedDate(request.UPDATED_DATE),
    CUSTOMER: customer || null,
    IS_RATING_REQUESTED: isNonBlank(requestedRating) ? 1 : 0,
    IS_LIMIT_REQUESTED: requestedLimit !== 0 ? 1 : 0,
    IS_TERM_REQUESTED: isNonBlank(requestedTerm) ? 1 : 0,
    IS_RATING_APPROVED: isNonBlank(approvedRating) ? 1 : 0,
    IS_LIMIT_APPROVED: approvedLimit !== 0 ? 1 : 0,
    IS_TERM_APPROVED: isNonBlank(approvedTerm) ? 1 : 0,
  };
}

async function findCustomerDetails(crmNo) {
  if (!isNonBlank(crmNo)) return null;

  const [customers] = await getDatabase().query(
    `SELECT TOP (1)
      C.ID AS id,
      C.TAX_NO AS taxNo,
      CONVERT(char(10), C.REGISTERED_DATE, 23) AS registeredDate,
      C.REGISTERED_CAPITAL_AMOUNT AS registeredCapitalAmount,
      C.SIZE_ID AS sizeId,
      S.NAME AS sizeName,
      C.BUSINESS_TYPE_INTER AS businessType,
      C.CUSTOMER_TYPE_INTER AS customerType,
      C.DIRECTORS AS directors,
      C.SHAREHOLDERS AS shareholders,
      SC.ADDRESS_ENG_TELEPHONE AS phone,
      SC.ADDRESS_ENG_FAX AS faxId,
      SC.ADDRESS_ENG AS address
    FROM S_CUSTOMER SC
    INNER JOIN CUSTOMERS C ON C.TAX_NO = SC.TAX_NO AND C.ENABLED = '1'
    LEFT JOIN SIZES S ON S.ID = C.SIZE_ID
    WHERE SC.CUST_NO = :crmNo
    ORDER BY C.UPDATED_DATE DESC`,
    { replacements: { crmNo }, type: QueryTypes.SELECT },
  );

  return customers || null;
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

  const customer = await findCustomerDetails(request.CRM_NO);
  return mapRequest(request, customer);
}

async function softDeleteRequest(id, updatedBy) {
  const { Request } = getModels();
  const [affectedRows] = await Request.update(
    {
      ENABLED: '0',
      UPDATED_DATE: new Date(),
      UPDATED_BY: updatedBy,
    },
    { where: { ID: id, ENABLED: '1' } },
  );

  return affectedRows > 0;
}

module.exports = {
  listRequests,
  getRequestById,
  softDeleteRequest,
};
