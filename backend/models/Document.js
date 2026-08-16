/* ============================================================
   LockDoc — Document Model (Mongoose)
   Represents a document stored in a user's vault.
   ============================================================ */
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    index: true
  },
  vaultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vault',
    required: [true, 'Vault ID is required'],
    index: true
  },
  documentName: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true
  },
  documentType: {
    type: String,
    required: [true, 'Document type is required'],
    enum: ['PDF', 'PNG', 'JPG', 'JPEG', 'DOCX', 'XLSX', 'PPTX', 'other'],
    default: 'other'
  },
  storagePath: {
    type: String,
    default: null
  },
  fileUrl: {
    type: String,
    default: null
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  encryptionStatus: {
    type: String,
    enum: ['encrypted', 'decrypted', 'pending'],
    default: 'encrypted'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: { updatedAt: 'updatedAt' }
});

// Index for efficient querying
documentSchema.index({ ownerId: 1, documentType: 1 });

module.exports = mongoose.model('Document', documentSchema);

