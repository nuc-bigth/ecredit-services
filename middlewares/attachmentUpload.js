const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

const storage = multer.diskStorage({
  destination(req, file, callback) {
    fs.mkdir(config.attachments.storageDirectory, { recursive: true }, (error) => {
      callback(error, config.attachments.storageDirectory);
    });
  },
  filename(req, file, callback) {
    const extension = path.extname(path.basename(file.originalname)).slice(0, 20).toLowerCase();
    callback(null, `${uuidv4()}${extension}`);
  },
});

const attachmentUpload = multer({
  storage: config.attachments.storageProvider === 'SHAREPOINT' ? multer.memoryStorage() : storage,
  limits: { fileSize: config.attachments.maxFileSize },
});

module.exports = attachmentUpload;
