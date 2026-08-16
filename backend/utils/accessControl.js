/* ============================================================
   LockDoc — Access Control & Storage Quota
   Two account tiers:
     - Administrators (hardcoded emails below): unrestricted access,
       no storage limit, no terms-acceptance gate.
     - Customers (everyone else): capped at CUSTOMER_STORAGE_LIMIT_BYTES
       total storage, must accept Terms & Policy before using the app.
   ============================================================ */
const Document = require('../models/Document');

const ADMIN_EMAILS = [
  'sandeeptrangarajan@gmail.com',
  'sandeeptrangarajancse24_27@ksrce.ac.in'
];

const CUSTOMER_STORAGE_LIMIT_BYTES = 3 * 1024 * 1024; // 3 MB per customer account

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').toLowerCase().trim());
}

/** Total bytes currently stored across all of a user's documents. */
async function getStorageUsedBytes(userId) {
  const docs = await Document.find({ ownerId: userId }).select('metadata.size').lean();
  return docs.reduce((sum, doc) => {
    const size = doc.metadata && typeof doc.metadata.size === 'number' ? doc.metadata.size : 0;
    return sum + size;
  }, 0);
}

/**
 * Throws if uploading `incomingFiles` would push a customer account over
 * the 3MB cap. Administrators are always exempt. Call this BEFORE
 * uploading files to storage, so nothing gets written on rejection.
 */
async function assertWithinQuota(user, incomingFiles) {
  if (isAdminEmail(user.email)) return;

  const currentUsedBytes = await getStorageUsedBytes(user._id);
  const incomingBytes = (incomingFiles || []).reduce((sum, f) => sum + (f.size || 0), 0);

  if (currentUsedBytes + incomingBytes > CUSTOMER_STORAGE_LIMIT_BYTES) {
    const usedMB = (currentUsedBytes / (1024 * 1024)).toFixed(2);
    const limitMB = (CUSTOMER_STORAGE_LIMIT_BYTES / (1024 * 1024)).toFixed(0);
    const incomingMB = (incomingBytes / (1024 * 1024)).toFixed(2);
    const err = new Error(
      `Storage limit exceeded: you've used ${usedMB}MB of your ${limitMB}MB limit, ` +
      `and this upload needs ${incomingMB}MB more. Delete a document to free up space.`
    );
    err.code = 'STORAGE_QUOTA_EXCEEDED';
    throw err;
  }
}

module.exports = {
  ADMIN_EMAILS,
  CUSTOMER_STORAGE_LIMIT_BYTES,
  isAdminEmail,
  getStorageUsedBytes,
  assertWithinQuota
};
