/* ============================================================
   LockDoc — Authentication Controller
   Handles registration, OTP verification, login, logout,
   profile retrieval, and password reset.
   ============================================================ */
const User = require('../models/User');
const Otp = require('../models/Otp');
const QrToken = require('../models/QrToken');
const AuditLog = require('../models/AuditLog');
const { generateToken } = require('../middleware/auth');
const { sendOTPEmail, sendWelcomeEmail, sendPasswordResetEmail, isEmailConfigured } = require('../services/emailjsService');
const { isAdminEmail, getStorageUsedBytes, CUSTOMER_STORAGE_LIMIT_BYTES } = require('../utils/accessControl');
// ---- Helper: Generate 6-digit OTP ----
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---- Helper: Get client IP ----
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
}

// ---- Helper: Get user agent ----
function getUserAgent(req) {
  return req.headers['user-agent'] || '';
}

// ---- Helper: Create audit log ----
async function createAuditLog(userId, action, details = '', req = null) {
  try {
    await AuditLog.create({
      userId,
      action,
      details,
      device: req ? getUserAgent(req) : '',
      ipAddress: req ? getClientIP(req) : ''
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

/**
 * POST /api/auth/register
 * Step 1: Validate email availability and send OTP
 */
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, and password are required.'
      });
    }

    if (fullName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 2 characters.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      });
    }

    // Check if email already exists and is verified
    const existingUser = await User.findOne({ email: email.toLowerCase(), isVerified: true });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered. Please login.'
      });
    }

    // Delete any previous unverified user with this email
    await User.deleteOne({ email: email.toLowerCase(), isVerified: false });

    // Generate and send OTP
    const otpCode = generateOTP();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Store OTP in database
    await Otp.create({
      email: email.toLowerCase(),
      code: otpCode,
      type: 'registration',
      expiresAt
    });

    console.log(`📧 Registration OTP ${otpCode} sent to ${email}`);

    // Check if email is configured
    const emailConfigured = isEmailConfigured();
    let emailSent = false;
    let emailError = null;

    if (emailConfigured) {
      // Send OTP via email
      try {
        await sendOTPEmail(email, otpCode, expiryMinutes);
        console.log(`✅ OTP email sent to ${email}`);
        emailSent = true;
      } catch (err) {
        emailError = err.message;
        console.error(`❌ Failed to send OTP email to ${email}:`, emailError);
      }
    } else {
      console.log(`⚠️  Gmail not configured. OTP for ${email}: ${otpCode}`);
      console.log(`   To send real emails, add GMAIL_EMAIL and GMAIL_APP_PASSWORD to backend/.env`);
    }

    // Store registration data temporarily in a pre-created user (hashed password)
    const tempUser = new User({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      password: password, // Will be hashed by pre-save hook
      role: role || 'holder',
      isVerified: false
    });
    await tempUser.save();

    // Only expose the raw OTP in the API response outside production —
    // this fallback exists so local/dev testing works without Gmail
    // credentials, but it must never leak OTPs to real users in prod.
    const isProd = process.env.NODE_ENV === 'production';
    const shouldRevealOtp = !emailSent && !isProd;

    const response = {
      success: true,
      message: emailSent
        ? 'OTP sent successfully. Please check your email.'
        : shouldRevealOtp
          ? `DEV MODE: OTP is ${otpCode}. Use this to verify.`
          : 'We could not send the verification email right now. Please try again shortly.',
      email: email.toLowerCase()
    };

    if (shouldRevealOtp) {
      response.otp = otpCode;
      response.devMode = true;
    }

    if (emailConfigured && !emailSent) {
      // Email was configured but genuinely failed to send (bad creds,
      // network, rate limit, etc.) — surface that distinctly from
      // "not configured" so it's easier to diagnose in production.
      response.emailError = isProd ? undefined : emailError;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This email is already being processed.'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
};

/**
 * POST /api/auth/verify-otp
 * Step 2: Verify OTP and complete registration
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanOtp = otp ? String(otp).trim() : '';

    if (!cleanEmail || !cleanOtp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required.'
      });
    }

    console.log(`🔍 Verifying OTP for ${cleanEmail}. Entered: "${cleanOtp}"`);

    // Find the latest active registration OTP entry for this email
    const otpEntry = await Otp.findOne({
      email: cleanEmail,
      type: 'registration',
      isUsed: false
    }).sort({ createdAt: -1 });

    if (!otpEntry) {
      console.warn(`⚠️ No active registration OTP found in DB for ${cleanEmail}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Please request a new code.'
      });
    }

    if (otpEntry.isExpired()) {
      otpEntry.isUsed = true;
      await otpEntry.save();
      console.warn(`⚠️ OTP for ${cleanEmail} has expired`);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new code.'
      });
    }

    if (String(otpEntry.code).trim() !== cleanOtp) {
      otpEntry.attempts = (otpEntry.attempts || 0) + 1;
      await otpEntry.save();
      console.warn(`⚠️ Mismatch for ${cleanEmail}: entered "${cleanOtp}", expected "${otpEntry.code}"`);
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code. Please enter the exact code sent to your email.'
      });
    }

    // Mark OTP as used
    otpEntry.isUsed = true;
    otpEntry.attempts += 1;
    await otpEntry.save();

    // Find and update the user
    let user = await User.findOne({ email: cleanEmail, isVerified: false });
    if (!user) {
      user = await User.findOne({ email: cleanEmail });
      if (user && user.isVerified) {
        const token = generateToken(user);
        return res.status(200).json({
          success: true,
          message: 'Account is already verified. You can now login.',
          token,
          user: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            lockdocId: user.lockdocId
          }
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Registration session expired. Please start again.'
      });
    }

    // Set verified and generate lockdocId
    user.isVerified = true;
    user.generateLockdocId();
    user.lastLogin = new Date();
    await user.save();

    // Create a permanent QR token for the user
    await QrToken.create({
      ownerId: user._id,
      permanentQRCode: user.lockdocId,
      status: 'active'
    });

    // Audit log
    await createAuditLog(user._id, 'user_registered', 'User registered successfully', req);

    // Send welcome email (non-blocking)
    try {
      await sendWelcomeEmail(user.email, user.fullName);
    } catch (welcomeErr) {
      console.log('⚠️ Welcome email failed (non-critical):', welcomeErr.message);
    }

    console.log(`✅ User verified: ${user.fullName} (${user.email}) [${user.lockdocId}]`);

    res.status(200).json({
      success: true,
      message: 'Registration successful! You can now login.',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lockdocId: user.lockdocId,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('❌ OTP verification error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
};

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    // Find user with password field
    const user = await User.findByEmailWithPassword(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this email. Please register first.'
      });
    }

    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Email not verified. Please complete registration first.'
      });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password.'
      });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT
    const token = generateToken(user);

    // Audit log
    await createAuditLog(user._id, 'user_logged_in', 'User logged in', req);

    console.log(`✅ User logged in: ${user.fullName} (${user.email})`);

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lockdocId: user.lockdocId,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        isAdmin: isAdminEmail(user.email),
        termsAccepted: !!user.termsAcceptedAt
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

/**
 * POST /api/auth/logout
 * Invalidate current session (client-side token removal)
 */
exports.logout = async (req, res) => {
  try {
    await createAuditLog(req.userId, 'user_logged_out', 'User logged out', req);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (error) {
    console.error('❌ Logout error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Logout failed.'
    });
  }
};

/**
 * GET /api/auth/profile
 * Return the authenticated user's profile
 */
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = isAdminEmail(user.email);
    const storageUsedBytes = isAdmin ? 0 : await getStorageUsedBytes(user._id);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lockdocId: user.lockdocId,
        isVerified: user.isVerified,
        profilePhoto: user.profilePhoto,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isAdmin,
        termsAccepted: !!user.termsAcceptedAt,
        storage: isAdmin ? null : {
          usedBytes: storageUsedBytes,
          limitBytes: CUSTOMER_STORAGE_LIMIT_BYTES
        }
      }
    });
  } catch (error) {
    console.error('❌ Profile error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile.'
    });
  }
};

/**
 * POST /api/auth/accept-terms
 * Records that the current (authenticated) customer has accepted
 * the Terms & Policy. Administrators never need to call this.
 */
exports.acceptTerms = async (req, res) => {
  try {
    const user = req.user;
    user.termsAcceptedAt = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Terms accepted.',
      termsAcceptedAt: user.termsAcceptedAt
    });
  } catch (error) {
    console.error('❌ Accept-terms error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to record terms acceptance.'
    });
  }
};

/**
 * POST /api/auth/send-otp
 * Send OTP for password reset or new device login
 */
exports.sendOTP = async (req, res) => {
  try {
    const { email, type } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    const otpType = type || 'password_reset';
    if (!['registration', 'password_reset', 'new_device_login', 'email_change'].includes(otpType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP type.'
      });
    }

    // Check rate limit - prevent sending OTP repeatedly within 30 seconds
    const recentOtp = await Otp.findOne({
      email: email.toLowerCase(),
      type: otpType,
      createdAt: { $gte: new Date(Date.now() - 30000) }
    });

    if (recentOtp) {
      const waitTime = Math.ceil((recentOtp.createdAt.getTime() + 30000 - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitTime} seconds before requesting a new code.`
      });
    }

    // Generate and store OTP
    const otpCode = generateOTP();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await Otp.create({
      email: email.toLowerCase(),
      code: otpCode,
      type: otpType,
      expiresAt
    });

    console.log(`📧 ${otpType} OTP ${otpCode} sent to ${email}`);

    // Check if email is configured
    const emailConfigured = isEmailConfigured();
    let emailSent = false;
    let emailError = null;

    if (emailConfigured) {
      // Send email based on type
      try {
        if (otpType === 'password_reset') {
          await sendPasswordResetEmail(email, otpCode, expiryMinutes);
        } else {
          await sendOTPEmail(email, otpCode, expiryMinutes);
        }
        console.log(`✅ ${otpType} email sent to ${email}`);
        emailSent = true;
      } catch (err) {
        emailError = err.message;
        console.error(`❌ Failed to send ${otpType} email to ${email}:`, emailError);
      }
    } else {
      console.log(`⚠️  Gmail not configured. OTP for ${email}: ${otpCode}`);
      console.log(`   To send real emails, add GMAIL_EMAIL and GMAIL_APP_PASSWORD to backend/.env`);
    }

    const isProd = process.env.NODE_ENV === 'production';
    const shouldRevealOtp = !emailSent && !isProd;

    const response = {
      success: true,
      message: emailSent
        ? 'OTP sent successfully. Please check your email.'
        : shouldRevealOtp
          ? `DEV MODE: OTP is ${otpCode}. Use this to verify.`
          : 'We could not send the verification email right now. Please try again shortly.',
      email: email.toLowerCase()
    };

    if (shouldRevealOtp) {
      response.otp = otpCode;
      response.devMode = true;
    }

    if (emailConfigured && !emailSent) {
      response.emailError = isProd ? undefined : emailError;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Send OTP error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    });
  }
};

/**
 * POST /api/auth/reset-password
 * Reset password using OTP
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required.'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      });
    }

    // Verify OTP
    const otpEntry = await Otp.findOne({
      email: email.toLowerCase(),
      code: otp,
      type: 'password_reset',
      isUsed: false
    });

    if (!otpEntry) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please request a new code.'
      });
    }

    if (otpEntry.isExpired()) {
      otpEntry.isUsed = true;
      await otpEntry.save();
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new code.'
      });
    }

    // Mark OTP as used
    otpEntry.isUsed = true;
    await otpEntry.save();

    // Find user and update password
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    user.password = newPassword; // Will be hashed by pre-save hook
    await user.save();

    await createAuditLog(user._id, 'password_reset', 'Password reset completed', req);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login.'
    });
  } catch (error) {
    console.error('❌ Reset password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Password reset failed. Please try again.'
    });
  }
};

/**
 * GET /api/auth/check-user?email=...
 * Check if an email is registered
 */
exports.checkUser = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required.'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isVerified: true });

    res.status(200).json({
      success: true,
      exists: !!user,
      verified: user ? user.isVerified : false
    });
  } catch (error) {
    console.error('❌ Check user error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
};

