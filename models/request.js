const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Request',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      NO: DataTypes.STRING,
      CUSTOMER_NAME_TH: DataTypes.STRING,
      CUSTOMER_NAME_ENG: DataTypes.STRING,
      REQUESTED_SALES_GROUP: DataTypes.STRING,
      CRM_NO: DataTypes.STRING,
      SOLD_TO: DataTypes.STRING,
      DESCRIPTION: DataTypes.STRING,
      SEARCH_TERM: DataTypes.STRING,
      REQUESTED_RATING_ID: DataTypes.STRING,
      REQUESTED_LIMIT_AMOUNT: DataTypes.DECIMAL(18, 4),
      REQUESTED_TERM_ID: DataTypes.STRING,
      APPROVED_RATING_ID: DataTypes.STRING,
      APPROVED_LIMIT_AMOUNT: DataTypes.DECIMAL(18, 4),
      APPROVED_TERM_ID: DataTypes.STRING,
      STATUS_ID: DataTypes.STRING,
      REQUESTED_BY: DataTypes.STRING,
      UPDATED_BY: DataTypes.STRING,
      UPDATED_DATE: DataTypes.DATE,
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'REQUESTS',
      timestamps: false,
    },
  );
