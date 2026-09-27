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
    required: [true, 'OTP code is required'],
    trim: true
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

// TTL index: Clean up old used/unused OTPs after 24 hours (86400 seconds)
// Prevents premature deletion due to clock drift between server and MongoDB Atlas
otpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// Instance method: check if OTP is expired
// Uses elapsed time relative to createdAt (15-minute window) to be resilient to clock drift
otpSchema.methods.isExpired = function () {
  if (this.createdAt) {
    const elapsedMs = Date.now() - this.createdAt.getTime();
    return elapsedMs > 15 * 60 * 1000;
  }
  return Date.now() > this.expiresAt.getTime();
};

// Instance method: check if OTP is valid
otpSchema.methods.isValid = function (enteredCode) {
  return !this.isUsed && !this.isExpired() && String(this.code).trim() === String(enteredCode).trim();
};

module.exports = mongoose.model('Otp', otpSchema);
