/* ============================================================
   LockDoc — Request Routes
   Routes for connection approval, document requests, and access validation.
   ============================================================ */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const requestController = require('../controllers/requestController');

// ── Public routes (no auth needed — the access token is the credential) ──────
// Must be declared BEFORE authMiddleware is applied so Express matches them first
router.get('/document/access', requestController.validateAccess);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.use(authMiddleware);

router.post('/connection', requestController.createConnection);
router.post('/connection/vault', requestController.createVaultConnection);
router.get('/connection', requestController.listConnectionRequests);
router.get('/connection/session/:sessionId', requestController.getConnectionSession);
router.get('/connection/:requestId', requestController.getConnectionRequest);
router.post('/connection/:requestId/accept', requestController.acceptConnection);
router.post('/connection/:requestId/decline', requestController.declineConnection);

router.post('/document', requestController.createDocumentRequest);
router.get('/document', requestController.listDocumentRequests);
router.get('/pending', requestController.listDocumentRequests);
router.get('/document/:requestId', requestController.getDocumentRequest);
router.post('/document/:requestId/approve', requestController.approveDocument);
router.post('/document/:requestId/deny', requestController.denyDocument);

module.exports = router;
