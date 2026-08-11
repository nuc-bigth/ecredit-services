const path = require('path');
const { Readable } = require('stream');
const config = require('../config/env');

let accessToken;
let accessTokenExpiresAt = 0;

function storageError(message, statusCode = 502, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = 'ATTACHMENT_STORAGE_ERROR';
  error.cause = cause;
  return error;
}

function graphUrl(segment) {
  return `${config.attachments.graph.endpoint}${segment}`;
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;

  const tokenUrl = `https://login.microsoftonline.com/${config.attachments.graph.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.attachments.graph.clientId,
    client_secret: config.attachments.graph.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw storageError('Unable to obtain a Microsoft Graph access token.', response.status);
  }

  const token = await response.json();
  accessToken = token.access_token;
  accessTokenExpiresAt = Date.now() + (Math.max(0, Number(token.expires_in) - 60) * 1000);
  return accessToken;
}

async function graphFetch(segment, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(graphUrl(segment), {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  return response;
}

function createStorageName(attachmentId, originalName) {
  const extension = path.extname(path.basename(originalName)).slice(0, 20).toLowerCase();
  return `${attachmentId}${extension}`;
}

async function upload(file, requestId, attachmentId) {
  const storageName = createStorageName(attachmentId, file.originalname);
  const itemName = `${requestId}-${storageName}`;
  const endpoint = `/drives/${encodeURIComponent(config.attachments.graph.driveId)}/items/${encodeURIComponent(config.attachments.graph.rootFolderId)}:/${encodeURIComponent(itemName)}:/content`;
  const response = await graphFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': file.mimetype || 'application/octet-stream' },
    body: file.buffer,
  });

  if (!response.ok) {
    throw storageError('Unable to upload the attachment to SharePoint.', response.status);
  }

  const item = await response.json();
  return {
    itemId: item.id,
    driveId: item.parentReference?.driveId || config.attachments.graph.driveId,
    path: item.parentReference?.path ? `${item.parentReference.path}/${item.name}` : storageName,
    size: item.size ?? file.size,
    mimeType: item.file?.mimeType || file.mimetype || null,
  };
}

async function remove(itemId, driveId) {
  if (!itemId || !driveId) return;
  const response = await graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw storageError('Unable to remove the SharePoint attachment.', response.status);
  }
}

async function download(itemId, driveId) {
  const response = await graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`);
  if (!response.ok || !response.body) {
    throw storageError('Unable to download the SharePoint attachment.', response.status);
  }

  return {
    stream: Readable.fromWeb(response.body),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    contentLength: response.headers.get('content-length'),
  };
}

module.exports = { download, remove, upload };
