const { DataTypes } = require('sequelize');

// A user can have several roles, so USER_ID cannot be the primary key
// (Sequelize would collapse included rows that share the same key).
module.exports = (sequelize) =>
  sequelize.define(
    'UserRole',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      USER_ID: DataTypes.STRING,
      ROLE_ID: DataTypes.STRING,
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'USER_ROLES',
      timestamps: false,
    },
  );
