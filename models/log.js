const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Log',
    {
      ID: { type: DataTypes.STRING, primaryKey: true },
      NAME: DataTypes.STRING,
      DESCRIPTION: DataTypes.TEXT,
      LOG_TYPE_ID: DataTypes.STRING,
      CATEGORY: DataTypes.STRING,
      REQUEST_ID: DataTypes.STRING,
      CREATED_DATE: DataTypes.DATE,
      UPDATED_DATE: DataTypes.DATE,
      CREATED_BY: DataTypes.INTEGER,
      UPDATED_BY: DataTypes.INTEGER,
      ENABLED: DataTypes.BOOLEAN,
      SORTING: DataTypes.INTEGER,
    },
    {
      tableName: 'LOGS',
      timestamps: false,
    },
  );
