const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'LogType',
    {
      ID: { type: DataTypes.STRING, primaryKey: true },
      NAME: DataTypes.STRING,
      ENABLED: DataTypes.BOOLEAN,
      SORTING: DataTypes.INTEGER,
    },
    {
      tableName: 'LOG_TYPES',
      timestamps: false,
    },
  );
