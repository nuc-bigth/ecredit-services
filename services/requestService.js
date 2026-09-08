const { Op, QueryTypes, fn, col, where } = require('sequelize');
const { getModels } = require('../models');
const { getDatabase } = require('../config/database');
const attachmentService = require('./attachmentService');

const QUICK_FILTERS = new Set(['rating', 'limit', 'term']);
const CANCELLED_STATUS_ID = '31d531f4-0420-4db5-aecf-bcfe4a0e8c4a';
const COMPLETED_STATUS_ID = '407e23f9-caf5-4c4a-801d-598cf437d1ae';
const SMALL_CUSTOMER_SIZE_ID = 'd8ce72cf-0228-4293-9699-311eeecb926d';
const MEDIUM_CUSTOMER_SIZE_ID = '9d9d84c7-8926-4629-b06f-2cb4d434fc33';
const LARGE_CUSTOMER_SIZE_ID = '4b2d23db-96d6-4cef-b6ae-10a97a8ce1cb';
const MAX_RICH_TEXT_SIZE = 8 * 1024 * 1024; // 8 MiB
const MEDIUM_CUSTOMER_CAPITAL_MINIMUM = 50000000n;
const LARGE_CUSTOMER_CAPITAL_MINIMUM = 200000000n;
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
const APPROVAL_ACTION_TYPES = {
  approve: 'Approved',
  reject: 'Rejected',
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
  const conditions = [{ ENABLED: true }];

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
    { model: Rating, as: 'proposedRating', required: false },
    { model: Rating, as: 'approvedRating', required: false },
    { model: Term, as: 'requestedTerm', required: false },
    { model: Term, as: 'proposedTerm', required: false },
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

function customerSizeIdForCapital(capitalAmount) {
  if (capitalAmount < MEDIUM_CUSTOMER_CAPITAL_MINIMUM) return SMALL_CUSTOMER_SIZE_ID;
  if (capitalAmount <= LARGE_CUSTOMER_CAPITAL_MINIMUM) return MEDIUM_CUSTOMER_SIZE_ID;
  return LARGE_CUSTOMER_SIZE_ID;
}

function mapRequest(request) {
  const existingRating = request.existingRating?.NAME || '';
  const requestedRating = request.requestedRating?.NAME || '';
  const proposedRating = request.proposedRating?.NAME || '';
  const approvedRating = request.approvedRating?.NAME || '';
  const requestedTerm = request.requestedTerm?.NAME || '';
  const proposedTerm = request.proposedTerm?.NAME || '';
  const approvedTerm = request.approvedTerm?.NAME || '';
  const requestedLimit = toNumber(request.REQUESTED_LIMIT_AMOUNT);
  const proposedLimit = request.PROPOSED_LIMIT_AMOUNT === null || request.PROPOSED_LIMIT_AMOUNT === undefined
    ? null
    : toNumber(request.PROPOSED_LIMIT_AMOUNT);
  const approvedLimit = toNumber(request.APPROVED_LIMIT_AMOUNT);

  return {
    id: request.ID,
    NO: request.NO || '',
    CUSTOMER_NAME_TH: request.CUSTOMER_NAME_TH || '',
    CUSTOMER_NAME_ENG: request.CUSTOMER_NAME_ENG || '',
    CUSTOMER_SALES_GROUP: salesGroupName(request.REQUESTED_SALES_GROUP),
    CUSTOMER_SALES_GROUP_CODE: request.REQUESTED_SALES_GROUP || '',
    REQUESTED_SALES_GROUP: request.REQUESTED_SALES_GROUP || '',
    REQUESTED_CUSTOMER_TYPE: request.REQUESTED_CUSTOMER_TYPE || '',
    REQUESTED_SELLING_TYPE: request.REQUESTED_SELLING_TYPE || '',
    REQUESTED_EXPECTED_SALES_AMOUNT: request.REQUESTED_EXPECTED_SALES_AMOUNT === null || request.REQUESTED_EXPECTED_SALES_AMOUNT === undefined
      ? null : toNumber(request.REQUESTED_EXPECTED_SALES_AMOUNT),
    REQUESTED_DELIVERY_FREQUENCY: request.REQUESTED_DELIVERY_FREQUENCY || '',
    REQUESTED_ADDITIONAL_EXPECTED_AMOUNT: request.REQUESTED_ADDITIONAL_EXPECTED_AMOUNT === null || request.REQUESTED_ADDITIONAL_EXPECTED_AMOUNT === undefined
      ? null : toNumber(request.REQUESTED_ADDITIONAL_EXPECTED_AMOUNT),
    REQUESTED_NOTES: request.REQUESTED_NOTES || '',
    CRM_NO: request.CRM_NO || '',
    SUBJECT: request.DESCRIPTION || '',
    PROPOSED_DISPLAYED_NOTES: request.PROPOSED_DISPLAYED_NOTES || '',
    PROPOSED_NOTES: request.PROPOSED_NOTES || '',
    REF_FINANCIAL_STATEMENT_FY: formatDate(request.REF_FINANCIAL_STATEMENT_FY),
    SCORING_PROFITABILITY: request.SCORING_PROFITABILITY?.toString() || '-',
    SCORING_GROWTH: request.SCORING_GROWTH?.toString() || '-',
    SCORING_LIQUIDITY: request.SCORING_LIQUIDITY?.toString() || '-',
    SCORING_LEVERAGE: request.SCORING_LEVERAGE?.toString() || '-',
    EXISTING_PROFITABILITY: request.EXISTING_PROFITABILITY?.toString() || '-',
    EXISTING_GROWTH: request.EXISTING_GROWTH?.toString() || '-',
    EXISTING_LIQUIDITY: request.EXISTING_LIQUIDITY?.toString() || '-',
    EXISTING_LEVERAGE: request.EXISTING_LEVERAGE?.toString() || '-',
    SCORING_RATING_ID: request.SCORING_RATING_ID || '',
    IS_PAY_IN_ADVANCE: Boolean(request.IS_PAY_IN_ADVANCE),
    IS_PAY_ON_TIME: Boolean(request.IS_PAY_ON_TIME),
    IS_OVERDUE_GT_10_DAYS: Boolean(request.IS_OVERDUE_GT_10_DAYS),
    IS_OVERDUE_GT_30_DAYS: Boolean(request.IS_OVERDUE_GT_30_DAYS),
    IS_OVERDUE_GT_60_DAYS: Boolean(request.IS_OVERDUE_GT_60_DAYS),
    IS_OVERDUE_GT_90_DAYS: Boolean(request.IS_OVERDUE_GT_90_DAYS),
    IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED: Boolean(request.IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED),
    IS_WITHIN_APPROVED_LIMIT_PROPOSED: Boolean(request.IS_WITHIN_APPROVED_LIMIT_PROPOSED),
    IS_BANK_GUARANTEE_PROPOSED: Boolean(request.IS_BANK_GUARANTEE_PROPOSED),
    PROPOSED_BANK_GUARANTEE_AMOUNT: toNumber(request.PROPOSED_BANK_GUARANTEE_AMOUNT),
    IS_CASH_DEPOSIT_PROPOSED: Boolean(request.IS_CASH_DEPOSIT_PROPOSED),
    PROPOSED_CASH_DEPOSIT_AMOUNT: toNumber(request.PROPOSED_CASH_DEPOSIT_AMOUNT),
    SOLD_TO: request.SOLD_TO || '',
    CUSTOMER_TAX_NO: request.CUSTOMER_TAX_NO || '',
    SEARCH_TERM: request.SEARCH_TERM || '',
    EXISTING_RATING_ID: request.EXISTING_RATING_ID || '',
    EXISTING_RATING: existingRating,
    REQUESTED_RATING_ID: request.REQUESTED_RATING_ID || '',
    REQUESTED_LIMIT_AMOUNT: request.REQUESTED_LIMIT_AMOUNT === null || request.REQUESTED_LIMIT_AMOUNT === undefined
      ? null : toNumber(request.REQUESTED_LIMIT_AMOUNT),
    REQUESTED_RATING: requestedRating,
    PROPOSED_RATING_ID: request.PROPOSED_RATING_ID || '',
    PROPOSED_RATING: proposedRating,
    REQUESTED_LIMIT: requestedLimit,
    PROPOSED_LIMIT: proposedLimit,
    REQUESTED_TERM: requestedTerm,
    REQUESTED_TERM_ID: request.REQUESTED_TERM_ID || '',
    PROPOSED_TERM_ID: request.PROPOSED_TERM_ID || '',
    PROPOSED_TERM: proposedTerm,
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
    CUSTOMER_REGISTERED_CAPITAL_AMOUNT: request.CUSTOMER_REGISTERED_CAPITAL_AMOUNT?.toString() || '0',
    CUSTOMER_SIZE_ID: customerSizeIdForCapital(BigInt(request.CUSTOMER_REGISTERED_CAPITAL_AMOUNT?.toString() || '0')),
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

function formatCompanyCode(company) {
  const companyCode = company?.COMP_CODE?.trim() || '';
  const description = company?.DESCRIPTION?.trim() || '';

  if (!companyCode) return description;
  if (!description) return companyCode;
  return `${companyCode} - ${description}`;
}

async function getCompanyCode(soldTo) {
  if (!isNonBlank(soldTo)) return '';

  const companies = await getDatabase().query(
    `SELECT DISTINCT
      TB3.COMP_CODE,
      TB3.DESCRIPTION
    FROM [MDCENTER_PRD].[dbo].[CUSTOMER] AS TB2
    LEFT JOIN [MDCENTER_PRD].[dbo].[COMPANYMASTER] AS TB3
      ON TB2.SALES_ORG = TB3.COMP_CODE
    WHERE :soldTo COLLATE Thai_CI_AI = TB2.CUST_NO`,
    {
      replacements: { soldTo: soldTo.trim() },
      type: QueryTypes.SELECT,
    },
  );

  return formatCompanyCode(companies[0]);
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
    where: { ID: id, ENABLED: true },
    include: buildIncludes(models),
  });

  if (!request) return null;

  const response = mapRequest(request);
  response.COMPANY_CODE = await getCompanyCode(response.SOLD_TO);
  return response;
}

async function listApprovalHistory(requestId) {
  return getDatabase().query(
    `SELECT *
    FROM (
      SELECT
        CAST(TB1.ID AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS ID,
        ISNULL(TB1.REQUESTED_NOTES, '-') COLLATE DATABASE_DEFAULT AS COMMENT,
        TB1.REQUESTED_LIMIT_AMOUNT AS CREDIT_LIMIT,
        ISNULL(TB4.NAME, '') COLLATE DATABASE_DEFAULT AS CREDIT_TERM,
        ISNULL(TB5.NAME, '') COLLATE DATABASE_DEFAULT AS CREDIT_RATING,
        'Requester' COLLATE DATABASE_DEFAULT AS APPROVER_TYPE_NAME,
        'Requested' COLLATE DATABASE_DEFAULT AS APPROVAL_TYPE_NAME,
        CAST(NULL AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS APPROVAL_TYPE_ID,
        'No' COLLATE DATABASE_DEFAULT AS INCLUDED_CLEAR_OUTSTANDING_BALANCE,
        'No' COLLATE DATABASE_DEFAULT AS INCLUDED_WITHIN_APPROVED_LIMIT,
        'No' COLLATE DATABASE_DEFAULT AS INCLUDED_BANK_GUARANTEE,
        '0.00' AS BANK_GUARANTEE_AMOUNT,
        'No' COLLATE DATABASE_DEFAULT AS INCLUDED_CASH_DEPOSIT,
        '0.00' AS CASH_DEPOSIT_AMOUNT,
        CAST(TB2.EMP_CODE AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS APPROVER_ID,
        CONCAT(TB2.INITIALS, '-', TB2.USERNAME) COLLATE DATABASE_DEFAULT AS APPROVER_NAME,
        FORMAT(TB1.CREATED_DATE, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS LAST_UPDATE_DATE,
        CONCAT(TB3.INITIALS, '-', TB3.USERNAME) COLLATE DATABASE_DEFAULT AS LAST_UPDATE_BY,
        (CASE WHEN TB1.IS_PERMANENT_REQUESTED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS PERMANENT,
        (CASE WHEN TB1.IS_TEMPORARY_REQUESTED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS TEMPORARY,
        FORMAT(TB1.REQUESTED_VALID_FROM, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS VALID_FROM,
        FORMAT(TB1.REQUESTED_VALID_TO, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS VALID_TO,
        1 AS SORTING
      FROM REQUESTS AS TB1
      LEFT JOIN S_EMPLOYEE1 AS TB2 ON TB2.EMP_CODE = TB1.REQUESTED_BY
      LEFT JOIN S_EMPLOYEE1 AS TB3 ON TB3.EMP_CODE = TB1.CREATED_BY
      LEFT JOIN TERMS AS TB4 ON TB4.ID = TB1.REQUESTED_TERM_ID
      LEFT JOIN RATINGS AS TB5 ON TB5.ID = TB1.REQUESTED_RATING_ID
      WHERE TB1.ENABLED = '1' AND TB1.ID = :requestId

      UNION ALL

      SELECT
        CAST(TB1.ID AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS ID,
        ISNULL(TB1.PROPOSED_NOTES, '-') COLLATE DATABASE_DEFAULT AS COMMENT,
        TB1.PROPOSED_LIMIT_AMOUNT AS CREDIT_LIMIT,
        ISNULL(TB4.NAME, '') COLLATE DATABASE_DEFAULT AS CREDIT_TERM,
        ISNULL(TB5.NAME, '') COLLATE DATABASE_DEFAULT AS CREDIT_RATING,
        'Credit Team' COLLATE DATABASE_DEFAULT AS APPROVER_TYPE_NAME,
        'Suggested' COLLATE DATABASE_DEFAULT AS APPROVAL_TYPE_NAME,
        CAST(NULL AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS APPROVAL_TYPE_ID,
        (CASE WHEN TB1.IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_CLEAR_OUTSTANDING_BALANCE,
        (CASE WHEN TB1.IS_WITHIN_APPROVED_LIMIT_PROPOSED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_WITHIN_APPROVED_LIMIT,
        (CASE WHEN TB1.IS_BANK_GUARANTEE_PROPOSED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_BANK_GUARANTEE,
        TB1.PROPOSED_BANK_GUARANTEE_AMOUNT AS BANK_GUARANTEE_AMOUNT,
        (CASE WHEN TB1.IS_CASH_DEPOSIT_PROPOSED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_CASH_DEPOSIT,
        TB1.PROPOSED_CASH_DEPOSIT_AMOUNT AS CASH_DEPOSIT_AMOUNT,
        CAST(TB2.EMP_CODE AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS APPROVER_ID,
        CONCAT(TB2.INITIALS, '-', TB2.USERNAME) COLLATE DATABASE_DEFAULT AS APPROVER_NAME,
        FORMAT(TB1.SUBMITTED_DATE, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS LAST_UPDATE_DATE,
        CONCAT(TB3.INITIALS, '-', TB3.USERNAME) COLLATE DATABASE_DEFAULT AS LAST_UPDATE_BY,
        (CASE WHEN TB1.IS_PERMANENT_PROPOSED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS PERMANENT,
        (CASE WHEN TB1.IS_TEMPORARY_PROPOSED = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS TEMPORARY,
        FORMAT(TB1.PROPOSED_VALID_FROM, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS VALID_FROM,
        FORMAT(TB1.PROPOSED_VALID_TO, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS VALID_TO,
        2 AS SORTING
      FROM REQUESTS AS TB1
      LEFT JOIN S_EMPLOYEE1 AS TB2 ON TB2.EMP_CODE = TB1.SUBMITTED_BY
      LEFT JOIN S_EMPLOYEE1 AS TB3 ON TB3.EMP_CODE = TB1.SUBMITTED_BY
      LEFT JOIN TERMS AS TB4 ON TB4.ID = TB1.PROPOSED_TERM_ID
      LEFT JOIN RATINGS AS TB5 ON TB5.ID = TB1.PROPOSED_RATING_ID
      WHERE TB1.ENABLED = '1' AND TB1.ID = :requestId

      UNION ALL

      SELECT
        CAST(TB1.ID AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS ID,
        ISNULL(TB1.DESCRIPTION, '-') COLLATE DATABASE_DEFAULT AS COMMENT,
        TB1.LIMIT_AMOUNT AS CREDIT_LIMIT,
        ISNULL(TB6.NAME, '') COLLATE DATABASE_DEFAULT AS CREDIT_TERM,
        ISNULL(TB7.NAME, '') COLLATE DATABASE_DEFAULT AS CREDIT_RATING,
        ISNULL(TB2.NAME, '') COLLATE DATABASE_DEFAULT AS APPROVER_TYPE_NAME,
        ISNULL(TB3.NAME, '') COLLATE DATABASE_DEFAULT AS APPROVAL_TYPE_NAME,
        CAST(TB1.APPROVAL_TYPE_ID AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS APPROVAL_TYPE_ID,
        (CASE WHEN TB1.IS_CLEAR_OUTSTANDING_BALANCE = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_CLEAR_OUTSTANDING_BALANCE,
        (CASE WHEN TB1.IS_WITHIN_APPROVED_LIMIT = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_WITHIN_APPROVED_LIMIT,
        (CASE WHEN TB1.IS_BANK_GUARANTEE = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_BANK_GUARANTEE,
        TB1.BANK_GUARANTEE_AMOUNT AS BANK_GUARANTEE_AMOUNT,
        (CASE WHEN TB1.IS_CASH_DEPOSIT = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS INCLUDED_CASH_DEPOSIT,
        TB1.CASH_DEPOSIT_AMOUNT AS CASH_DEPOSIT_AMOUNT,
        CAST(TB4.EMP_CODE AS VARCHAR(36)) COLLATE DATABASE_DEFAULT AS APPROVER_ID,
        CONCAT(TB4.INITIALS, '-', TB4.USERNAME) COLLATE DATABASE_DEFAULT AS APPROVER_NAME,
        FORMAT(TB1.UPDATED_DATE, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS LAST_UPDATE_DATE,
        CONCAT(TB5.INITIALS, '-', TB5.USERNAME) COLLATE DATABASE_DEFAULT AS LAST_UPDATE_BY,
        (CASE WHEN TB1.IS_PERMANENT = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS PERMANENT,
        (CASE WHEN TB1.IS_TEMPORARY = '1' THEN 'Yes' ELSE 'No' END) COLLATE DATABASE_DEFAULT AS TEMPORARY,
        FORMAT(TB1.VALID_FROM, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS VALID_FROM,
        FORMAT(TB1.VALID_TO, 'dd MMM yyyy, hh:mm tt') COLLATE DATABASE_DEFAULT AS VALID_TO,
        TB2.SORTING + 2 AS SORTING
      FROM APPROVALS AS TB1
      LEFT JOIN APPROVER_TYPES AS TB2 ON TB1.APPROVER_TYPE_ID = TB2.ID
      LEFT JOIN APPROVAL_TYPES AS TB3 ON TB3.ID = TB1.APPROVAL_TYPE_ID
      LEFT JOIN S_EMPLOYEE1 AS TB4 ON TB4.EMP_CODE = TB1.APPROVER_ID
      LEFT JOIN S_EMPLOYEE1 AS TB5 ON TB5.EMP_CODE = TB1.UPDATED_BY
      LEFT JOIN TERMS AS TB6 ON TB6.ID = TB1.TERM_ID
      LEFT JOIN RATINGS AS TB7 ON TB7.ID = TB1.RATING_ID
      WHERE TB1.ENABLED = '1' AND TB1.REQUEST_ID = :requestId
    ) AS APPROVAL_HISTORY
    ORDER BY SORTING ASC`,
    {
      replacements: { requestId },
      type: QueryTypes.SELECT,
    },
  );
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function databaseDateFromYmd(sequelize, value) {
  const [year, month, day] = value.split('-').map(Number);
  return sequelize.fn('DATEFROMPARTS', year, month, day);
}

function normalizeCloneDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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
  if (typeof update.CUSTOMER_TAX_NO !== 'string') {
    throw validationError('CUSTOMER_TAX_NO is required.');
  }
  update.CUSTOMER_TAX_NO = update.CUSTOMER_TAX_NO.trim();
  if (update.CUSTOMER_TAX_NO !== '-' && !/^\d{13}$/.test(update.CUSTOMER_TAX_NO)) {
    throw validationError('CUSTOMER_TAX_NO must be - or contain exactly 13 digits.');
  }
  if (Object.prototype.hasOwnProperty.call(update, 'CUSTOMER_REGISTERED_DATE')) {
    if (update.CUSTOMER_REGISTERED_DATE === undefined || update.CUSTOMER_REGISTERED_DATE === null
      || update.CUSTOMER_REGISTERED_DATE === '') {
      update.CUSTOMER_REGISTERED_DATE = null;
    } else if (typeof update.CUSTOMER_REGISTERED_DATE !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(update.CUSTOMER_REGISTERED_DATE)) {
      throw validationError('CUSTOMER_REGISTERED_DATE must use YYYY-MM-DD.');
    } else {
      const parsedDate = new Date(`${update.CUSTOMER_REGISTERED_DATE}T00:00:00Z`);
      if (Number.isNaN(parsedDate.getTime())
        || parsedDate.toISOString().slice(0, 10) !== update.CUSTOMER_REGISTERED_DATE) {
        throw validationError('CUSTOMER_REGISTERED_DATE must be a valid calendar date.');
      }
    }
  }
  const capitalAmount = update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT;
  const normalizedCapitalAmount = capitalAmount === undefined || capitalAmount === null || capitalAmount === ''
    ? '0'
    : String(capitalAmount);
  if (!/^\d+$/.test(normalizedCapitalAmount)) {
    throw validationError('CUSTOMER_REGISTERED_CAPITAL_AMOUNT must contain whole numbers only.');
  }
  update.CUSTOMER_REGISTERED_CAPITAL_AMOUNT = normalizedCapitalAmount;
  update.CUSTOMER_SIZE_ID = customerSizeIdForCapital(BigInt(normalizedCapitalAmount));

  return update;
}

async function updateRequestCustomerInfo(id, payload, updatedBy) {
  const { Request, Size } = getModels();
  const update = normalizeRequestCustomerInfo(payload);
  const request = await Request.findOne({ where: { ID: id, ENABLED: true } });

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

  if (typeof update.CUSTOMER_REGISTERED_DATE === 'string') {
    update.CUSTOMER_REGISTERED_DATE = databaseDateFromYmd(Request.sequelize, update.CUSTOMER_REGISTERED_DATE);
  }

  await request.update({ ...update, UPDATED_DATE: Request.sequelize.fn('GETDATE'), UPDATED_BY: updatedBy });
  return getRequestById(id);
}

function normalizeCreditSuggestionId(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw validationError(`${field} must be a valid ID.`);
  return value;
}

function normalizeRequestCreditSuggestion(payload) {
  const fields = [
    'PROPOSED_TERM_ID', 'PROPOSED_LIMIT_AMOUNT', 'PROPOSED_RATING_ID',
    'PROPOSED_DISPLAYED_NOTES', 'PROPOSED_NOTES',
    'IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED', 'IS_WITHIN_APPROVED_LIMIT_PROPOSED',
    'IS_BANK_GUARANTEE_PROPOSED', 'PROPOSED_BANK_GUARANTEE_AMOUNT',
    'IS_CASH_DEPOSIT_PROPOSED', 'PROPOSED_CASH_DEPOSIT_AMOUNT',
    'IS_PERMANENT_PROPOSED', 'IS_TEMPORARY_PROPOSED',
    'PROPOSED_VALID_FROM', 'PROPOSED_VALID_TO',
  ];
  const update = {};

  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) update[field] = payload[field];
  });

  if (!Object.keys(update).length) throw validationError('No credit suggestion fields were supplied.');
  update.PROPOSED_TERM_ID = normalizeCreditSuggestionId(update.PROPOSED_TERM_ID, 'PROPOSED_TERM_ID');
  update.PROPOSED_RATING_ID = normalizeCreditSuggestionId(update.PROPOSED_RATING_ID, 'PROPOSED_RATING_ID');

  ['PROPOSED_DISPLAYED_NOTES', 'PROPOSED_NOTES'].forEach((field) => {
    if (update[field] === undefined) return;
    if (typeof update[field] !== 'string') throw validationError(`${field} must be a string.`);
    if (Buffer.byteLength(update[field], 'utf8') > MAX_RICH_TEXT_SIZE) {
      throw validationError(`${field} exceeds the maximum length.`);
    }
  });

  const limit = update.PROPOSED_LIMIT_AMOUNT;
  if (limit === undefined || limit === null || limit === '') {
    update.PROPOSED_LIMIT_AMOUNT = null;
  } else {
    const normalizedLimit = Number(limit);
    if (!Number.isFinite(normalizedLimit) || normalizedLimit < 0) {
      throw validationError('PROPOSED_LIMIT_AMOUNT must be a non-negative number.');
    }
    update.PROPOSED_LIMIT_AMOUNT = normalizedLimit;
  }

  [
    'IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED', 'IS_WITHIN_APPROVED_LIMIT_PROPOSED',
    'IS_BANK_GUARANTEE_PROPOSED', 'IS_CASH_DEPOSIT_PROPOSED',
    'IS_PERMANENT_PROPOSED', 'IS_TEMPORARY_PROPOSED',
  ].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(update, field)) return;
    if (typeof update[field] === 'boolean') return;
    if (update[field] === 0 || update[field] === 1) {
      update[field] = Boolean(update[field]);
      return;
    }
    if (update[field] === '0' || update[field] === '1') {
      update[field] = update[field] === '1';
      return;
    }
    throw validationError(`${field} must be a boolean.`);
  });

  [
    'PROPOSED_BANK_GUARANTEE_AMOUNT', 'PROPOSED_CASH_DEPOSIT_AMOUNT',
  ].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(update, field)) return;
    if (update[field] === undefined || update[field] === null || update[field] === '') {
      update[field] = 0;
      return;
    }
    const normalizedAmount = Number(update[field]);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
      throw validationError(`${field} must be a non-negative number.`);
    }
    update[field] = normalizedAmount;
  });

  ['PROPOSED_VALID_FROM', 'PROPOSED_VALID_TO'].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(update, field)) return;
    if (update[field] === undefined || update[field] === null || update[field] === '') {
      update[field] = null;
      return;
    }
    if (typeof update[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(update[field])) {
      throw validationError(`${field} must use YYYY-MM-DD.`);
    }
    const parsedDate = new Date(`${update[field]}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== update[field]) {
      throw validationError(`${field} must be a valid calendar date.`);
    }
  });

  if (update.IS_PERMANENT_PROPOSED && !update.PROPOSED_VALID_FROM) {
    throw validationError('PROPOSED_VALID_FROM is required for a permanent adjustment.');
  }
  if (update.IS_TEMPORARY_PROPOSED && (!update.PROPOSED_VALID_FROM || !update.PROPOSED_VALID_TO)) {
    throw validationError('PROPOSED_VALID_FROM and PROPOSED_VALID_TO are required for a temporary adjustment.');
  }

  return update;
}

async function updateRequestCreditSuggestion(id, payload, updatedBy) {
  const { Request, Rating, Term } = getModels();
  const update = normalizeRequestCreditSuggestion(payload);
  const request = await Request.findOne({ where: { ID: id, ENABLED: true } });

  if (!request) return null;
  if (request.STATUS_ID === CANCELLED_STATUS_ID || request.STATUS_ID === COMPLETED_STATUS_ID) {
    const error = new Error('Credit suggestions cannot be edited after this request is cancelled or completed.');
    error.statusCode = 409;
    error.code = 'REQUEST_NOT_EDITABLE';
    throw error;
  }
  if (update.PROPOSED_TERM_ID) {
    const term = await Term.findByPk(update.PROPOSED_TERM_ID);
    if (!term) throw validationError('PROPOSED_TERM_ID must reference a valid term.');
  }
  if (update.PROPOSED_RATING_ID) {
    const rating = await Rating.findOne({ where: { ID: update.PROPOSED_RATING_ID, ENABLED: '1' } });
    if (!rating) throw validationError('PROPOSED_RATING_ID must reference an enabled rating.');
  }

  ['PROPOSED_VALID_FROM', 'PROPOSED_VALID_TO'].forEach((field) => {
    if (typeof update[field] === 'string') {
      update[field] = databaseDateFromYmd(Request.sequelize, update[field]);
    }
  });

  await request.update({ ...update, UPDATED_DATE: Request.sequelize.fn('GETDATE'), UPDATED_BY: updatedBy });
  return getRequestById(id);
}

function normalizeRequestScoringAndPayment(payload) {
  const scoringFields = [
    'SCORING_PROFITABILITY', 'SCORING_GROWTH', 'SCORING_LIQUIDITY', 'SCORING_LEVERAGE',
  ];
  const paymentFields = [
    'IS_PAY_IN_ADVANCE', 'IS_PAY_ON_TIME', 'IS_OVERDUE_GT_10_DAYS',
    'IS_OVERDUE_GT_30_DAYS', 'IS_OVERDUE_GT_60_DAYS', 'IS_OVERDUE_GT_90_DAYS',
  ];
  const update = {};

  [...scoringFields, 'SCORING_RATING_ID', ...paymentFields, 'REF_FINANCIAL_STATEMENT_FY'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) update[field] = payload[field];
  });

  if (!Object.keys(update).length) throw validationError('No scoring or payment behavior fields were supplied.');

  scoringFields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(update, field)) return;
    const value = update[field];
    update[field] = value === undefined || value === null || String(value).trim() === ''
      ? '-' : String(value);
  });

  if (Object.prototype.hasOwnProperty.call(update, 'SCORING_RATING_ID')) {
    update.SCORING_RATING_ID = normalizeCreditSuggestionId(update.SCORING_RATING_ID, 'SCORING_RATING_ID');
  }

  if (Object.prototype.hasOwnProperty.call(update, 'REF_FINANCIAL_STATEMENT_FY')) {
    const value = update.REF_FINANCIAL_STATEMENT_FY;
    if (value === undefined || value === null || value === '') {
      update.REF_FINANCIAL_STATEMENT_FY = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
      || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
      || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
      throw validationError('REF_FINANCIAL_STATEMENT_FY must use YYYY-MM-DD.');
    }
  }

  paymentFields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(update, field)) return;
    if (typeof update[field] === 'boolean') return;
    if (update[field] === 0 || update[field] === 1) {
      update[field] = Boolean(update[field]);
      return;
    }
    if (update[field] === '0' || update[field] === '1') {
      update[field] = update[field] === '1';
      return;
    }
    throw validationError(`${field} must be a boolean.`);
  });

  return update;
}

async function updateRequestScoringAndPayment(id, payload, updatedBy) {
  const { Request, Rating } = getModels();
  const update = normalizeRequestScoringAndPayment(payload);
  const request = await Request.findOne({ where: { ID: id, ENABLED: true } });

  if (!request) return null;
  if (request.STATUS_ID === CANCELLED_STATUS_ID || request.STATUS_ID === COMPLETED_STATUS_ID) {
    const error = new Error('Scoring and payment behavior cannot be edited after this request is cancelled or completed.');
    error.statusCode = 409;
    error.code = 'REQUEST_NOT_EDITABLE';
    throw error;
  }
  if (update.SCORING_RATING_ID) {
    const rating = await Rating.findOne({ where: { ID: update.SCORING_RATING_ID, ENABLED: '1' } });
    if (!rating) throw validationError('SCORING_RATING_ID must reference an enabled rating.');
  }

  if (typeof update.REF_FINANCIAL_STATEMENT_FY === 'string') {
    update.REF_FINANCIAL_STATEMENT_FY = databaseDateFromYmd(Request.sequelize, update.REF_FINANCIAL_STATEMENT_FY);
  }

  await request.update({ ...update, UPDATED_DATE: Request.sequelize.fn('GETDATE'), UPDATED_BY: updatedBy });
  return getRequestById(id);
}

function normalizeRequestedAmount(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    throw validationError(`${field} must be a non-negative number.`);
  }
  return normalizedValue;
}

function normalizeRequestRequestedDetails(payload) {
  const fields = [
    'REQUESTED_SALES_GROUP', 'REQUESTED_CUSTOMER_TYPE', 'REQUESTED_LIMIT_AMOUNT', 'REQUESTED_TERM_ID',
    'REQUESTED_RATING_ID', 'REQUESTED_SELLING_TYPE', 'REQUESTED_EXPECTED_SALES_AMOUNT',
    'REQUESTED_DELIVERY_FREQUENCY', 'REQUESTED_ADDITIONAL_EXPECTED_AMOUNT', 'REQUESTED_NOTES',
  ];
  const update = {};
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) update[field] = payload[field];
  });
  if (!Object.keys(update).length) throw validationError('No requested detail fields were supplied.');

  ['REQUESTED_SALES_GROUP', 'REQUESTED_CUSTOMER_TYPE', 'REQUESTED_TERM_ID', 'REQUESTED_RATING_ID',
    'REQUESTED_SELLING_TYPE', 'REQUESTED_DELIVERY_FREQUENCY', 'REQUESTED_NOTES']
    .forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(update, field)) return;
      if (update[field] === null) update[field] = '';
      const maximumLength = field === 'REQUESTED_DELIVERY_FREQUENCY' ? 50 : 2048;
      if (typeof update[field] !== 'string' || update[field].length > maximumLength) {
        throw validationError(`${field} must be a string no longer than ${maximumLength} characters.`);
      }
    });
  ['REQUESTED_LIMIT_AMOUNT', 'REQUESTED_EXPECTED_SALES_AMOUNT', 'REQUESTED_ADDITIONAL_EXPECTED_AMOUNT']
    .forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(update, field)) update[field] = normalizeRequestedAmount(update[field], field);
    });
  return update;
}

async function updateRequestRequestedDetails(id, payload, updatedBy) {
  const { Request, Rating, Term } = getModels();
  const update = normalizeRequestRequestedDetails(payload);
  const request = await Request.findOne({ where: { ID: id, ENABLED: true } });
  if (!request) return null;
  if (request.STATUS_ID === CANCELLED_STATUS_ID || request.STATUS_ID === COMPLETED_STATUS_ID) {
    const error = new Error('Requested details cannot be edited after this request is cancelled or completed.');
    error.statusCode = 409;
    error.code = 'REQUEST_NOT_EDITABLE';
    throw error;
  }
  if (update.REQUESTED_TERM_ID) {
    const term = await Term.findByPk(update.REQUESTED_TERM_ID);
    if (!term) throw validationError('REQUESTED_TERM_ID must reference a valid term.');
  }
  if (update.REQUESTED_RATING_ID) {
    const rating = await Rating.findOne({ where: { ID: update.REQUESTED_RATING_ID, ENABLED: '1' } });
    if (!rating) throw validationError('REQUESTED_RATING_ID must reference an enabled rating.');
  }
  await request.update({ ...update, UPDATED_DATE: Request.sequelize.fn('GETDATE'), UPDATED_BY: updatedBy });
  return getRequestById(id);
}

const CLONE_FIELDS = [
  'CUSTOMER_TAX_NO', 'CUSTOMER_REGISTERED_DATE', 'CUSTOMER_REGISTERED_CAPITAL_AMOUNT', 'CUSTOMER_SIZE_ID',
  'CUSTOMER_BUSINESS_TYPE_INTER', 'CUSTOMER_CUSTOMER_TYPE_INTER', 'CUSTOMER_DIRECTORS', 'CUSTOMER_SHAREHOLDERS',
  'SCORING_PROFITABILITY', 'SCORING_GROWTH', 'SCORING_LIQUIDITY', 'SCORING_LEVERAGE', 'SCORING_RATING_ID',
  'EXISTING_PROFITABILITY', 'EXISTING_GROWTH', 'EXISTING_LIQUIDITY', 'EXISTING_LEVERAGE',
  'IS_PAY_IN_ADVANCE', 'IS_PAY_ON_TIME', 'IS_OVERDUE_GT_10_DAYS', 'IS_OVERDUE_GT_30_DAYS',
  'IS_OVERDUE_GT_60_DAYS', 'IS_OVERDUE_GT_90_DAYS', 'PROPOSED_DISPLAYED_NOTES', 'PROPOSED_NOTES',
  'REF_FINANCIAL_STATEMENT_FY',
];

async function cloneRequestData(targetId, sourceId, updatedBy) {
  const { Request, Rating } = getModels();
  if (typeof sourceId !== 'string' || !sourceId.trim()) throw validationError('sourceRequestId is required.');
  const [target, source] = await Promise.all([
    Request.findOne({ where: { ID: targetId, ENABLED: true } }),
    Request.findOne({ where: { ID: sourceId, ENABLED: true } }),
  ]);
  if (!target || !source) return null;
  if (target.STATUS_ID === CANCELLED_STATUS_ID || target.STATUS_ID === COMPLETED_STATUS_ID) {
    const error = new Error('Request data cannot be cloned into a cancelled or completed request.');
    error.statusCode = 409;
    error.code = 'REQUEST_NOT_EDITABLE';
    throw error;
  }
  if (source.ID === target.ID) {
    const error = new Error('A request cannot clone its own data.');
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }
  const update = {};
  CLONE_FIELDS.forEach((field) => { update[field] = source[field]; });
  update.CUSTOMER_REGISTERED_DATE = normalizeCloneDate(update.CUSTOMER_REGISTERED_DATE);
  update.REF_FINANCIAL_STATEMENT_FY = normalizeCloneDate(update.REF_FINANCIAL_STATEMENT_FY);
  if (update.CUSTOMER_REGISTERED_DATE) {
    update.CUSTOMER_REGISTERED_DATE = databaseDateFromYmd(Request.sequelize, update.CUSTOMER_REGISTERED_DATE);
  }
  if (update.REF_FINANCIAL_STATEMENT_FY) {
    update.REF_FINANCIAL_STATEMENT_FY = databaseDateFromYmd(Request.sequelize, update.REF_FINANCIAL_STATEMENT_FY);
  }
  if (update.SCORING_RATING_ID) {
    const rating = await Rating.findOne({ where: { ID: update.SCORING_RATING_ID, ENABLED: '1' } });
    if (!rating) throw validationError('SCORING_RATING_ID must reference an enabled rating.');
  }
  const originalValues = {};
  CLONE_FIELDS.forEach((field) => { originalValues[field] = target[field]; });
  const databaseNow = Request.sequelize.fn('GETDATE');
  await target.update({ ...update, UPDATED_DATE: databaseNow, UPDATED_BY: updatedBy });
  try {
    const attachments = await attachmentService.cloneFinancialAnalysisAttachments(sourceId, targetId, updatedBy);
    return { request: await getRequestById(targetId), attachments };
  } catch (error) {
    await target.update({ ...originalValues, UPDATED_DATE: Request.sequelize.fn('GETDATE'), UPDATED_BY: updatedBy });
    throw error;
  }
}

async function cancelRequest(id, updatedBy) {
  const { Request } = getModels();

  const [affectedRows] = await Request.update(
    {
      STATUS_ID: CANCELLED_STATUS_ID,
      UPDATED_DATE: Request.sequelize.fn('GETDATE'),
      UPDATED_BY: updatedBy,
    },
    { where: { ID: id, ENABLED: true } },
  );

  return affectedRows > 0;
}

function normalizeApprovalBoolean(value, field) {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return Boolean(value);
  if (value === '0' || value === '1') return value === '1';
  throw validationError(`${field} must be a boolean.`);
}

function normalizeApprovalAmount(value, field, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw validationError(`${field} must be a non-negative number.`);
  }
  return amount;
}

function normalizeApprovalDate(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${field} must use YYYY-MM-DD.`);
  }
  const parsedDate = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value) {
    throw validationError(`${field} must be a valid calendar date.`);
  }
  return value;
}

function normalizeApprovalId(value, field, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !value.trim()) throw validationError(`${field} is required.`);
  return value.trim();
}

function normalizeApprovalUpdate(payload) {
  const description = typeof payload.DESCRIPTION === 'string' ? payload.DESCRIPTION.trim() : '';
  if (Buffer.byteLength(description, 'utf8') > MAX_RICH_TEXT_SIZE) {
    throw validationError('DESCRIPTION exceeds the maximum length.');
  }

  const update = {
    DESCRIPTION: description,
    LIMIT_AMOUNT: normalizeApprovalAmount(payload.LIMIT_AMOUNT, 'LIMIT_AMOUNT', true),
    TERM_ID: normalizeApprovalId(payload.TERM_ID, 'TERM_ID', true),
    RATING_ID: normalizeApprovalId(payload.RATING_ID, 'RATING_ID', true),
    IS_PERMANENT: normalizeApprovalBoolean(payload.IS_PERMANENT, 'IS_PERMANENT'),
    IS_TEMPORARY: normalizeApprovalBoolean(payload.IS_TEMPORARY, 'IS_TEMPORARY'),
    VALID_FROM: normalizeApprovalDate(payload.VALID_FROM, 'VALID_FROM'),
    VALID_TO: normalizeApprovalDate(payload.VALID_TO, 'VALID_TO'),
    IS_CLEAR_OUTSTANDING_BALANCE: normalizeApprovalBoolean(
      payload.IS_CLEAR_OUTSTANDING_BALANCE,
      'IS_CLEAR_OUTSTANDING_BALANCE',
    ),
    IS_WITHIN_APPROVED_LIMIT: normalizeApprovalBoolean(
      payload.IS_WITHIN_APPROVED_LIMIT,
      'IS_WITHIN_APPROVED_LIMIT',
    ),
    IS_BANK_GUARANTEE: normalizeApprovalBoolean(payload.IS_BANK_GUARANTEE, 'IS_BANK_GUARANTEE'),
    BANK_GUARANTEE_AMOUNT: normalizeApprovalAmount(payload.BANK_GUARANTEE_AMOUNT, 'BANK_GUARANTEE_AMOUNT'),
    IS_CASH_DEPOSIT: normalizeApprovalBoolean(payload.IS_CASH_DEPOSIT, 'IS_CASH_DEPOSIT'),
    CASH_DEPOSIT_AMOUNT: normalizeApprovalAmount(payload.CASH_DEPOSIT_AMOUNT, 'CASH_DEPOSIT_AMOUNT'),
  };

  if (update.IS_PERMANENT && update.IS_TEMPORARY) {
    throw validationError('IS_PERMANENT and IS_TEMPORARY cannot both be enabled.');
  }
  if ((update.IS_PERMANENT || update.IS_TEMPORARY) && !update.VALID_FROM) {
    throw validationError('VALID_FROM is required for a credit adjustment.');
  }
  if (update.IS_TEMPORARY && !update.VALID_TO) {
    throw validationError('VALID_TO is required for a temporary adjustment.');
  }
  if (update.VALID_FROM && update.VALID_TO && update.VALID_TO < update.VALID_FROM) {
    throw validationError('VALID_TO must be on or after VALID_FROM.');
  }

  return update;
}

async function processApprovalAction(id, action, payload, updatedBy, isSystemAdmin = false) {
  if (!['save', 'approve', 'reject'].includes(action)) {
    throw validationError('Unsupported approval action.');
  }
  if (typeof payload.APPROVAL_ID !== 'string' || !payload.APPROVAL_ID.trim()) {
    throw validationError('APPROVAL_ID is required.');
  }
  const normalizedUpdate = normalizeApprovalUpdate(payload);

  const { Approval } = getModels();
  const database = getDatabase();
  const transaction = await database.transaction();
  try {
    const pendingApprovals = await database.query(
      `SELECT TOP 1 TB1.ID
       FROM APPROVALS AS TB1
       INNER JOIN APPROVAL_TYPES AS TB2 ON TB2.ID = TB1.APPROVAL_TYPE_ID
       WHERE TB1.ID = :approvalId
         AND TB1.REQUEST_ID = :id
         AND (TB1.APPROVER_ID = :updatedBy OR :isSystemAdmin = 1)
         AND TB1.ENABLED = '1'
         AND TB2.ENABLED = '1'
         AND TB2.NAME = 'Pending'
       ORDER BY TB1.UPDATED_DATE ASC`,
      {
        replacements: {
          id,
          approvalId: payload.APPROVAL_ID.trim(),
          updatedBy,
          isSystemAdmin: isSystemAdmin ? 1 : 0,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const pendingApproval = pendingApprovals[0];
    if (!pendingApproval) {
      const error = new Error('There is no pending approval assigned to the authenticated user.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    const approvalUpdate = {
      ...normalizedUpdate,
      VALID_FROM: normalizedUpdate.VALID_FROM
        ? databaseDateFromYmd(Approval.sequelize, normalizedUpdate.VALID_FROM)
        : null,
      VALID_TO: normalizedUpdate.VALID_TO
        ? databaseDateFromYmd(Approval.sequelize, normalizedUpdate.VALID_TO)
        : null,
      UPDATED_BY: updatedBy,
      UPDATED_DATE: Approval.sequelize.fn('GETDATE'),
    };

    if (action !== 'save') {
      const approvalTypeName = APPROVAL_ACTION_TYPES[action];
      const approvalTypes = await database.query(
        `SELECT TOP 1 ID
         FROM APPROVAL_TYPES
         WHERE ENABLED = '1' AND NAME = :approvalTypeName`,
        {
          replacements: { approvalTypeName },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      const approvalType = approvalTypes[0];
      if (!approvalType) throw validationError(`Approval type ${approvalTypeName} is not configured.`);
      approvalUpdate.APPROVAL_TYPE_ID = approvalType.ID;
    }

    const [affectedRows] = await Approval.update(
      approvalUpdate,
      { where: { ID: pendingApproval.ID, REQUEST_ID: id, ENABLED: true }, transaction },
    );
    if (affectedRows === 0) throw validationError('The pending approval could not be updated.');

    await transaction.commit();
    return getRequestById(id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  listRequests,
  getRequestById,
  listApprovalHistory,
  updateRequestCustomerInfo,
  updateRequestCreditSuggestion,
  updateRequestScoringAndPayment,
  updateRequestRequestedDetails,
  cloneRequestData,
  cancelRequest,
  processApprovalAction,
};
