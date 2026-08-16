code --list-extensions# LockDoc - MongoDB Atlas Migration TODO

## ✅ Phase 1: Backend Foundation (COMPLETE)
- [x] 1.1 Create backend/config/db.js - MongoDB connection
- [x] 1.2 Create backend/models/User.js - User schema (bcrypt, lockdocId)
- [x] 1.3 Create backend/models/Otp.js - OTP schema (TTL index, expiry)
- [x] 1.4 Create backend/models/Document.js - Document schema
- [x] 1.5 Create backend/models/DocumentFolder.js - Document folder schema
- [x] 1.6 Create backend/models/QrToken.js - QR Token schema
- [x] 1.7 Create backend/models/ConnectionRequest.js - Connection Request schema
- [x] 1.8 Create backend/models/DocumentRequest.js - Document Request schema
- [x] 1.9 Create backend/models/AuditLog.js - Audit Log schema
- [x] 1.10 Create backend/middleware/auth.js - JWT middleware (generateToken, verifyToken, authMiddleware)
- [x] 1.11 Create backend/services/emailService.js - Email service (OTP, Welcome, Password Reset)
- [x] 1.12 Create backend/controllers/authController.js - All auth controllers (register, verify-otp, login, logout, profile, send-otp, reset-password, check-user)

## ✅ Phase 2: Auth Routes & Server (COMPLETE)
- [x] 2.1 Create backend/routes/auth.js - Auth routes with public/protected endpoints
- [x] 2.2 Update backend/.env - MongoDB, JWT config
- [x] 2.3 Update backend/package.json - Added mongoose, bcryptjs, jsonwebtoken, multer
- [x] 2.4 Rewrite backend/server.js - MongoDB + modular routes, health check

## ✅ Phase 3: Frontend Auth Updates (COMPLETE)
- [x] 3.1 Update public/script.js - JWT API functions (apiLogin, apiRegister, apiVerifyOTP, apiLogout, apiGetProfile, apiSendOTP, apiResetPassword)
- [x] 3.2 Update public/login.html - JWT login flow (store token + user, sync with LD.data)
- [x] 3.3 Update public/register.html - New registration flow (apiRegister + apiVerifyOTP)
- [x] 3.4 Update public/dashboard.html - Profile via API, JWT logout
- [x] 3.5 Update js/storage.js - Already has LD.data.currentUser(), LD.data.setCurrentUser()
- [x] 3.6 Update js/app.js - Registration guard checks JWT + isJwtAuthenticated()

## Phase 4: Testing & Verification
- [x] 4.1 Install dependencies & start backend
- [x] 4.2 Test registration flow ✅ (API test passed)
- [x] 4.3 Test login flow ✅ (JWT token received)
- [x] 4.4 Test profile endpoint ✅ (User data returned)
- [x] 4.5 Test logout ✅ (Session destroyed)
- [ ] 4.6 Verify LockDoc UI still works in browser

