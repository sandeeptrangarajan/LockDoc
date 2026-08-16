/* ============================================================
   LockDoc — Vault Routes
   Provides authenticated endpoints for vault and document management.
   ============================================================ */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const vaultController = require('../controllers/vaultController');
const { multerUpload } = require('../services/fileStorageService');

router.use(authMiddleware);

router.get('/me', vaultController.getMyVaults);
router.get('/me/documents', vaultController.getMyDocuments);
router.post('/create', multerUpload.array('documents', 12), vaultController.createVault);
router.get('/:vaultId', vaultController.getVault);
router.get('/:vaultId/qrcode', vaultController.getVaultQrHandler);
router.post('/:vaultId/qrcode/regenerate', vaultController.regenerateVaultQrHandler);
router.post('/:vaultId/documents', multerUpload.array('documents', 12), vaultController.addDocuments);
router.patch('/:vaultId/documents/:documentId', vaultController.renameDocumentHandler);
router.delete('/:vaultId/documents/:documentId', vaultController.deleteDocumentHandler);

module.exports = router;
