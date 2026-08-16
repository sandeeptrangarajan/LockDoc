/* ============================================================
   LockDoc — Verification Receipt Service
   Issues a signed, encrypted "receipt" proving a document was
   viewed/verified in a given session — reuses the same signing
   pattern already used for vault QR codes (see qrService.js).
   ============================================================ */
const crypto = require('crypto');
const { encryptPayload, decryptPayload } = require('../utils/qrCrypto');
const VerificationReceipt = require('../models/VerificationReceipt');
const DocumentRequest = require('../models/DocumentRequest');
const Document = require('../models/Document');
const User = require('../models/User');

const RECEIPT_VERSION = 1;

function signPayload(payloadWithoutSignature) {
  const secret = (process.env.QR_SECRET || '').trim();
  return crypto.createHmac('sha256', secret)
    .update(JSON.stringify(payloadWithoutSignature))
    .digest('hex');
}

/**
 * Issue a receipt for a document request that has already been
 * approved and viewed. Callable once the viewer's session is
 * validated (or explicitly confirmed by the verifier).
 */
async function issueReceipt(requestId, verifierUser) {
  const docRequest = await DocumentRequest.findById(requestId);
  if (!docRequest) {
    throw new Error('Document request not found.');
  }
  if (docRequest.status !== 'approved') {
    throw new Error('Cannot issue a receipt for a request that was not approved.');
  }
  if (String(docRequest.requesterId) !== String(verifierUser._id)) {
    throw new Error('Only the requester of this session can issue its receipt.');
  }

  const document = await Document.findById(docRequest.documentId);
  if (!document) {
    throw new Error('Document not found.');
  }

  const ownerUser = await User.findById(docRequest.ownerId);
  if (!ownerUser) {
    throw new Error('Document owner not found.');
  }

  const verifiedAt = new Date();

  const payloadCore = {
    requestId: docRequest._id.toString(),
    ownerId: docRequest.ownerId.toString(),
    verifierId: verifierUser._id.toString(),
    documentType: document.documentType,
    verifiedAt: verifiedAt.getTime(),
    version: RECEIPT_VERSION
  };
  const signature = signPayload(payloadCore);
  const receiptToken = encryptPayload({ ...payloadCore, signature });

  const receipt = await VerificationReceipt.create({
    requestId: docRequest._id,
    ownerId: docRequest.ownerId,
    verifierId: verifierUser._id,
    ownerName: ownerUser.fullName,
    verifierName: verifierUser.fullName || 'Unknown',
    documentName: document.documentName,
    documentType: document.documentType,
    verifiedAt,
    receiptToken
  });

  return receipt;
}

/**
 * Validate + decode a receipt token. Deliberately does NOT require
 * authentication — a third party (e.g. a hotel back office, or an
 * auditor) should be able to confirm a receipt is genuine without
 * needing a LockDoc account, and without ever seeing the document.
 */
async function verifyReceiptToken(receiptToken) {
  let payload;
  try {
    payload = decryptPayload(receiptToken);
  } catch (err) {
    throw new Error('Invalid or corrupted receipt.');
  }

  const { signature, ...rest } = payload;
  const expectedSig = signPayload(rest);
  if (signature !== expectedSig) {
    throw new Error('Receipt signature invalid — possible tampering.');
  }

  const receipt = await VerificationReceipt.findOne({ receiptToken });
  if (!receipt) {
    throw new Error('Receipt not found.');
  }
  if (receipt.status === 'revoked') {
    throw new Error('This receipt has been revoked.');
  }

  return receipt;
}

async function listReceiptsForOwner(ownerId) {
  return VerificationReceipt.find({ ownerId }).sort({ createdAt: -1 });
}

async function listReceiptsForVerifier(verifierId) {
  return VerificationReceipt.find({ verifierId }).sort({ createdAt: -1 });
}

module.exports = {
  issueReceipt,
  verifyReceiptToken,
  listReceiptsForOwner,
  listReceiptsForVerifier
};
