const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Status',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      NAME: DataTypes.STRING,
    },
    {
      tableName: 'STATUS',
      timestamps: false,
    },
  );
