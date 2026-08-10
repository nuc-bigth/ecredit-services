const { Op, fn } = require('sequelize');
const { getModels } = require('../models');

const SORT_FIELDS = {
  CODE: 'EMP_CODE',
  NAME: 'NAME_ENG',
  USER: 'USERNAME',
  EMAIL: 'CURRENT_EMAIL',
  COST_CENTER_DESC: 'costCenter.COST_CENTER_DESC',
  BU: 'costCenter.BU',
  DEPARTMENT: 'costCenter.DEPARTMENT',
  MANAGER_1: 'manager1.USERNAME',
  MANAGER_2: 'manager2.USERNAME',
  SYSTEM_ACTIVE: 'user.ENABLED',
};

function normalizePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildWhere(query) {
  const filters = [];
  const fields = {
    CODE: 'EMP_CODE',
    NAME: 'NAME_ENG',
    USER: 'USERNAME',
    EMAIL: 'CURRENT_EMAIL',
  };

  for (const [key, column] of Object.entries(fields)) {
    if (query[key]?.trim()) {
      filters.push({ [column]: { [Op.like]: `%${query[key].trim()}%` } });
    }
  }

  return filters.length ? { [Op.and]: filters } : undefined;
}

function buildOrder(sort, dir, models) {
  const direction = String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const field = SORT_FIELDS[sort] || 'EMP_CODE';
  if (field === 'user.ENABLED') {
    return [[{ model: models.User, as: 'user' }, 'ENABLED', direction], ['EMP_CODE', 'ASC']];
  }
  if (field.startsWith('costCenter.')) {
    return [[{ model: models.User, as: 'user' }, { model: models.CostCenterMapping, as: 'costCenter' }, field.split('.')[1], direction], ['EMP_CODE', 'ASC']];
  }
  if (field.startsWith('manager')) {
    const [association, column] = field.split('.');
    return [[{ model: models.Employee, as: association }, column, direction], ['EMP_CODE', 'ASC']];
  }
  return field === 'EMP_CODE'
    ? [[field, direction]]
    : [[field, direction], ['EMP_CODE', 'ASC']];
}

function formatUserName(employee) {
  return employee ? `${employee.INITIALS || ''}-${employee.USERNAME || ''}`.replace(/^-|-$/g, '') : '';
}

function isEnabled(value) {
  return value === true || value === 1 || value === '1';
}

function mapUser(employee) {
  const user = employee.user;
  const costCenter = user?.costCenter;
  const roles = (user?.userRoles || [])
    .filter((userRole) => isEnabled(userRole.ENABLED))
    .map((userRole) => userRole.role.NAME)
    .filter(Boolean);

  return {
    CODE: employee.EMP_CODE,
    NAME: employee.NAME_ENG || '',
    USER: formatUserName(employee),
    EMAIL: (employee.CURRENT_EMAIL || '').toLowerCase(),
    COST_CENTER_DESC: costCenter?.COST_CENTER_DESC || '',
    BU: costCenter?.BU || '',
    DEPARTMENT: costCenter?.DEPARTMENT || '',
    MANAGER_1: formatUserName(employee.manager1),
    MANAGER_2: formatUserName(employee.manager2),
    ROLES: [...new Set(roles)].join(', '),
    SYSTEM_ACTIVE: isEnabled(user?.ENABLED),
  };
}

function mapUserDetail(employee) {
  const user = employee.user;
  const costCenter = user?.costCenter;
  const roles = (user?.userRoles || [])
    .filter((userRole) => isEnabled(userRole.ENABLED) && isEnabled(userRole.role?.ENABLED))
    .map((userRole) => userRole.role.NAME)
    .filter(Boolean);

  return {
    CODE: employee.EMP_CODE,
    ROLE: roles[0] || null,
    ROLES: [...new Set(roles)],
    BU: costCenter?.BU || '',
    DEPARTMENT: costCenter?.DEPARTMENT || '',
    USERNAME: employee.USERNAME || '',
    INITIALS: employee.INITIALS || '',
    FULL_NAME: employee.NAME_ENG || '',
    EMAIL: (employee.CURRENT_EMAIL || '').toLowerCase(),
    CODE_MANAGER_1: employee.manager1?.EMP_CODE || null,
    USERNAME_MANAGER_1: employee.manager1?.USERNAME || '',
    CODE_MANAGER_2: employee.manager2?.EMP_CODE || null,
    USERNAME_MANAGER_2: employee.manager2?.USERNAME || '',
    SYSTEM_ACTIVE: isEnabled(user?.ENABLED),
  };
}

async function listUsers(query) {
  const models = getModels();
  const { Employee, User, CostCenterMapping, UserRole, Role } = models;
  const page = normalizePage(query.page, 1);
  const pageSize = Math.min(normalizePage(query.pageSize, 25), 100);
  const result = await Employee.findAndCountAll({
    where: buildWhere(query),
    include: [
      { model: User, as: 'user', required: true, include: [
        { model: CostCenterMapping, as: 'costCenter', required: false },
        { model: UserRole, as: 'userRoles', required: false, include: [{ model: Role, as: 'role', required: false }] },
      ] },
      { model: Employee, as: 'manager1', required: false },
      { model: Employee, as: 'manager2', required: false },
    ],
    distinct: true,
    order: buildOrder(query.sort, query.dir, models),
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });

  return {
    items: result.rows.map(mapUser),
    pagination: {
      page,
      pageSize,
      totalItems: result.count,
      totalPages: Math.max(1, Math.ceil(result.count / pageSize)),
    },
  };
}

async function getUserDetail(code) {
  const { Employee, User, CostCenterMapping, UserRole, Role } = getModels();
  const employee = await Employee.findOne({
    where: { EMP_CODE: code },
    include: [
      { model: User, as: 'user', required: true, include: [
        { model: CostCenterMapping, as: 'costCenter', required: false },
        { model: UserRole, as: 'userRoles', required: false, include: [{ model: Role, as: 'role', required: false }] },
      ] },
      { model: Employee, as: 'manager1', required: false },
      { model: Employee, as: 'manager2', required: false },
    ],
  });

  return employee ? mapUserDetail(employee) : null;
}

async function setSystemActive(code, enabled, updatedBy) {
  const { User } = getModels();
  const [affectedRows] = await User.update(
    { ENABLED: enabled, UPDATED_DATE: fn('GETDATE'), UPDATED_BY: updatedBy },
    { where: { ID: code } },
  );
  return affectedRows > 0;
}

async function setViewAs(actorCode, targetCode) {
  const { User, Employee } = getModels();
  if (actorCode === targetCode) {
    const error = new Error('You cannot view as yourself.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const target = await Employee.findByPk(targetCode);
  if (!target) {
    const error = new Error(`Employee ${targetCode} was not found.`);
    error.statusCode = 404;
    error.code = 'RESOURCE_NOT_FOUND';
    throw error;
  }
  await User.update(
    { VIEW_AS: targetCode, UPDATED_DATE: fn('GETDATE'), UPDATED_BY: actorCode },
    { where: { ID: actorCode } },
  );
}

async function clearViewAs(actorCode) {
  const { User } = getModels();
  await User.update(
    { VIEW_AS: null, UPDATED_DATE: fn('GETDATE'), UPDATED_BY: actorCode },
    { where: { ID: actorCode } },
  );
}

module.exports = { listUsers, getUserDetail, setSystemActive, setViewAs, clearViewAs };
