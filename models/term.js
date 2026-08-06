const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Term',
    {
      ID: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      NAME: DataTypes.STRING,
    },
    {
      tableName: 'TERMS',
      timestamps: false,
    },
  );
