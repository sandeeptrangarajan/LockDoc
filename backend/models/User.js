/* ============================================================
   LockDoc — User Model (Mongoose)
   Fields: fullName, email, password, role, isVerified,
           createdAt, lastLogin, profilePhoto, lockdocId,
           trustedDevices
   ============================================================ */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Never return password by default
  },
  role: {
    type: String,
    enum: ['holder', 'verifier', 'organization'],
    default: 'holder'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  profilePhoto: {
    type: String,
    default: null
  },
  lockdocId: {
    type: String,
    unique: true,
    sparse: true // Allows null values for unverified users
  },
  trustedDevices: [{
    deviceId: String,
    userAgent: String,
    lastUsedAt: Date,
    isTrusted: { type: Boolean, default: false }
  }],
  lastLogin: {
    type: Date,
    default: null
  },
  // Customers must accept before using the app; administrators are exempt.
  termsAcceptedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// --- Pre-save hook: hash password ---
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// --- Instance method: compare password ---
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// --- Instance method: generate lockdocId ---
userSchema.methods.generateLockdocId = function () {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  const time = Date.now().toString(36).toUpperCase();
  this.lockdocId = `LD-${time}${rand}`;
  return this.lockdocId;
};

// --- Static method: find by email (with password) ---
userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email: email.toLowerCase() }).select('+password');
};

module.exports = mongoose.model('User', userSchema);

