const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'CustomerLog',
    {
      ID: { type: DataTypes.STRING(128), primaryKey: true },
      TAX_NO: DataTypes.STRING(13),
      NAME: DataTypes.STRING(2048),
      DESCRIPTION: DataTypes.TEXT,
      LOG_TYPE_ID: DataTypes.STRING(128),
      CUSTOMER_ID: DataTypes.STRING(128),
      CATEGORY: DataTypes.STRING(2048),
      CREATED_DATE: DataTypes.DATE,
      UPDATED_DATE: DataTypes.DATE,
      CREATED_BY: DataTypes.INTEGER,
      UPDATED_BY: DataTypes.INTEGER,
      ENABLED: DataTypes.BOOLEAN,
      SORTING: DataTypes.INTEGER,
    },
    {
      tableName: 'CUSTOMER_LOGS',
      timestamps: false,
    },
  );
