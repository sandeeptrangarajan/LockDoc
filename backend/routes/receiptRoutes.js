/* ============================================================
   LockDoc — Verification Receipt Routes
   ============================================================ */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const receiptController = require('../controllers/receiptController');

// Authenticated: issue a receipt for a session you were the requester in
router.post('/', authMiddleware, receiptController.createReceipt);

// Authenticated: list receipts you're involved in (as owner or verifier)
router.get('/mine', authMiddleware, receiptController.listMyReceipts);

// Public: verify a receipt token — no login required, no document
// content exposed. IMPORTANT: this must stay below '/mine' or it
// will shadow it the same way the earlier /document/:requestId bug did.
router.get('/:token', receiptController.getReceipt);

module.exports = router;
