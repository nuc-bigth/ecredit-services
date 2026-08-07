const { DataTypes } = require('sequelize');

// USER_PERMISSIONS: per-user override layered on top of role-derived permissions.
// A row here wins over the role-derived default for that (USER_ID, PERMISSION_ID) pair.
module.exports = (sequelize) =>
  sequelize.define(
    'UserPermission',
    {
      USER_ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      PERMISSION_ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'USER_PERMISSIONS',
      timestamps: false,
    },
  );
