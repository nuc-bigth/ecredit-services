const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Customer',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      TAX_NO: DataTypes.STRING,
      REGISTERED_DATE: DataTypes.DATE,
      REGISTERED_CAPITAL_AMOUNT: DataTypes.DECIMAL(18, 4),
      SIZE_ID: DataTypes.STRING,
      BUSINESS_TYPE_INTER: DataTypes.STRING,
      CUSTOMER_TYPE_INTER: DataTypes.STRING,
      BUSINESS_TYPE_EXTER: DataTypes.STRING,
      CUSTOMER_TYPE_EXTER: DataTypes.STRING,
      SHAREHOLDERS: DataTypes.STRING,
      DIRECTORS: DataTypes.STRING,
      UPDATED_BY: DataTypes.STRING,
      UPDATED_DATE: DataTypes.DATE,
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'CUSTOMERS',
      timestamps: false,
    },
  );
