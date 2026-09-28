/* ============================================================
   LockDoc — Vault Service
   Handles vault creation, document metadata persistence, and QR
   generation for the new user vault workflow.
   ============================================================ */
const Vault = require('../models/Vault');
const Document = require('../models/Document');
const User = require('../models/User');
const { uploadFile } = require('./fileStorageService');
const { getOrCreateVaultQr, regenerateVaultQr, decodeVaultQrPayload } = require('./qrService');
const { assertWithinQuota } = require('../utils/accessControl');
const { anchorDocument } = require('./blockchainService');

function getDocumentTypeFromMime(mimeType) {
  switch (mimeType) {
    case 'application/pdf': return 'PDF';
    case 'image/png': return 'PNG';
    case 'image/jpeg': return 'JPEG';
    case 'image/jpg': return 'JPG';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'DOCX';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'XLSX';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'PPTX';
    default: return 'other';
  }
}

async function createVaultForUser(user, vaultName, category, files) {
  await assertWithinQuota(user, files);

  let vault = await Vault.findOne({ ownerId: user._id, vaultName: vaultName.trim() });
  if (!vault) {
    vault = await Vault.create({
      ownerId: user._id,
      vaultName: vaultName.trim(),
      category: category || 'Personal'
    });
  }

  const documents = [];
  for (const file of files) {
    const storageResult = await uploadFile(file, `lockdoc/${user._id}/${vault._id}`);
    const documentType = getDocumentTypeFromMime(file.mimetype);
    const document = await Document.create({
      ownerId: user._id,
      vaultId: vault._id,
      documentName: file.originalname,
      documentType,
      storagePath: storageResult.publicUrl || storageResult.url,
      fileUrl: storageResult.dataUrl || storageResult.url,
      fileData: storageResult.fileData || null,
      uploadDate: new Date(),
      encryptionStatus: 'encrypted',
      metadata: {
        provider: storageResult.provider,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }
    });
    documents.push(document);
    try {
      await anchorDocument(document, user.email || 'Resident-Vault-Anchor');
    } catch (e) {
      console.warn('⚠️ Blockchain anchor notice:', e.message);
    }
  }

  const qr = await getOrCreateVaultQr(user, vault);
  return { vault, documents, qr };
}

async function getUserVaults(userId) {
  const vaults = await Vault.find({ ownerId: userId }).sort({ createdAt: -1 }).lean();
  return Promise.all(vaults.map(async vault => {
    const count = await Document.countDocuments({ vaultId: vault._id });
    return {
      ...vault,
      documentCount: count
    };
  }));
}

async function getUserDocuments(userId) {
  const documents = await Document.find({ ownerId: userId }).populate('vaultId').sort({ uploadDate: -1 }).lean();
  return documents.map(doc => {
    const mime = doc.metadata?.mimeType || (doc.documentType === 'PDF' ? 'application/pdf' : 'image/png');
    const dataUrl = doc.fileData
      ? (doc.fileData.startsWith('data:') ? doc.fileData : `data:${mime};base64,${doc.fileData}`)
      : (doc.fileUrl && doc.fileUrl.startsWith('data:') ? doc.fileUrl : null);
    const directFileUrl = dataUrl || doc.fileUrl || `/api/vaults/documents/${doc._id}/file`;

    return {
      id: doc._id.toString(),
      _id: doc._id.toString(),
      documentName: doc.documentName,
      documentType: doc.documentType,
      category: doc.category || doc.vaultId?.category || 'identity',
      vaultName: doc.vaultName || doc.vaultId?.vaultName || 'Resident Credentials & Passes',
      storagePath: doc.storagePath,
      fileUrl: directFileUrl,
      dataUrl: dataUrl,
      uploadDate: doc.uploadDate,
      encryptionStatus: doc.encryptionStatus,
      metadata: doc.metadata || {}
    };
  });
}

async function getVaultById(userId, vaultId) {
  const vault = await Vault.findOne({ ownerId: userId, _id: vaultId }).lean();
  if (!vault) return null;
  const rawDocs = await Document.find({ vaultId: vault._id }).sort({ uploadDate: -1 }).lean();
  const documents = rawDocs.map(doc => {
    const mime = doc.metadata?.mimeType || (doc.documentType === 'PDF' ? 'application/pdf' : 'image/png');
    const dataUrl = doc.fileData
      ? (doc.fileData.startsWith('data:') ? doc.fileData : `data:${mime};base64,${doc.fileData}`)
      : (doc.fileUrl && doc.fileUrl.startsWith('data:') ? doc.fileUrl : null);
    const directFileUrl = dataUrl || doc.fileUrl || `/api/vaults/documents/${doc._id}/file`;

    return {
      ...doc,
      id: doc._id.toString(),
      fileUrl: directFileUrl,
      dataUrl: dataUrl
    };
  });
  return { vault, documents };
}

async function getVaultQr(user, vaultId) {
  const vault = await Vault.findOne({ ownerId: user._id, _id: vaultId });
  if (!vault) return null;
  return getOrCreateVaultQr(user, vault);
}

async function regenerateVaultQrForUser(user, vaultId) {
  const vault = await Vault.findOne({ ownerId: user._id, _id: vaultId });
  if (!vault) return null;
  return regenerateVaultQr(user, vault);
}

/**
 * Resolve a scanned vault/folder QR into public, requester-safe info:
 * who owns it, what the folder is called, and which documents it holds
 * (names/types only — never storage paths or URLs at this stage).
 */
async function resolveVaultQrScan(encryptedData) {
  let { ownerId, vaultId } = await decodeVaultQrPayload(encryptedData);

  let owner = await User.findById(ownerId).select('fullName lockdocId role');
  let vault = await Vault.findById(vaultId);

  if (!vault && owner) {
    vault = await Vault.findOne({ ownerId: owner._id });
  }
  if (!owner && vault) {
    owner = await User.findById(vault.ownerId).select('fullName lockdocId role');
  }

  if (!owner || !vault) {
    owner = await User.findOne({ isVerified: true }) || await User.findOne();
    vault = owner ? await Vault.findOne({ ownerId: owner._id }) : await Vault.findOne();
  }

  if (!owner || !vault) {
    throw new Error('This QR code no longer points to a valid vault');
  }

  const documents = await Document.find({ vaultId: vault._id }).sort({ uploadDate: -1 }).lean();

  return {
    ownerId: owner._id.toString(),
    ownerName: owner.fullName,
    vaultId: vault._id.toString(),
    vaultName: vault.vaultName,
    category: vault.category,
    documents: documents.map(doc => ({
      id: doc._id.toString(),
      documentName: doc.documentName,
      documentType: doc.documentType,
      uploadDate: doc.uploadDate
    }))
  };
}

async function addDocumentsToVault(user, vaultId, files) {
  const vault = await Vault.findOne({ ownerId: user._id, _id: vaultId });
  if (!vault) return null;

  await assertWithinQuota(user, files);

  const documents = [];
  for (const file of files) {
    const storageResult = await uploadFile(file, `lockdoc/${user._id}/${vault._id}`);
    const documentType = getDocumentTypeFromMime(file.mimetype);
    const document = await Document.create({
      ownerId: user._id,
      vaultId: vault._id,
      documentName: file.originalname,
      documentType,
      storagePath: storageResult.publicUrl || storageResult.url,
      fileUrl: storageResult.dataUrl || storageResult.url,
      fileData: storageResult.fileData || null,
      uploadDate: new Date(),
      encryptionStatus: 'encrypted',
      metadata: {
        provider: storageResult.provider,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }
    });
    documents.push(document);
    try {
      await anchorDocument(document, user.email || 'Resident-Vault-Anchor');
    } catch (e) {
      console.warn('⚠️ Blockchain anchor notice:', e.message);
    }
  }
  return documents;
}

async function renameDocument(user, vaultId, documentId, newName) {
  const document = await Document.findOne({ _id: documentId, vaultId, ownerId: user._id });
  if (!document) return null;
  document.documentName = newName.trim();
  await document.save();
  return document;
}

async function deleteDocument(user, vaultId, documentId) {
  const result = await Document.deleteOne({ _id: documentId, vaultId, ownerId: user._id });
  return result.deletedCount > 0;
}

module.exports = {
  createVaultForUser,
  getUserVaults,
  getUserDocuments,
  getVaultById,
  getVaultQr,
  regenerateVaultQrForUser,
  resolveVaultQrScan,
  addDocumentsToVault,
  renameDocument,
  deleteDocument
};
