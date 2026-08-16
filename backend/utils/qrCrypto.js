const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const secret = (process.env.QR_SECRET || '').trim();
  if (!secret) {
    throw new Error('QR_SECRET is not set in backend/.env');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptPayload(payloadObj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(payloadObj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

function decryptPayload(packedString) {
  const key = getKey();
  const raw = Buffer.from(packedString, 'base64url');

  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

module.exports = { encryptPayload, decryptPayload };
