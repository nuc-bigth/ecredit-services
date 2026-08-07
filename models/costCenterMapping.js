const { DataTypes } = require('sequelize');

// S_MAPPING_COST_CENTER: no dedicated ID column is used by the source query, so
// EMPLOYEE_CODE is treated as the primary key here for read-only Sequelize access.
module.exports = (sequelize) =>
  sequelize.define(
    'CostCenterMapping',
    {
      EMPLOYEE_CODE: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      COST_CENTER_DESC: DataTypes.STRING,
      BU_ID: DataTypes.STRING,
      BU: DataTypes.STRING,
      DEPARTMENT_ID: DataTypes.STRING,
      DEPARTMENT: DataTypes.STRING,
    },
    {
      tableName: 'S_MAPPING_COST_CENTER',
      timestamps: false,
    },
  );
