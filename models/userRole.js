const { DataTypes } = require('sequelize');

// USER_ROLES: no dedicated ID column is used by the source query, so USER_ID is
// treated as the primary key here for read-only Sequelize access.
module.exports = (sequelize) =>
  sequelize.define(
    'UserRole',
    {
      USER_ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      ROLE_ID: DataTypes.STRING,
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'USER_ROLES',
      timestamps: false,
    },
  );
