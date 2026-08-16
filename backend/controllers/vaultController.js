/* ============================================================
   LockDoc — Vault Controller
   Handles vault creation, document upload metadata, and vault retrieval.
   ============================================================ */
const {
  createVaultForUser,
  getUserVaults,
  getUserDocuments,
  getVaultById,
  getVaultQr,
  regenerateVaultQrForUser,
  addDocumentsToVault,
  renameDocument,
  deleteDocument
} = require('../services/vaultService');

async function getMyVaults(req, res) {
  try {
    const userId = req.userId || req.user._id;
    const vaults = await getUserVaults(userId);
    return res.status(200).json({ success: true, vaults });
  } catch (err) {
    console.error('Failed to fetch vaults:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load vaults.' });
  }
}

async function getMyDocuments(req, res) {
  try {
    const userId = req.userId || req.user._id;
    const documents = await getUserDocuments(userId);
    return res.status(200).json({ success: true, documents });
  } catch (err) {
    console.error('Failed to fetch documents:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load documents.' });
  }
}

async function createVault(req, res) {
  try {
    const { vaultName, category } = req.body;
    const files = req.files || [];

    if (!vaultName || typeof vaultName !== 'string' || !vaultName.trim()) {
      return res.status(400).json({ success: false, message: 'Vault name is required.' });
    }
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'At least one document is required.' });
    }

    const result = await createVaultForUser(req.user, vaultName, category, files);
    return res.status(201).json({ success: true, vault: result.vault, documents: result.documents, qr: result.qr });
  } catch (err) {
    console.error('Failed to create vault:', err.message);
    if (err.code === 'STORAGE_QUOTA_EXCEEDED') {
      return res.status(413).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to create vault.' });
  }
}

async function getVault(req, res) {
  try {
    const userId = req.userId || req.user._id;
    const { vaultId } = req.params;
    const result = await getVaultById(userId, vaultId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Vault not found.' });
    }
    return res.status(200).json({ success: true, vault: result.vault, documents: result.documents });
  } catch (err) {
    console.error('Failed to fetch vault:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load vault.' });
  }
}

async function getVaultQrHandler(req, res) {
  try {
    const user = req.user;
    const { vaultId } = req.params;
    const qr = await getVaultQr(user, vaultId);
    if (!qr) {
      return res.status(404).json({ success: false, message: 'Vault QR not found.' });
    }
    return res.status(200).json({ success: true, qr });
  } catch (err) {
    console.error('Failed to fetch vault QR:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load vault QR.' });
  }
}

async function regenerateVaultQrHandler(req, res) {
  try {
    const user = req.user;
    const { vaultId } = req.params;
    const qr = await regenerateVaultQrForUser(user, vaultId);
    if (!qr) {
      return res.status(404).json({ success: false, message: 'Vault not found.' });
    }
    return res.status(200).json({ success: true, qr });
  } catch (err) {
    console.error('Failed to regenerate vault QR:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to regenerate vault QR.' });
  }
}

async function addDocuments(req, res) {
  try {
    const { vaultId } = req.params;
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'At least one document is required.' });
    }
    const documents = await addDocumentsToVault(req.user, vaultId, files);
    if (!documents) {
      return res.status(404).json({ success: false, message: 'Vault not found.' });
    }
    return res.status(201).json({ success: true, documents });
  } catch (err) {
    console.error('Failed to add documents:', err.message);
    if (err.code === 'STORAGE_QUOTA_EXCEEDED') {
      return res.status(413).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to add documents.' });
  }
}

async function renameDocumentHandler(req, res) {
  try {
    const { vaultId, documentId } = req.params;
    const { documentName } = req.body;
    if (!documentName || !documentName.trim()) {
      return res.status(400).json({ success: false, message: 'Document name is required.' });
    }
    const document = await renameDocument(req.user, vaultId, documentId, documentName);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    return res.status(200).json({ success: true, document });
  } catch (err) {
    console.error('Failed to rename document:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to rename document.' });
  }
}

async function deleteDocumentHandler(req, res) {
  try {
    const { vaultId, documentId } = req.params;
    const deleted = await deleteDocument(req.user, vaultId, documentId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Failed to delete document:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete document.' });
  }
}

module.exports = {
  getMyVaults,
  getMyDocuments,
  createVault,
  getVault,
  getVaultQrHandler,
  regenerateVaultQrHandler,
  addDocuments,
  renameDocumentHandler,
  deleteDocumentHandler
};
