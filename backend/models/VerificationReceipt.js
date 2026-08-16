/* ============================================================
   LockDoc — Verification Receipt Model (Mongoose)
   A signed, tamper-evident record proving that a document was
   viewed/verified during a specific session — WITHOUT storing
   the document's actual sensitive content or number.
   ============================================================ */
const mongoose = require('mongoose');

const verificationReceiptSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentRequest',
    required: [true, 'Request ID is required'],
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    index: true
  },
  verifierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Verifier ID is required'],
    index: true
  },
  ownerName: {
    type: String,
    required: true,
    trim: true
  },
  verifierName: {
    type: String,
    required: true,
    trim: true
  },
  documentName: {
    type: String,
    required: true,
    trim: true
  },
  documentType: {
    type: String,
    required: true,
    trim: true
  },
  verifiedAt: {
    type: Date,
    required: true
  },
  // Compact signed+encrypted token — this IS the receipt.
  // Anyone holding it can prove/check authenticity via /api/receipts/:token
  // without needing a LockDoc account or seeing the original document.
  receiptToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['issued', 'revoked'],
    default: 'issued'
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

verificationReceiptSchema.index({ ownerId: 1, createdAt: -1 });
verificationReceiptSchema.index({ verifierId: 1, createdAt: -1 });

module.exports = mongoose.model('VerificationReceipt', verificationReceiptSchema);
