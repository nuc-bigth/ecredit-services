const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const { getModels } = require('../models');
const sharePointAttachmentStorage = require('./sharePointAttachmentStorage');

function resourceNotFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = 'RESOURCE_NOT_FOUND';
  return error;
}

function formatUpdatedDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '';

  return `${part('day')} ${part('month')} ${part('year')} ${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}

function mapAttachment(attachment) {
  const record = attachment.get ? attachment.get({ plain: true }) : attachment;
  const initials = record.updatedByEmployee?.INITIALS || '';
  const username = record.updatedByEmployee?.USERNAME || '';

  return {
    id: record.ID,
    originalName: record.ORI_NAME,
    fileSize: Number(record.FILE_SIZE) || 0,
    mimeType: record.MIME_TYPE || '',
    fileUrl: `${config.appBaseUrl}/${config.environment}/api/requests/${encodeURIComponent(record.REQUEST_ID)}/attachments/${encodeURIComponent(record.ID)}/download`,
    description: record.DESCRIPTION,
    attachmentTypeId: record.ATTACHMENT_TYPE_ID,
    updatedBy: [initials, username].filter(Boolean).join('-'),
    updatedDate: formatUpdatedDate(record.UPDATED_DATE),
  };
}

function attachmentInclude(models) {
  return [{
    model: models.Employee,
    as: 'updatedByEmployee',
    attributes: ['INITIALS', 'USERNAME'],
    required: false,
  }];
}

function attachmentAttributes() {
  const attributes = [
    'ID',
    'ORI_NAME',
    'FILE_NAME',
    'FILE_SIZE',
    'MIME_TYPE',
    'DESCRIPTION',
    'ATTACHMENT_TYPE_ID',
    'REQUEST_ID',
    'UPDATED_DATE',
  ];

  if (config.attachments.storageProvider === 'SHAREPOINT') {
    attributes.push('STORAGE_PROVIDER', 'STORAGE_ITEM_ID', 'STORAGE_DRIVE_ID');
  }

  return attributes;
}

function attachmentCreateFields() {
  const fields = [
    'ID',
    'ORI_NAME',
    'FILE_NAME',
    'DESCRIPTION',
    'ATTACHMENT_TYPE_ID',
    'REQUEST_ID',
    'CREATED_DATE',
    'UPDATED_DATE',
    'CREATED_BY',
    'UPDATED_BY',
    'ENABLED',
  ];

  fields.push('STORAGE_PROVIDER', 'STORAGE_PATH', 'FILE_SIZE', 'MIME_TYPE');

  if (config.attachments.storageProvider === 'SHAREPOINT') {
    fields.push('STORAGE_ITEM_ID', 'STORAGE_DRIVE_ID');
  }

  return fields;
}

async function assertActiveRequest(requestId) {
  const { Request } = getModels();
  const request = await Request.findOne({
    where: { ID: requestId, ENABLED: '1' },
    attributes: ['ID'],
  });

  if (!request) {
    throw resourceNotFound(`Request ${requestId} was not found.`);
  }
}

async function listAttachments(requestId) {
  const models = getModels();
  await assertActiveRequest(requestId);
  const attachments = await models.Attachment.findAll({
    where: { REQUEST_ID: requestId, ENABLED: true },
    attributes: attachmentAttributes(),
    include: attachmentInclude(models),
    order: [['UPDATED_DATE', 'DESC']],
  });

  return attachments.map(mapAttachment);
}

async function removeStoredFiles(files) {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => undefined)));
}

async function removeUploadedFiles(files) {
  if (config.attachments.storageProvider === 'SHAREPOINT') {
    await Promise.all(files.map((file) => sharePointAttachmentStorage.remove(file.storageItemId, file.storageDriveId)
      .catch(() => undefined)));
    return;
  }

  await removeStoredFiles(files);
}

async function storeFiles(requestId, files) {
  if (config.attachments.storageProvider !== 'SHAREPOINT') {
    return files.map((file) => ({ ...file, attachmentId: uuidv4() }));
  }

  return Promise.all(files.map(async (file) => {
    const attachmentId = uuidv4();
    const storage = await sharePointAttachmentStorage.upload(file, requestId, attachmentId);
    return {
      ...file,
      attachmentId,
      storageItemId: storage.itemId,
      storageDriveId: storage.driveId,
      storagePath: storage.path,
      storageSize: storage.size,
      storageMimeType: storage.mimeType,
    };
  }));
}

async function createAttachments(requestId, files, updatedBy) {
  const models = getModels();
  await assertActiveRequest(requestId);

  if (!files?.length) {
    const error = new Error('Select at least one file to upload.');
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  let storedFiles = [];
  let transaction;
  try {
    storedFiles = await storeFiles(requestId, files);
    transaction = await models.Attachment.sequelize.transaction();
    const now = models.Attachment.sequelize.fn('GETDATE');
    const attachmentIds = [];
    for (const file of storedFiles) {
      const values = {
        ID: file.attachmentId,
        ORI_NAME: file.originalname,
        FILE_NAME: file.filename,
        DESCRIPTION: '',
        ATTACHMENT_TYPE_ID: config.attachments.defaultTypeId,
        REQUEST_ID: requestId,
        CREATED_DATE: now,
        UPDATED_DATE: now,
        CREATED_BY: updatedBy,
        UPDATED_BY: updatedBy,
        ENABLED: true,
        STORAGE_PROVIDER: config.attachments.storageProvider,
        STORAGE_PATH: file.storagePath || file.filename,
        FILE_SIZE: file.storageSize ?? file.size ?? null,
        MIME_TYPE: file.storageMimeType || file.mimetype || null,
      };
      if (config.attachments.storageProvider === 'SHAREPOINT') {
        Object.assign(values, {
          STORAGE_ITEM_ID: file.storageItemId,
          STORAGE_DRIVE_ID: file.storageDriveId,
        });
      }
      const attachment = await models.Attachment.create(values, {
        fields: attachmentCreateFields(),
        transaction,
      });
      attachmentIds.push(attachment.ID);
    }
    await transaction.commit();

    const attachments = await models.Attachment.findAll({
      where: { ID: attachmentIds },
      attributes: attachmentAttributes(),
      include: attachmentInclude(models),
      order: [['UPDATED_DATE', 'DESC']],
    });
    return attachments.map(mapAttachment);
  } catch (error) {
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError.message;
      }
    }
    await removeUploadedFiles(storedFiles.length ? storedFiles : files);
    throw error;
  }
}

async function getAttachmentDownload(requestId, attachmentId) {
  const models = getModels();
  await assertActiveRequest(requestId);
  const attachment = await models.Attachment.findOne({
    where: { ID: attachmentId, REQUEST_ID: requestId, ENABLED: true },
    attributes: attachmentAttributes(),
  });

  if (!attachment) {
    throw resourceNotFound(`Attachment ${attachmentId} was not found.`);
  }

  const record = attachment.get({ plain: true });
  if (record.STORAGE_PROVIDER === 'SHAREPOINT') {
    if (!record.STORAGE_ITEM_ID || !record.STORAGE_DRIVE_ID) {
      throw resourceNotFound(`Attachment ${attachmentId} has no storage reference.`);
    }

    const download = await sharePointAttachmentStorage.download(record.STORAGE_ITEM_ID, record.STORAGE_DRIVE_ID);
    return { ...download, originalName: record.ORI_NAME };
  }

  const fileName = path.basename(record.FILE_NAME || '');
  if (!fileName || fileName !== record.FILE_NAME) {
    throw resourceNotFound(`Attachment ${attachmentId} has no valid file reference.`);
  }

  const filePath = path.join(config.attachments.storageDirectory, fileName);
  try {
    const stats = await fs.stat(filePath);
    return {
      stream: fsSync.createReadStream(filePath),
      contentLength: stats.size,
      contentType: record.MIME_TYPE || 'application/octet-stream',
      originalName: record.ORI_NAME,
    };
  } catch (error) {
    if (error.code === 'ENOENT') throw resourceNotFound(`Attachment ${attachmentId} file was not found.`);
    throw error;
  }
}

async function softDeleteAttachment(requestId, attachmentId, updatedBy) {
  const models = getModels();
  await assertActiveRequest(requestId);
  const [updatedCount] = await models.Attachment.update(
    { ENABLED: false, UPDATED_BY: updatedBy, UPDATED_DATE: models.Attachment.sequelize.fn('GETDATE') },
    { where: { ID: attachmentId, REQUEST_ID: requestId, ENABLED: true } },
  );

  if (!updatedCount) {
    throw resourceNotFound(`Attachment ${attachmentId} was not found.`);
  }
}

module.exports = {
  createAttachments,
  getAttachmentDownload,
  listAttachments,
  softDeleteAttachment,
};
