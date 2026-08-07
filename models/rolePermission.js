const { DataTypes } = require('sequelize');

// ROLE_PERMISSIONS: no dedicated ID column is used by the source query, so ROLE_ID is
// treated as the primary key here for read-only Sequelize access.
module.exports = (sequelize) =>
  sequelize.define(
    'RolePermission',
    {
      ROLE_ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      PERMISSION_ID: DataTypes.STRING,
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'ROLE_PERMISSIONS',
      timestamps: false,
    },
  );
