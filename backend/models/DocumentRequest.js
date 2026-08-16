/* ============================================================
   LockDoc — Document Request Model (Mongoose)
   Tracks when a requester (within an active session) asks
   to view a specific document from the owner's vault.
   ============================================================ */
const mongoose = require('mongoose');

const documentRequestSchema = new mongoose.Schema({
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
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: [true, 'Document ID is required']
  },
  sessionId: {
    type: String,
    required: [true, 'Session ID is required']
  },
  requesterName: {
    type: String,
    required: [true, 'Requester name is required'],
    trim: true
  },
  purpose: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'expired'],
    default: 'pending'
  },
  accessToken: {
    type: String,
    default: null
  },
  accessExpiresAt: {
    type: Date,
    default: null
  },
  expiryTime: {
    type: Number, // Duration in seconds (default 60)
    default: 60
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'decidedAt' }
});

documentRequestSchema.index({ sessionId: 1, status: 1 });
documentRequestSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model('DocumentRequest', documentRequestSchema);

