/* ============================================================
   LockDoc — Authentication Routes
   ============================================================ */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// ---- Public Routes (no auth required) ----
router.post('/register', authController.register);
router.post('/verify-otp', authController.verifyOTP);
router.post('/login', authController.login);
router.post('/send-otp', authController.sendOTP);
router.post('/reset-password', authController.resetPassword);
router.get('/check-user', authController.checkUser);

// ---- Protected Routes (JWT required) ----
router.post('/logout', authMiddleware, authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);
router.post('/accept-terms', authMiddleware, authController.acceptTerms);

module.exports = router;

