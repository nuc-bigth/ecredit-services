const { Op, fn, col, where, literal } = require('sequelize');
const { getModels } = require('../models');

const QUICK_FILTER_SIZE_IDS = {
  S: 'd8ce72cf-0228-4293-9699-311eeecb926d',
  M: '9d9d84c7-8926-4629-b06f-2cb4d434fc33',
  L: '4b2d23db-96d6-4cef-b6ae-10a97a8ce1cb',
};

const SORT_FIELDS = {
  TAX_NO: 'TAX_NO',
  REGISTERED_DATE: 'REGISTERED_DATE',
  REGISTERED_CAPITAL_AMOUNT: 'REGISTERED_CAPITAL_AMOUNT',
  BUSINESS_TYPE: 'BUSINESS_TYPE_INTER',
  UPDATED_DATE: 'UPDATED_DATE',
};

const TEXT_FILTERS = {
  TAX_NO: 'TAX_NO',
  BUSINESS_TYPE: 'BUSINESS_TYPE_INTER',
};

// Mirrors the OUTER APPLY: shortest, then alphabetically-first S_CUSTOMER name for the same tax no.
const CUSTOMER_NAME_SUBQUERY = `(
  SELECT TOP (1) SC.CUST_NAME_ENG
  FROM S_CUSTOMER SC
  WHERE SC.TAX_NO = Customer.TAX_NO
  ORDER BY LEN(SC.CUST_NAME_ENG) ASC, SC.CUST_NAME_ENG ASC
)`;

function normalizePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeQuickFilters(value) {
  const filters = Array.isArray(value) ? value : value ? [value] : [];
  const unsupported = filters.find((filter) => !QUICK_FILTER_SIZE_IDS[filter]);

  if (unsupported) {
    const error = new Error(`Unsupported quick filter: ${unsupported}`);
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  return [...new Set(filters)];
}

function dateRangeCondition(column, value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { [column]: { [Op.gte]: start, [Op.lt]: end } };
}

function buildWhere(query) {
  const conditions = [{ ENABLED: '1' }];

  Object.entries(TEXT_FILTERS).forEach(([queryKey, column]) => {
    const value = typeof query[queryKey] === 'string' ? query[queryKey].trim() : '';
    if (value) {
      conditions.push({ [column]: { [Op.like]: `%${value}%` } });
    }
  });

  const customerName = typeof query.CUSTOMER_NAME === 'string' ? query.CUSTOMER_NAME.trim() : '';
  if (customerName) {
    conditions.push(where(literal(CUSTOMER_NAME_SUBQUERY), { [Op.like]: `%${customerName}%` }));
  }

  const size = typeof query.SIZE === 'string' ? query.SIZE.trim() : '';
  if (size) {
    conditions.push(where(col('size.NAME'), { [Op.like]: `%${size}%` }));
  }

  const updatedBy = typeof query.UPDATED_BY === 'string' ? query.UPDATED_BY.trim() : '';
  if (updatedBy) {
    conditions.push(
      where(
        fn('CONCAT', col('updatedByEmployee.INITIALS'), '-', col('updatedByEmployee.USERNAME')),
        { [Op.like]: `%${updatedBy}%` },
      ),
    );
  }

  const registeredCapitalAmount = typeof query.REGISTERED_CAPITAL_AMOUNT === 'string'
    ? query.REGISTERED_CAPITAL_AMOUNT.trim()
    : '';
  if (registeredCapitalAmount) {
    const amount = Number(registeredCapitalAmount);
    if (Number.isFinite(amount)) {
      conditions.push({ REGISTERED_CAPITAL_AMOUNT: amount });
    }
  }

  const registeredDate = typeof query.REGISTERED_DATE === 'string' ? query.REGISTERED_DATE.trim() : '';
  const registeredDateCondition = dateRangeCondition('REGISTERED_DATE', registeredDate);
  if (registeredDateCondition) {
    conditions.push(registeredDateCondition);
  }

  const updatedDate = typeof query.UPDATED_DATE === 'string' ? query.UPDATED_DATE.trim() : '';
  const updatedDateCondition = dateRangeCondition('UPDATED_DATE', updatedDate);
  if (updatedDateCondition) {
    conditions.push(updatedDateCondition);
  }

  const quickFilters = normalizeQuickFilters(query.quickFilter);
  if (quickFilters.length) {
    conditions.push({ SIZE_ID: { [Op.in]: quickFilters.map((filter) => QUICK_FILTER_SIZE_IDS[filter]) } });
  }

  return { [Op.and]: conditions };
}

function buildIncludes(models) {
  const { Size, Employee } = models;

  return [
    { model: Size, as: 'size', required: false },
    { model: Employee, as: 'updatedByEmployee', required: false },
  ];
}

function buildAttributes() {
  return {
    include: [[literal(CUSTOMER_NAME_SUBQUERY), 'CUSTOMER_NAME']],
  };
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

function formatDate(value) {
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
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '';

  return `${part('day')} ${part('month')} ${part('year')}`;
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

function mapCustomer(customer) {
  return {
    id: customer.ID,
    TAX_NO: customer.TAX_NO || '',
    CUSTOMER_NAME: customer.get('CUSTOMER_NAME') || '',
    REGISTERED_DATE: formatDate(customer.REGISTERED_DATE),
    REGISTERED_CAPITAL_AMOUNT: toNumber(customer.REGISTERED_CAPITAL_AMOUNT),
    SIZE_ID: customer.SIZE_ID || '',
    SIZE: customer.size?.NAME || '',
    BUSINESS_TYPE: customer.BUSINESS_TYPE_INTER || '',
    CUSTOMER_TYPE: customer.CUSTOMER_TYPE_INTER || '',
    DIRECTORS: customer.DIRECTORS || '',
    SHAREHOLDERS: customer.SHAREHOLDERS || '',
    UPDATED_DATE: formatUpdatedDate(customer.UPDATED_DATE),
    UPDATED_BY: employeeName(customer.updatedByEmployee),
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

async function listCustomers(query) {
  const models = getModels();
  const page = normalizePage(query.page, 1);
  const pageSize = Math.min(normalizePage(query.pageSize, 25), 100);
  const result = await models.Customer.findAndCountAll({
    where: buildWhere(query),
    include: buildIncludes(models),
    attributes: buildAttributes(),
    order: buildOrder(query.sort, query.dir),
    offset: (page - 1) * pageSize,
    limit: pageSize,
    distinct: true,
  });

  return {
    items: result.rows.map(mapCustomer),
    pagination: {
      page,
      pageSize,
      totalItems: result.count,
      totalPages: Math.ceil(result.count / pageSize),
    },
  };
}

async function getCustomerById(id) {
  const models = getModels();
  const customer = await models.Customer.findOne({
    where: { ID: id, ENABLED: '1' },
    include: buildIncludes(models),
    attributes: buildAttributes(),
  });

  return customer ? mapCustomer(customer) : null;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function normalizeCustomerUpdate(payload) {
  const fields = ['TAX_NO', 'REGISTERED_DATE', 'REGISTERED_CAPITAL_AMOUNT', 'SIZE_ID', 'BUSINESS_TYPE_INTER', 'CUSTOMER_TYPE_INTER', 'DIRECTORS', 'SHAREHOLDERS'];
  const update = {};

  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) update[field] = payload[field];
  });

  if (!Object.keys(update).length) throw validationError('No customer fields were supplied.');
  if (typeof update.TAX_NO === 'string' && update.TAX_NO.length > 13) throw validationError('TAX_NO must not exceed 13 characters.');
  ['BUSINESS_TYPE_INTER', 'CUSTOMER_TYPE_INTER', 'DIRECTORS', 'SHAREHOLDERS'].forEach((field) => {
    if (typeof update[field] === 'string' && update[field].length > 2048) throw validationError(`${field} must not exceed 2048 characters.`);
  });
  if (update.REGISTERED_DATE !== undefined && update.REGISTERED_DATE !== null && update.REGISTERED_DATE !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(update.REGISTERED_DATE)) {
    throw validationError('REGISTERED_DATE must use YYYY-MM-DD.');
  }
  if (update.REGISTERED_CAPITAL_AMOUNT !== undefined && update.REGISTERED_CAPITAL_AMOUNT !== null && update.REGISTERED_CAPITAL_AMOUNT !== '') {
    const capitalAmount = Number(update.REGISTERED_CAPITAL_AMOUNT);
    if (!Number.isFinite(capitalAmount) || !/^\d+(\.\d{1,4})?$/.test(String(update.REGISTERED_CAPITAL_AMOUNT))) {
      throw validationError('REGISTERED_CAPITAL_AMOUNT must be a decimal with up to 4 decimal places.');
    }
    update.REGISTERED_CAPITAL_AMOUNT = capitalAmount;
  }

  return update;
}

async function listEnabledSizes() {
  const { Size } = getModels();
  const sizes = await Size.findAll({ where: { ENABLED: '1' }, order: [['SORTING', 'ASC'], ['NAME', 'ASC']] });
  return sizes.map((size) => ({ id: size.ID, label: size.NAME }));
}

async function updateCustomer(id, payload, updatedBy) {
  const { Customer, Size } = getModels();
  const update = normalizeCustomerUpdate(payload);

  if (update.SIZE_ID) {
    const size = await Size.findOne({ where: { ID: update.SIZE_ID, ENABLED: '1' } });
    if (!size) throw validationError('SIZE_ID must reference an enabled size.');
  }

  const [affectedRows] = await Customer.update(
    { ...update, UPDATED_DATE: new Date(), UPDATED_BY: updatedBy },
    { where: { ID: id, ENABLED: '1' } },
  );
  return affectedRows ? getCustomerById(id) : null;
}

async function softDeleteCustomer(id, updatedBy) {
  const { Customer } = getModels();
  const [affectedRows] = await Customer.update(
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
  listCustomers,
  listEnabledSizes,
  getCustomerById,
  softDeleteCustomer,
  updateCustomer,
};
