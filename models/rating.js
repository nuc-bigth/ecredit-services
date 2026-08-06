const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Rating',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      NAME: DataTypes.STRING,
    },
    {
      tableName: 'RATINGS',
      timestamps: false,
    },
  );
