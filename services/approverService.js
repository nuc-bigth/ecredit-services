const { randomUUID } = require('crypto');
const { QueryTypes } = require('sequelize');
const { getDatabase } = require('../config/database');

const SORT_FIELDS = {
  CODE: 'TB2.EMP_CODE',
  NAME: 'TB2.NAME_ENG',
  USER: 'TB2.USERNAME',
  EMAIL: 'TB2.CURRENT_EMAIL',
  ACTIVE: 'TB1.ENABLED',
};

function normalizePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isEnabled(value) {
  return value === true || value === 1 || value === '1';
}

function buildFilters(query) {
  const filters = ['1 = 1'];
  const replacements = {};
  const fields = { CODE: 'TB2.EMP_CODE', NAME: 'TB2.NAME_ENG', USER: "CONCAT(TB2.INITIALS, '-', TB2.USERNAME)", EMAIL: 'TB2.CURRENT_EMAIL' };

  Object.entries(fields).forEach(([key, field]) => {
    const value = typeof query[key] === 'string' ? query[key].trim() : '';
    if (!value) return;
    filters.push(`${field} LIKE :filter${key}`);
    replacements[`filter${key}`] = `%${value}%`;
  });

  return { clause: filters.join(' AND '), replacements };
}

function mapApprover(row) {
  return {
    ID: String(row.ID),
    CODE: row.CODE == null ? '' : String(row.CODE),
    NAME: row.NAME || '',
    USER: row.USER || '',
    EMAIL: row.EMAIL || '',
    ACTIVE: isEnabled(row.ACTIVE),
  };
}

async function listApprovers(query = {}) {
  const database = getDatabase();
  const page = normalizePage(query.page, 1);
  const pageSize = Math.min(normalizePage(query.pageSize, 25), 100);
  const direction = String(query.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const sortField = SORT_FIELDS[query.sort] || SORT_FIELDS.CODE;
  const { clause, replacements } = buildFilters(query);
  const offset = (page - 1) * pageSize;

  const [countRows, rows] = await Promise.all([
    database.query(
      `SELECT COUNT(1) AS TOTAL
       FROM APPROVERS AS TB1
       LEFT JOIN S_EMPLOYEE1 AS TB2 ON TB1.APPROVER_ID = TB2.EMP_CODE
       WHERE ${clause}`,
      { replacements, type: QueryTypes.SELECT },
    ),
    database.query(
      `SELECT TB1.ID,
              TB2.EMP_CODE AS CODE,
              TB2.NAME_ENG AS NAME,
              CONCAT(TB2.INITIALS, '-', TB2.USERNAME) AS [USER],
              TB2.CURRENT_EMAIL AS EMAIL,
              TB1.ENABLED AS ACTIVE
       FROM APPROVERS AS TB1
       LEFT JOIN S_EMPLOYEE1 AS TB2 ON TB1.APPROVER_ID = TB2.EMP_CODE
       WHERE ${clause}
       ORDER BY ${sortField} ${direction}, TB1.ID ASC
       OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      { replacements: { ...replacements, offset, pageSize }, type: QueryTypes.SELECT },
    ),
  ]);

  const totalItems = Number(countRows[0]?.TOTAL || 0);
  return {
    items: rows.map(mapApprover),
    pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) },
  };
}

async function listEmployeeOptions(search = '') {
  const database = getDatabase();
  const value = typeof search === 'string' ? search.trim() : '';
  const rows = await database.query(
    `SELECT TOP 100 EMP_CODE AS CODE,
            NAME_ENG AS NAME,
            CONCAT(INITIALS, '-', USERNAME) AS [USER],
            CURRENT_EMAIL AS EMAIL
     FROM S_EMPLOYEE1
     WHERE WORK_STATUS = '3'
       AND (:search = '' OR EMP_CODE LIKE :pattern OR NAME_ENG LIKE :pattern OR USERNAME LIKE :pattern OR CURRENT_EMAIL LIKE :pattern)
     ORDER BY NAME_ENG ASC, EMP_CODE ASC`,
    { replacements: { search: value, pattern: `%${value}%` }, type: QueryTypes.SELECT },
  );
  return rows.map((row) => ({ CODE: String(row.CODE), NAME: row.NAME || '', USER: row.USER || '', EMAIL: row.EMAIL || '' }));
}

async function findApprover(id) {
  const database = getDatabase();
  const rows = await database.query(
    `SELECT TOP 1 ID, APPROVER_ID, ENABLED
     FROM APPROVERS
     WHERE ID = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows[0] || null;
}

async function ensureEmployeeExists(employeeCode) {
  const database = getDatabase();
  const rows = await database.query(
    `SELECT TOP 1 EMP_CODE
     FROM S_EMPLOYEE1
     WHERE EMP_CODE = :employeeCode`,
    { replacements: { employeeCode }, type: QueryTypes.SELECT },
  );
  return Boolean(rows[0]);
}

async function createApprover(employeeCode, enabled, actorCode) {
  const database = getDatabase();
  if (!(await ensureEmployeeExists(employeeCode))) return { kind: 'employee-not-found' };

  const existing = await database.query(
    `SELECT TOP 1 ID, ENABLED
     FROM APPROVERS
     WHERE APPROVER_ID = :employeeCode
     ORDER BY CASE WHEN ENABLED = '1' THEN 0 ELSE 1 END, ID`,
    { replacements: { employeeCode }, type: QueryTypes.SELECT },
  );
  if (existing[0]?.ENABLED === true || existing[0]?.ENABLED === 1 || existing[0]?.ENABLED === '1') return { kind: 'duplicate' };

  const id = randomUUID();
  await database.query(
    `INSERT INTO APPROVERS (ID, APPROVER_ID, ENABLED, CREATED_BY, CREATED_DATE, UPDATED_BY, UPDATED_DATE)
     VALUES (:id, :employeeCode, :enabled, :actorCode, GETDATE(), :actorCode, GETDATE())`,
    { replacements: { id, employeeCode, enabled: enabled ? '1' : '0', actorCode }, type: QueryTypes.INSERT },
  );
  return { item: await getApproverById(id) };
}

async function getApproverById(id) {
  const database = getDatabase();
  const rows = await database.query(
    `SELECT TOP 1 TB1.ID,
            TB2.EMP_CODE AS CODE,
            TB2.NAME_ENG AS NAME,
            CONCAT(TB2.INITIALS, '-', TB2.USERNAME) AS [USER],
            TB2.CURRENT_EMAIL AS EMAIL,
            TB1.ENABLED AS ACTIVE
     FROM APPROVERS AS TB1
     LEFT JOIN S_EMPLOYEE1 AS TB2 ON TB1.APPROVER_ID = TB2.EMP_CODE
     WHERE TB1.ID = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows[0] ? mapApprover(rows[0]) : null;
}

async function updateApprover(id, employeeCode, enabled, actorCode) {
  const database = getDatabase();
  if (!(await ensureEmployeeExists(employeeCode))) return { kind: 'employee-not-found' };
  const current = await findApprover(id);
  if (!current) return { kind: 'not-found' };

  const duplicate = await database.query(
    `SELECT TOP 1 ID
     FROM APPROVERS
     WHERE APPROVER_ID = :employeeCode AND ID <> :id AND ENABLED = '1'`,
    { replacements: { employeeCode, id }, type: QueryTypes.SELECT },
  );
  if (duplicate[0]) return { kind: 'duplicate' };

  await database.query(
    `UPDATE APPROVERS
     SET APPROVER_ID = :employeeCode,
         ENABLED = :enabled,
         UPDATED_BY = :actorCode,
         UPDATED_DATE = GETDATE()
     WHERE ID = :id`,
    { replacements: { id, employeeCode, enabled: enabled ? '1' : '0', actorCode }, type: QueryTypes.UPDATE },
  );
  return { item: await getApproverById(id) };
}

async function setActive(id, enabled, actorCode) {
  const database = getDatabase();
  const [result] = await database.query(
    `UPDATE APPROVERS
     SET ENABLED = :enabled, UPDATED_BY = :actorCode, UPDATED_DATE = GETDATE()
     WHERE ID = :id`,
    { replacements: { id, enabled: enabled ? '1' : '0', actorCode }, type: QueryTypes.UPDATE },
  );
  return result > 0 ? { item: await getApproverById(id) } : { kind: 'not-found' };
}

async function softDelete(id, actorCode) {
  return setActive(id, false, actorCode);
}

module.exports = { listApprovers, listEmployeeOptions, createApprover, updateApprover, setActive, softDelete };
