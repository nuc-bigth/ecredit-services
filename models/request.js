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
      CUSTOMER_TAX_NO: DataTypes.STRING,
      DESCRIPTION: DataTypes.STRING,
      SEARCH_TERM: DataTypes.STRING,
      EXISTING_RATING_ID: DataTypes.STRING,
      REQUESTED_RATING_ID: DataTypes.STRING,
      REQUESTED_LIMIT_AMOUNT: DataTypes.DECIMAL(18, 4),
      REQUESTED_TERM_ID: DataTypes.STRING,
      PROPOSED_VALID_FROM: DataTypes.DATE,
      PROPOSED_VALID_TO: DataTypes.DATE,
      APPROVED_RATING_ID: DataTypes.STRING,
      APPROVED_LIMIT_AMOUNT: DataTypes.DECIMAL(18, 4),
      APPROVED_TERM_ID: DataTypes.STRING,
      IS_PERMANENT_PROPOSED: DataTypes.BOOLEAN,
      IS_TEMPORARY_PROPOSED: DataTypes.BOOLEAN,
      STATUS_ID: DataTypes.STRING,
      REQUESTED_BY: DataTypes.STRING,
      CREATED_DATE: DataTypes.DATE,
      UPDATED_BY: DataTypes.INTEGER,
      UPDATED_DATE: DataTypes.DATE,
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'REQUESTS',
      timestamps: false,
    },
  );
