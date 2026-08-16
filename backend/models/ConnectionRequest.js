/* ============================================================
   LockDoc — Connection Request Model (Mongoose)
   Tracks when a requester scans a QR code and requests
   to connect to an owner's vault.
   ============================================================ */
const mongoose = require('mongoose');

const connectionRequestSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Requester ID is required'],
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    index: true
  },
  vaultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vault',
    default: null,
    index: true
  },
  requesterName: {
    type: String,
    required: [true, 'Requester name is required']
  },
  requesterRole: {
    type: String,
    default: 'verifier'
  },
  ownerRole: {
    type: String,
    default: 'holder'
  },
  purpose: {
    type: String,
    default: ''
  },
  organizationName: {
    type: String,
    default: ''
  },
  requestStatus: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: {
    type: Date,
    default: null
  },
  sessionId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

connectionRequestSchema.index({ ownerId: 1, requestStatus: 1 });
connectionRequestSchema.index({ requesterId: 1, requestStatus: 1 });

module.exports = mongoose.model('ConnectionRequest', connectionRequestSchema);

