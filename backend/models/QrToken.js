/* ============================================================
   LockDoc — QR Token Model (Mongoose)
   Stores the permanent QR code associated with each user.
   Each user gets one permanent QR that never expires.
   ============================================================ */
const mongoose = require('mongoose');

const qrTokenSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    unique: true,
    index: true
  },
  permanentQRCode: {
    type: String,
    required: [true, 'QR code is required'],
    unique: true
  },
  status: {
    type: String,
    enum: ['active', 'regenerated', 'revoked'],
    default: 'active'
  },
  regeneratedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'createdAt' }
});

module.exports = mongoose.model('QrToken', qrTokenSchema);

