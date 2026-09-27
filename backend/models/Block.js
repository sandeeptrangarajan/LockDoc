/* ============================================================
   LockDoc — Cryptographic Block Model (Mongoose)
   Immutable Ledger for Document Audits, Proof of Existence,
   and Access Authorization Records.
   ============================================================ */
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  txId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'GENESIS',
      'DOCUMENT_ANCHOR',
      'VAULT_CREATED',
      'ACCESS_REQUESTED',
      'ACCESS_APPROVED',
      'ACCESS_REVOKED',
      'VIEW_VERIFIED',
      'SESSION_DESTRUCTED',
      'INTEGRITY_AUDIT',
      'TAMPER_ALERT'
    ]
  },
  actor: {
    type: String,
    default: 'System'
  },
  docHash: {
    type: String,
    default: ''
  },
  docName: {
    type: String,
    default: ''
  },
  vaultId: {
    type: String,
    default: ''
  },
  details: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const blockSchema = new mongoose.Schema({
  index: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  transactions: [transactionSchema],
  previousHash: {
    type: String,
    required: true
  },
  merkleRoot: {
    type: String,
    required: true
  },
  nonce: {
    type: Number,
    required: true,
    default: 0
  },
  hash: {
    type: String,
    required: true,
    unique: true
  },
  miner: {
    type: String,
    default: 'LockDoc-Consensus-Node-01'
  }
}, {
  timestamps: true
});

blockSchema.index({ 'transactions.docHash': 1 });

module.exports = mongoose.model('Block', blockSchema);
