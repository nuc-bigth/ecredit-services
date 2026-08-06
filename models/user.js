const { DataTypes } = require('sequelize');

// USERS: anchor table linking Entra ID identity to employee/role/cost-center data
module.exports = (sequelize) =>
  sequelize.define(
    'User',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
    },
    {
      tableName: 'USERS',
      timestamps: false,
    },
  );
