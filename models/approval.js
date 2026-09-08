const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Approval',
    {
      ID: { type: DataTypes.STRING, primaryKey: true },
      REQUEST_ID: DataTypes.STRING,
      APPROVER_TYPE_ID: DataTypes.STRING,
      APPROVAL_TYPE_ID: DataTypes.STRING,
      APPROVER_ID: DataTypes.INTEGER,
      DESCRIPTION: DataTypes.TEXT,
      LIMIT_AMOUNT: DataTypes.DECIMAL(18, 4),
      TERM_ID: DataTypes.STRING,
      RATING_ID: DataTypes.STRING,
      IS_PERMANENT: DataTypes.BOOLEAN,
      IS_TEMPORARY: DataTypes.BOOLEAN,
      VALID_FROM: DataTypes.DATE,
      VALID_TO: DataTypes.DATE,
      IS_CLEAR_OUTSTANDING_BALANCE: DataTypes.BOOLEAN,
      IS_WITHIN_APPROVED_LIMIT: DataTypes.BOOLEAN,
      IS_BANK_GUARANTEE: DataTypes.BOOLEAN,
      BANK_GUARANTEE_AMOUNT: DataTypes.DECIMAL(18, 4),
      IS_CASH_DEPOSIT: DataTypes.BOOLEAN,
      CASH_DEPOSIT_AMOUNT: DataTypes.DECIMAL(18, 4),
      UPDATED_BY: DataTypes.INTEGER,
      UPDATED_DATE: DataTypes.DATE,
      ENABLED: DataTypes.BOOLEAN,
    },
    {
      tableName: 'APPROVALS',
      timestamps: false,
    },
  );
