/* ============================================================
   LockDoc — Request Controller
   Exposes request APIs for connection requests, document requests,
   and PIN-based approval from the owner.
   ============================================================ */
const {
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
  validateDocumentAccess,
  getDocumentRequestById
} = require('../services/requestService');

async function createConnection(req, res) {
  try {
    const { lockdocId, ownerName, ownerRole, requesterName, organizationName, purpose } = req.body;
    const requester = req.user;
    const request = await createConnectionRequest(requester, lockdocId, ownerName, ownerRole, requesterName, organizationName, purpose);
    res.status(201).json({ success: true, request });
  } catch (err) {
    console.error('Failed to create connection request:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to create connection request.' });
  }
}

async function createVaultConnection(req, res) {
  try {
    const { ownerId, vaultId, requesterName, purpose } = req.body;
    if (!ownerId || !vaultId) {
      return res.status(400).json({ success: false, message: 'ownerId and vaultId are required.' });
    }
    const requester = req.user;
    const request = await createVaultConnectionRequest(requester, ownerId, vaultId, requesterName, purpose);
    res.status(201).json({ success: true, request });
  } catch (err) {
    console.error('Failed to create vault connection request:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to create connection request.' });
  }
}

async function listConnectionRequests(req, res) {
  try {
    const ownerId = req.userId || req.user._id;
    const requests = await getPendingConnectionRequests(ownerId);
    res.status(200).json({ success: true, requests });
  } catch (err) {
    console.error('Failed to list connection requests:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load connection requests.' });
  }
}

async function listDocumentRequests(req, res) {
  try {
    const ownerId = req.userId || req.user._id;
    const requests = await getPendingDocumentRequests(ownerId);
    res.status(200).json({ success: true, requests });
  } catch (err) {
    console.error('Failed to list document requests:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load document requests.' });
  }
}

async function getConnectionRequest(req, res) {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId || req.user._id;
    const request = await getConnectionRequestById(requestId, userId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Connection request not found.' });
    }
    return res.status(200).json({ success: true, request });
  } catch (err) {
    console.error('Failed to get connection request:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load connection request.' });
  }
}

async function getConnectionSession(req, res) {
  try {
    const sessionId = req.params.sessionId;
    const userId = req.userId || req.user._id;
    const session = await getConnectionSessionById(sessionId, userId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Connection session not found.' });
    }
    return res.status(200).json({ success: true, session });
  } catch (err) {
    console.error('Failed to get connection session:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load connection session.' });
  }
}

async function acceptConnection(req, res) {
  try {
    const ownerId = req.userId || req.user._id;
    const { requestId } = req.params;
    const request = await acceptConnectionRequest(requestId, ownerId);
    res.status(200).json({ success: true, request });
  } catch (err) {
    console.error('Failed to accept connection request:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to accept connection request.' });
  }
}

async function declineConnection(req, res) {
  try {
    const ownerId = req.userId || req.user._id;
    const { requestId } = req.params;
    const request = await declineConnectionRequest(requestId, ownerId);
    res.status(200).json({ success: true, request });
  } catch (err) {
    console.error('Failed to decline connection request:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to decline connection request.' });
  }
}

async function createDocumentRequestHandler(req, res) {
  try {
    const requester = req.user;
    const { sessionId, documentId, purpose } = req.body;
    const request = await createDocumentRequest(requester, sessionId, documentId, purpose);
    res.status(201).json({ success: true, request });
  } catch (err) {
    console.error('Failed to create document request:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to create document request.' });
  }
}

async function approveDocument(req, res) {
  try {
    const ownerId = req.userId || req.user._id;
    const { requestId } = req.params;
    const request = await approveDocumentRequest(requestId, ownerId);
    res.status(200).json({ success: true, request });
  } catch (err) {
    console.error('Failed to approve document request:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to approve document request.' });
  }
}

async function denyDocument(req, res) {
  try {
    const ownerId = req.userId || req.user._id;
    const { requestId } = req.params;
    const request = await denyDocumentRequest(requestId, ownerId);
    res.status(200).json({ success: true, request });
  } catch (err) {
    console.error('Failed to deny document request:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to deny document request.' });
  }
}

async function validateAccess(req, res) {
  try {
    const { requestId, token } = req.query;
    if (!requestId || !token) {
      return res.status(400).json({ success: false, message: 'Request ID and token are required.' });
    }
    const result = await validateDocumentAccess(requestId, token);
    if (!result) {
      return res.status(401).json({ success: false, message: 'Access denied or expired.' });
    }
    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('Failed to validate document access:', err.message);
    res.status(500).json({ success: false, message: 'Failed to validate document access.' });
  }
}

async function getDocumentRequest(req, res) {
  try {
    const requestId = req.params.requestId;
    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Request ID is required.' });
    }
    const result = await getDocumentRequestById(req.user, requestId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Document request not found.' });
    }
    res.status(200).json({ success: true, request: result });
  } catch (err) {
    console.error('Failed to get document request:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load document request.' });
  }
}

module.exports = {
  createConnection,
  createVaultConnection,
  listConnectionRequests,
  getConnectionRequest,
  getConnectionSession,
  listDocumentRequests,
  acceptConnection,
  declineConnection,
  createDocumentRequest: createDocumentRequestHandler,
  approveDocument,
  denyDocument,
  validateAccess,
  getDocumentRequest
};
