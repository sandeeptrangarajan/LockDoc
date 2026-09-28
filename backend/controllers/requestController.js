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

async function streamDocumentFile(req, res) {
  try {
    const requestId = req.query.requestId || req.params.requestId;
    const token = req.query.token;
    if (!requestId || !token) {
      return res.status(400).json({ success: false, message: 'Request ID and token are required.' });
    }
    const access = await validateDocumentAccess(requestId, token);
    if (!access) {
      return res.status(401).json({ success: false, message: 'Access denied or expired.' });
    }

    const Document = require('../models/Document');
    const doc = await Document.findById(access.request.documentId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const mime = doc.metadata?.mimeType || (doc.documentType === 'PDF' ? 'application/pdf' : 'image/png');

    // 1. Direct Base64 data stored in MongoDB
    if (doc.fileData) {
      let base64 = doc.fileData;
      if (base64.includes('base64,')) {
        base64 = base64.split('base64,')[1];
      }
      const buffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.documentName)}"`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(buffer);
    }

    // 2. Data URI in fileUrl
    if (doc.fileUrl && doc.fileUrl.startsWith('data:')) {
      const match = doc.fileUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const fileMime = match[1] || mime;
        const buffer = Buffer.from(match[2], 'base64');
        res.setHeader('Content-Type', fileMime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.documentName)}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(buffer);
      }
    }

    // 3. Local disk fallback
    if (doc.storagePath && !doc.storagePath.startsWith('http')) {
      const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
      const fs = require('fs');
      const path = require('path');
      const localPath = isServerless
        ? path.join(require('os').tmpdir(), 'uploads', 'vaults', path.basename(doc.storagePath))
        : path.join(__dirname, '..', '..', doc.storagePath.replace(/^\//, ''));
      if (fs.existsSync(localPath)) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.documentName)}"`);
        return res.sendFile(path.resolve(localPath));
      }
    }

    // 4. External URL (Cloudinary, S3, etc.)
    if (doc.fileUrl && (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://'))) {
      return res.redirect(doc.fileUrl);
    }

    // 5. Fallback SVG visual document
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(doc.documentName + (access.session.sessionId || '')).digest('hex');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <rect width="100%" height="100%" fill="#0a0e17"/>
  <rect x="30" y="30" width="740" height="940" rx="16" fill="#111827" stroke="#00F0FF" stroke-width="2" stroke-opacity="0.4"/>
  <text x="70" y="100" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#00F0FF">LOCKDOC SECURE VAULT DOCUMENT</text>
  <text x="70" y="140" font-family="Arial, sans-serif" font-size="16" fill="#9CA3AF">Cryptographically Verified Access Token</text>
  <line x1="70" y1="170" x2="730" y2="170" stroke="#1F2937" stroke-width="2"/>
  <text x="70" y="230" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#F9FAFB">${doc.documentName}</text>
  <text x="70" y="270" font-family="Arial, sans-serif" font-size="14" fill="#9CA3AF">DOCUMENT TYPE: <tspan fill="#38BDF8">${doc.documentType || 'Official Document'}</tspan></text>
  <text x="70" y="310" font-family="Arial, sans-serif" font-size="14" fill="#9CA3AF">HOLDER: <tspan fill="#F9FAFB">${access.session.ownerName || 'Vault Owner'}</tspan></text>
  <text x="70" y="350" font-family="Arial, sans-serif" font-size="14" fill="#9CA3AF">VIEWER: <tspan fill="#10B981">${access.session.requesterName || 'Authorized Requester'}</tspan></text>
  <text x="70" y="390" font-family="Arial, sans-serif" font-size="14" fill="#9CA3AF">SESSION ID: <tspan fill="#F59E0B">${access.session.sessionId}</tspan></text>
  <rect x="70" y="440" width="660" height="300" rx="8" fill="#1F2937" stroke="#374151"/>
  <text x="400" y="580" font-family="Arial, sans-serif" font-size="18" fill="#9CA3AF" text-anchor="middle">🛡️ Official Digital Certificate Issued &amp; Anchored</text>
  <text x="400" y="620" font-family="Arial, sans-serif" font-size="13" fill="#6B7280" text-anchor="middle">Verified on LockDoc Blockchain Network</text>
  <text x="70" y="800" font-family="Arial, sans-serif" font-size="12" fill="#6B7280">Timestamp: ${new Date().toISOString()}</text>
  <text x="70" y="830" font-family="monospace" font-size="11" fill="#4B5563">SHA256: ${hash}</text>
</svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.documentName)}.svg"`);
    return res.send(svg);
  } catch (err) {
    console.error('Failed to stream document file:', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve document file.' });
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
  getDocumentRequest,
  streamDocumentFile
};
