const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Role',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      NAME: DataTypes.STRING,
      ENABLED: DataTypes.STRING,
      LEVEL: DataTypes.INTEGER,
    },
    {
      tableName: 'ROLES',
      timestamps: false,
    },
  );
