/* ============================================================
   LockDoc — OTP Model (Mongoose)
   Stores OTP codes with expiration for email verification,
   password reset, and new device login flows.
   ============================================================ */
const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    index: true
  },
  code: {
    type: String,
    required: [true, 'OTP code is required']
  },
  type: {
    type: String,
    enum: ['registration', 'password_reset', 'new_device_login', 'email_change'],
    default: 'registration'
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry time is required']
  },
  attempts: {
    type: Number,
    default: 0
  },
  isUsed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createdAt' }
});

// --- TTL index: auto-delete expired documents ---
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// --- Instance method: check if OTP is expired ---
otpSchema.methods.isExpired = function () {
  return Date.now() > this.expiresAt.getTime();
};

// --- Instance method: check if OTP is valid ---
otpSchema.methods.isValid = function (enteredCode) {
  return !this.isUsed && !this.isExpired() && this.code === enteredCode;
};

module.exports = mongoose.model('Otp', otpSchema);

