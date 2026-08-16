const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getMyQr, scanQr, scanVaultQr } = require('../controllers/qrController');

router.get('/my-qr', authMiddleware, getMyQr);
router.post('/scan', authMiddleware, scanQr);
router.post('/scan-vault', authMiddleware, scanVaultQr);

module.exports = router;