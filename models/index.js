const defineUser = require('./user');
const defineEmployee = require('./employee');
const defineRole = require('./role');
const defineUserRole = require('./userRole');
const defineCostCenterMapping = require('./costCenterMapping');
const defineRequest = require('./request');
const defineRating = require('./rating');
const defineTerm = require('./term');
const defineStatus = require('./status');

/**
 * Sequelize model registry
 * Models must be initialized once via initModels(sequelize) after the DB
 * connection is established (see app.js), then retrieved via getModels().
 */
let models = null;

function initModels(sequelize) {
  const User = defineUser(sequelize);
  const Employee = defineEmployee(sequelize);
  const Role = defineRole(sequelize);
  const UserRole = defineUserRole(sequelize);
  const CostCenterMapping = defineCostCenterMapping(sequelize);
  const Request = defineRequest(sequelize);
  const Rating = defineRating(sequelize);
  const Term = defineTerm(sequelize);
  const Status = defineStatus(sequelize);

  // TB1 -> TB2 (USERS.ID = S_EMPLOYEE1.EMP_CODE)
  User.hasOne(Employee, { as: 'employee', foreignKey: 'EMP_CODE', sourceKey: 'ID' });
  Employee.belongsTo(User, { as: 'user', foreignKey: 'EMP_CODE', targetKey: 'ID' });

  // TB1 -> TB3 (USERS.VIEW_AS = S_EMPLOYEE1.EMP_CODE)
  User.belongsTo(Employee, { as: 'viewAsEmployee', foreignKey: 'VIEW_AS', targetKey: 'EMP_CODE' });

  // TB3 -> TB5 / TB3 -> TB6 (self-join via APPROVER_ID1 / APPROVER_ID2)
  Employee.belongsTo(Employee, { as: 'manager1', foreignKey: 'APPROVER_ID1', targetKey: 'EMP_CODE' });
  Employee.belongsTo(Employee, { as: 'manager2', foreignKey: 'APPROVER_ID2', targetKey: 'EMP_CODE' });

  // TB1 -> TB4 (USERS.ID = S_MAPPING_COST_CENTER.EMPLOYEE_CODE)
  User.hasOne(CostCenterMapping, { as: 'costCenter', foreignKey: 'EMPLOYEE_CODE', sourceKey: 'ID' });

  // TB1 -> TB2 (USERS.ID = USER_ROLES.USER_ID), TB2 -> ROLES
  User.hasMany(UserRole, { as: 'userRoles', foreignKey: 'USER_ID', sourceKey: 'ID' });
  UserRole.belongsTo(Role, { as: 'role', foreignKey: 'ROLE_ID' });

  Request.belongsTo(Rating, { as: 'requestedRating', foreignKey: 'REQUESTED_RATING_ID' });
  Request.belongsTo(Rating, { as: 'approvedRating', foreignKey: 'APPROVED_RATING_ID' });
  Request.belongsTo(Term, { as: 'requestedTerm', foreignKey: 'REQUESTED_TERM_ID' });
  Request.belongsTo(Term, { as: 'approvedTerm', foreignKey: 'APPROVED_TERM_ID' });
  Request.belongsTo(Status, { as: 'status', foreignKey: 'STATUS_ID' });
  Request.belongsTo(Employee, { as: 'requestedByEmployee', foreignKey: 'REQUESTED_BY', targetKey: 'EMP_CODE' });
  Request.belongsTo(Employee, { as: 'updatedByEmployee', foreignKey: 'UPDATED_BY', targetKey: 'EMP_CODE' });

  models = {
    User,
    Employee,
    Role,
    UserRole,
    CostCenterMapping,
    Request,
    Rating,
    Term,
    Status,
  };
  return models;
}

function getModels() {
  if (!models) {
    throw new Error('Models not initialized. Call initModels(sequelize) after initializeDatabase().');
  }
  return models;
}

module.exports = {
  initModels,
  getModels,
};
