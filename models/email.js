const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Email',
    {
      ID: { type: DataTypes.STRING(128), primaryKey: true },
      NAME: { type: DataTypes.STRING(2048), allowNull: false },
      DESCRIPTION: { type: DataTypes.TEXT('long'), allowNull: false },
      LOG_TYPE_ID: { type: DataTypes.STRING(128), allowNull: false },
      REQUEST_ID: { type: DataTypes.STRING(128) },
      CATEGORY: { type: DataTypes.STRING(2048), allowNull: false },
      CREATED_DATE: { type: DataTypes.DATE, allowNull: false },
      UPDATED_DATE: { type: DataTypes.DATE, allowNull: false },
      CREATED_BY: { type: DataTypes.INTEGER },
      UPDATED_BY: { type: DataTypes.INTEGER },
      ENABLED: { type: DataTypes.BOOLEAN, allowNull: false },
      SORTING: { type: DataTypes.INTEGER },
    },
    { tableName: 'EMAILS', timestamps: false },
  );
