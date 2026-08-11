const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Rating',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      COLOR_CODE: DataTypes.STRING,
      NAME: DataTypes.STRING,
      ENABLED: DataTypes.STRING,
    },
    {
      tableName: 'RATINGS',
      timestamps: false,
    },
  );
