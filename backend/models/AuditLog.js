/* ============================================================
   LockDoc — Audit Log Model (Mongoose)
   Tracks all user actions for security and compliance.
   ============================================================ */
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: [
      'user_registered',
      'user_logged_in',
      'user_logged_out',
      'password_reset',
      'qr_generated',
      'qr_scanned',
      'connection_requested',
      'connection_accepted',
      'connection_declined',
      'document_requested',
      'document_approved',
      'document_denied',
      'document_viewed',
      'session_expired',
      'profile_updated'
    ]
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    default: null
  },
  details: {
    type: String,
    default: ''
  },
  device: {
    type: String,
    default: ''
  },
  ipAddress: {
    type: String,
    default: ''
  }
}, {
  timestamps: { createdAt: 'timestamp' }
});

// Index for efficient audit trail queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

