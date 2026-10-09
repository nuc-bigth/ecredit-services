const { Op } = require('sequelize');
const { getModels } = require('../models');
const { getDatabase } = require('../config/database');
const errorCodes = require('../helpers/errorCodes');

/**
 * Resolve the set of PERMISSION_IDs granted to a user via their assigned roles.
 * Mirrors the legacy raw SQL: ROLE_PERMISSIONS joined to ROLES/PERMISSIONS (both ENABLED='1'),
 * restricted to the ROLE_IDs found in USER_ROLES for this user.
 */
async function getRoleGrantedPermissionIds(userId) {
  const { UserRole, RolePermission, Role, Permission } = getModels();

  const userRoles = await UserRole.findAll({
    where: { USER_ID: userId, ENABLED: '1' },
    attributes: ['ROLE_ID'],
  });
  const roleIds = [...new Set(userRoles.map((userRole) => userRole.ROLE_ID))];

  if (roleIds.length === 0) {
    return new Set();
  }

  const rolePermissions = await RolePermission.findAll({
    where: { ROLE_ID: { [Op.in]: roleIds }, ENABLED: '1' },
    include: [
      { model: Role, as: 'role', required: true, where: { ENABLED: '1' } },
      { model: Permission, as: 'permission', required: true, where: { ENABLED: '1' } },
    ],
  });

  // Dedup: the same permission can be granted by more than one of the user's roles.
  return new Set(rolePermissions.map((rolePermission) => rolePermission.PERMISSION_ID));
}

/**
 * Full permission catalog for a user, each flagged with its role-derived GRANTED state.
 */
async function getEffectivePermissions(userId) {
  const { Permission, UserPermission } = getModels();

  const [catalog, roleGrantedIds, overrides] = await Promise.all([
    Permission.findAll({ where: { ENABLED: '1' }, order: [['SORTING', 'ASC'], ['NAME', 'ASC']] }),
    getRoleGrantedPermissionIds(userId),
    UserPermission.findAll({ where: { USER_ID: userId }, attributes: ['PERMISSION_ID', 'ENABLED'] }),
  ]);
  const overridesByPermission = new Map(overrides.map((override) => [String(override.PERMISSION_ID), override.ENABLED === '1' || override.ENABLED === true || override.ENABLED === 1]));

  return catalog.map((permission) => ({
    ID: permission.ID,
    NAME: permission.NAME,
    GRANTED: overridesByPermission.has(String(permission.ID))
      ? overridesByPermission.get(String(permission.ID))
      : roleGrantedIds.has(permission.ID),
  }));
}

/**
 * Apply checkbox selections to the ROLE_PERMISSIONS records identified by permission name.
 */
async function updateRolePermissions(userId, selections) {
  const { Permission, RolePermission, UserRole } = getModels();
  const sequelize = getDatabase();

  const userRoles = await UserRole.findAll({
    where: { USER_ID: userId, ENABLED: '1' },
    attributes: ['ROLE_ID'],
  });
  const roleIds = [...new Set(userRoles.map((userRole) => userRole.ROLE_ID))];
  if (roleIds.length === 0) {
    const error = new Error('User has no enabled roles to update.');
    error.statusCode = 400;
    error.code = errorCodes.VALIDATION_ERROR;
    throw error;
  }

  const names = [...new Set(selections.map((selection) => selection.NAME))];
  const catalog = await Permission.findAll({
    where: { ENABLED: '1', NAME: { [Op.in]: names } },
    attributes: ['ID', 'NAME'],
  });
  const permissionIdsByName = new Map(catalog.map((permission) => [permission.NAME, permission.ID]));

  const unknown = selections.find((selection) => !permissionIdsByName.has(selection.NAME));
  if (unknown) {
    const error = new Error(`Unknown active permission name: ${unknown.NAME}`);
    error.statusCode = 400;
    error.code = errorCodes.VALIDATION_ERROR;
    throw error;
  }

  await sequelize.transaction(async (transaction) => {
    for (const selection of selections) {
      const permissionId = permissionIdsByName.get(selection.NAME);
      const where = { PERMISSION_ID: permissionId, ROLE_ID: { [Op.in]: roleIds } };

      if (!selection.GRANTED) {
        where.ENABLED = '1';
      }

      await RolePermission.update({ ENABLED: selection.GRANTED ? '1' : '0' }, { where, transaction });
    }
  });

  return getEffectivePermissions(userId);
}

async function updateUserPermissionOverrides(userId, selections) {
  const { Permission, UserPermission } = getModels();
  const sequelize = getDatabase();
  const names = [...new Set(selections.map((selection) => selection.NAME))];
  const catalog = await Permission.findAll({
    where: { ENABLED: '1', NAME: { [Op.in]: names } },
    attributes: ['ID', 'NAME'],
  });
  const permissionIdsByName = new Map(catalog.map((permission) => [permission.NAME, String(permission.ID)]));
  const unknown = selections.find((selection) => !permissionIdsByName.has(selection.NAME));
  if (unknown) {
    const error = new Error(`Unknown active permission name: ${unknown.NAME}`);
    error.statusCode = 400;
    error.code = errorCodes.VALIDATION_ERROR;
    throw error;
  }

  await sequelize.transaction(async (transaction) => {
    for (const selection of selections) {
      const permissionId = permissionIdsByName.get(selection.NAME);
      const values = { ENABLED: selection.GRANTED ? '1' : '0' };
      const existing = await UserPermission.findOne({
        where: { USER_ID: userId, PERMISSION_ID: permissionId },
        transaction,
      });
      if (existing) {
        await existing.update(values, { transaction });
      } else {
        await UserPermission.create({ USER_ID: userId, PERMISSION_ID: permissionId, ...values }, { transaction });
      }
    }
  });

  return getEffectivePermissions(userId);
}

module.exports = {
  getEffectivePermissions,
  updateRolePermissions,
  updateUserPermissionOverrides,
};
