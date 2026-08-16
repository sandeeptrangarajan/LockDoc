/* ============================================================
   LockDoc — Vault QR Code Model (Mongoose)
   Stores the permanent QR associated with a vault.
   ============================================================ */
const mongoose = require('mongoose');

const vaultQrSchema = new mongoose.Schema({
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
  securityToken: {
    type: String,
    required: [true, 'Security token is required']
  },
  version: {
    type: String,
    default: '1.0'
  },
  encryptedData: {
    type: String,
    required: [true, 'Encrypted payload is required']
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active'
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

vaultQrSchema.index(
  { ownerId: 1, vaultId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = mongoose.model('VaultQRCode', vaultQrSchema);