const { isSystemAdminRole } = require('./roleAuthorization');

function employeeCode(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  const code = Number(normalized);
  return Number.isSafeInteger(code) ? code : null;
}

function effectiveEmployeeCode(profile) {
  return employeeCode(profile?.EFFECTIVE_CODE || profile?.CODE);
}

function mainEmployeeCode(profile) {
  return employeeCode(profile?.LOGGED_IN_CODE || profile?.MAIN_CODE || profile?.CODE);
}

function isMainSystemAdmin(profile) {
  return isSystemAdminRole(profile?.LOGGED_IN_ROLE, profile?.LOGGED_IN_ROLE_ID);
}

function approvalAuditEmployeeCode(profile) {
  return isMainSystemAdmin(profile) ? mainEmployeeCode(profile) : effectiveEmployeeCode(profile);
}

module.exports = {
  employeeCode,
  effectiveEmployeeCode,
  mainEmployeeCode,
  isMainSystemAdmin,
  approvalAuditEmployeeCode,
};
