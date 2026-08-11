const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Attachment',
    {
      ID: { type: DataTypes.STRING, primaryKey: true },
      ORI_NAME: DataTypes.STRING,
      FILE_NAME: DataTypes.STRING,
      STORAGE_PROVIDER: DataTypes.STRING,
      STORAGE_ITEM_ID: DataTypes.STRING,
      STORAGE_DRIVE_ID: DataTypes.STRING,
      STORAGE_PATH: DataTypes.STRING,
      FILE_SIZE: DataTypes.BIGINT,
      MIME_TYPE: DataTypes.STRING,
      DESCRIPTION: DataTypes.TEXT,
      ATTACHMENT_TYPE_ID: DataTypes.STRING,
      REQUEST_ID: DataTypes.STRING,
      CREATED_DATE: DataTypes.DATE,
      UPDATED_DATE: DataTypes.DATE,
      CREATED_BY: DataTypes.STRING,
      UPDATED_BY: DataTypes.STRING,
      ENABLED: DataTypes.BOOLEAN,
      SORTING: DataTypes.INTEGER,
    },
    {
      tableName: 'ATTACHMENTS',
      timestamps: false,
    },
  );
