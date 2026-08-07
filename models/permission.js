const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Permission',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      NAME: DataTypes.STRING,
      ENABLED: DataTypes.STRING,
      SORTING: DataTypes.INTEGER,
    },
    {
      tableName: 'PERMISSIONS',
      timestamps: false,
    },
  );
