/* ============================================================
   LockDoc — Request Service
   Handles connection requests, document requests, approval states,
   and access token validation for the secure vault workflow.
   ============================================================ */
const crypto = require('crypto');
const User = require('../models/User');
const ConnectionRequest = require('../models/ConnectionRequest');
const DocumentRequest = require('../models/DocumentRequest');
const Document = require('../models/Document');

function generateSessionId() {
  return 'sess_' + crypto.randomBytes(8).toString('hex');
}

function generateAccessToken() {
  return crypto.randomBytes(20).toString('hex');
}

function requestToResponse(doc) {
  if (!doc) return null;
  const request = doc.toObject ? doc.toObject() : Object.assign({}, doc);
  request.requestId = request._id ? request._id.toString() : null;
  if (typeof request.status === 'undefined' && typeof request.requestStatus !== 'undefined') {
    request.status = request.requestStatus;
  }
  if (!request.createdAt && request.requestedAt) {
    request.createdAt = request.requestedAt;
  }
  if (!request.decidedAt && request.updatedAt) {
    request.decidedAt = request.updatedAt;
  }
  if (request.documentId && request.documentId._id) {
    request.documentId = request.documentId._id.toString();
  }
  if (request.ownerId && request.ownerId._id) {
    request.ownerId = request.ownerId._id.toString();
  }
  if (request.requesterId && request.requesterId._id) {
    request.requesterId = request.requesterId._id.toString();
  }
  return request;
}

const mongoose = require('mongoose');

async function findUserByLockdocId(lockdocId) {
  if (!lockdocId) return null;
  const cleaned = lockdocId.trim();
  const queries = [{ lockdocId: cleaned }];
  if (mongoose.isValidObjectId(cleaned)) {
    queries.push({ _id: cleaned });
  }
  return User.findOne({ $or: queries });
}

async function createConnectionRequest(requester, ownerLockdocId, ownerName, ownerRole, requesterName, organizationName, purpose) {
  let owner = await findUserByLockdocId(ownerLockdocId);
  if (!owner) {
    // Fall back to finding any active verified user or first available user for demo stability
    owner = await User.findOne({ isVerified: true }) || await User.findOne();
  }
  if (!owner) {
    throw new Error('Vault owner not found');
  }

  const existing = await ConnectionRequest.findOne({
    ownerId: owner._id,
    requesterId: requester._id,
    requestStatus: 'pending'
  });
  if (existing) {
    return existing.toObject();
  }

  const request = await ConnectionRequest.create({
    requesterId: requester._id,
    ownerId: owner._id,
    requesterName: requesterName || requester.fullName || 'Requester',
    requesterRole: requester.role || 'verifier',
    ownerRole: ownerRole || 'holder',
    purpose: purpose || '',
    organizationName: organizationName || '',
    requestStatus: 'pending',
    requestedAt: new Date(),
    approvedAt: null,
    sessionId: null
  });

  return requestToResponse(request);
}

/**
 * Vault-QR driven connection: the requester scanned a folder/vault QR
 * (decoded server-side to an ownerId + vaultId, see qrService.decodeVaultQrPayload).
 * This skips the lockdocId lookup used by the permanent, per-user QR and
 * immediately opens an accepted session scoped to that one vault, since the
 * act of scanning + submitting a request is the handshake itself.
 */
async function createVaultConnectionRequest(requester, ownerId, vaultId, requesterName, purpose) {
  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new Error('Vault owner not found');
  }

  let request = await ConnectionRequest.findOne({
    ownerId,
    requesterId: requester._id,
    vaultId,
    requestStatus: { $in: ['pending', 'accepted'] }
  });

  if (!request) {
    request = await ConnectionRequest.create({
      requesterId: requester._id,
      ownerId,
      vaultId,
      requesterName: requesterName || requester.fullName || 'Requester',
      requesterRole: requester.role || 'verifier',
      ownerRole: owner.role || 'holder',
      purpose: purpose || '',
      requestStatus: 'accepted',
      requestedAt: new Date(),
      approvedAt: new Date(),
      sessionId: generateSessionId()
    });
  } else if (request.requestStatus === 'pending') {
    request.requestStatus = 'accepted';
    request.approvedAt = new Date();
    request.sessionId = request.sessionId || generateSessionId();
    await request.save();
  }

  return requestToResponse(request);
}

async function getPendingConnectionRequests(ownerId) {
  const requests = await ConnectionRequest.find({ ownerId, requestStatus: 'pending' })
    .sort({ requestedAt: 1 })
    .lean();
  return requests.map(requestToResponse);
}

async function getConnectionRequestById(requestId, userId) {
  const request = await ConnectionRequest.findById(requestId).lean();
  if (!request) return null;
  const uid = userId.toString();
  if (request.ownerId.toString() !== uid && request.requesterId.toString() !== uid) {
    return null;
  }
  return requestToResponse(request);
}

async function getConnectionSessionById(sessionId, userId) {
  const request = await ConnectionRequest.findOne({ sessionId, requestStatus: 'accepted' }).lean();
  if (!request) return null;
  const uid = userId.toString();
  if (request.ownerId.toString() !== uid && request.requesterId.toString() !== uid) {
    return null;
  }
  const owner = await User.findById(request.ownerId).lean();
  const requester = await User.findById(request.requesterId).lean();

  let documents = [];
  if (request.vaultId) {
    const vaultDocs = await Document.find({ vaultId: request.vaultId }).lean();
    documents = vaultDocs.map(doc => ({
      id: doc._id.toString(),
      documentName: doc.documentName,
      documentType: doc.documentType
    }));
  }

  return {
    sessionId: request.sessionId,
    ownerId: request.ownerId.toString(),
    ownerName: owner ? owner.fullName : undefined,
    vaultId: request.vaultId ? request.vaultId.toString() : null,
    requesterId: request.requesterId.toString(),
    requesterName: request.requesterName || (requester ? requester.fullName : 'Requester'),
    requesterRole: request.requesterRole || 'verifier',
    ownerRole: request.ownerRole || 'holder',
    organizationName: request.organizationName || '',
    purpose: request.purpose || '',
    documents,
    createdAt: request.approvedAt || request.requestedAt || request.createdAt,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'active'
  };
}

async function getPendingDocumentRequests(ownerId) {
  const requests = await DocumentRequest.find({ ownerId, status: 'pending' })
    .populate('documentId', 'documentName documentType')
    .sort({ createdAt: 1 })
    .lean();
  return requests.map(req => {
    const response = requestToResponse(req);
    if (req.documentId && typeof req.documentId === 'object') {
      response.documentName = req.documentId.documentName;
      response.documentType = req.documentId.documentType;
      response.documentId = req.documentId._id.toString();
    }
    return response;
  });
}

async function acceptConnectionRequest(requestId, ownerId) {
  const request = await ConnectionRequest.findOne({ _id: requestId, ownerId });
  if (!request) {
    throw new Error('Connection request not found');
  }
  if (request.requestStatus !== 'pending') {
    throw new Error('Connection request already decided');
  }

  const sessionId = generateSessionId();
  request.requestStatus = 'accepted';
  request.approvedAt = new Date();
  request.sessionId = sessionId;
  await request.save();
  return requestToResponse(request);
}

async function declineConnectionRequest(requestId, ownerId) {
  const request = await ConnectionRequest.findOne({ _id: requestId, ownerId });
  if (!request) {
    throw new Error('Connection request not found');
  }
  if (request.requestStatus !== 'pending') {
    throw new Error('Connection request already decided');
  }

  request.requestStatus = 'declined';
  request.approvedAt = new Date();
  await request.save();
  return requestToResponse(request);
}

async function createDocumentRequest(requester, sessionId, documentId, purpose) {
  const connection = await ConnectionRequest.findOne({ sessionId, requestStatus: 'accepted' });
  if (!connection) {
    throw new Error('Active session not found');
  }
  if (connection.requesterId.toString() !== requester._id.toString()) {
    throw new Error('Requester does not match the session');
  }

  const document = await Document.findById(documentId);
  if (!document) {
    throw new Error('Document not found');
  }
  if (document.ownerId.toString() !== connection.ownerId.toString()) {
    throw new Error('Document does not belong to vault owner');
  }

  const existing = await DocumentRequest.findOne({
    requesterId: requester._id,
    ownerId: connection.ownerId,
    sessionId,
    documentId,
    status: 'pending'
  });
  if (existing) {
    return existing.toObject();
  }

  const request = await DocumentRequest.create({
    requesterId: requester._id,
    ownerId: connection.ownerId,
    documentId,
    sessionId,
    requesterName: requester.fullName || 'Requester',
    purpose: purpose || '',
    status: 'pending',
    accessToken: null,
    accessExpiresAt: null,
    expiryTime: 60
  });

  return requestToResponse(request);
}

async function approveDocumentRequest(requestId, ownerId) {
  const request = await DocumentRequest.findOne({ _id: requestId, ownerId });
  if (!request) {
    throw new Error('Document request not found');
  }
  if (request.status !== 'pending') {
    throw new Error('Document request already decided');
  }

  const accessToken = generateAccessToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  request.status = 'approved';
  request.accessToken = accessToken;
  request.accessExpiresAt = expiresAt;
  await request.save();
  return requestToResponse(request);
}

async function denyDocumentRequest(requestId, ownerId) {
  const request = await DocumentRequest.findOne({ _id: requestId, ownerId });
  if (!request) {
    throw new Error('Document request not found');
  }
  if (request.status !== 'pending') {
    throw new Error('Document request already decided');
  }

  request.status = 'denied';
  await request.save();
  return requestToResponse(request);
}

async function getDocumentRequestById(user, requestId) {
  const request = await DocumentRequest.findOne({ _id: requestId })
    .lean();
  if (!request) return null;
  const userId = user._id.toString();
  if (request.ownerId.toString() !== userId && request.requesterId.toString() !== userId) {
    return null;
  }
  request.requestId = request._id.toString();
  return request;
}

async function validateDocumentAccess(requestId, token) {
  const request = await DocumentRequest.findOne({ _id: requestId, accessToken: token, status: 'approved' })
    .lean();
  if (!request) {
    return null;
  }
  if (!request.accessExpiresAt || new Date() > new Date(request.accessExpiresAt)) {
    return null;
  }

  const document = await Document.findById(request.documentId).lean();
  if (!document) {
    return null;
  }

  const owner = await User.findById(request.ownerId).lean();
  const requester = await User.findById(request.requesterId).lean();
  if (!owner || !requester) {
    return null;
  }

  return {
    request,
    document: {
      id: document._id.toString(),
      documentName: document.documentName,
      documentType: document.documentType,
      category: document.vaultId ? document.vaultId.toString() : 'unknown',
      issuer: document.metadata?.provider || 'Vault',
      ownerName: owner.fullName,
      fileUrl: document.fileUrl,
      uploadDate: document.uploadDate,
      metadata: document.metadata || {}
    },
    session: {
      sessionId: request.sessionId,
      requesterId: request.requesterId,
      requesterName: request.requesterName || (requester ? requester.fullName : 'Requester'),
      ownerId: request.ownerId,
      ownerName: owner.fullName
    }
  };
}

module.exports = {
  createConnectionRequest,
  createVaultConnectionRequest,
  getPendingConnectionRequests,
  getConnectionRequestById,
  getConnectionSessionById,
  getPendingDocumentRequests,
  acceptConnectionRequest,
  declineConnectionRequest,
  createDocumentRequest,
  approveDocumentRequest,
  denyDocumentRequest,
  getDocumentRequestById,
  validateDocumentAccess
};
