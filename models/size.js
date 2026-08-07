const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Size',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      NAME: DataTypes.STRING,
    },
    {
      tableName: 'SIZES',
      timestamps: false,
    },
  );
