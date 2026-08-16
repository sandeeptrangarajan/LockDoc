/* ============================================================
   LockDoc — Vault Model (Mongoose)
   Stores personalized vault metadata for a user.
   ============================================================ */
const mongoose = require('mongoose');

const vaultSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    index: true
  },
  vaultName: {
    type: String,
    required: [true, 'Vault name is required'],
    trim: true,
    maxlength: [100, 'Vault name cannot exceed 100 characters']
  },
  category: {
    type: String,
    enum: ['Identity', 'Education', 'Medical', 'Financial', 'Employment', 'Personal'],
    default: 'Personal'
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

vaultSchema.index({ ownerId: 1, vaultName: 1 }, { unique: true });

module.exports = mongoose.model('Vault', vaultSchema);
