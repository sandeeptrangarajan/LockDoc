const User = require('../models/User');
const { getOrCreateQrForUser, decodeQrPayload } = require('../services/qrService');
const { resolveVaultQrScan } = require('../services/vaultService');

async function getMyQr(req, res) {
  try {
    const userId = req.userId || (req.user && req.user._id);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const qrData = await getOrCreateQrForUser(user);
    res.status(200).json({ success: true, ...qrData });
  } catch (err) {
    console.error('❌ Failed to generate QR:', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate QR code' });
  }
}

async function scanQr(req, res) {
  try {
    const { encryptedData } = req.body;
    console.log('🔍 scan-vault received. type:', typeof encryptedData, '| length:', encryptedData ? encryptedData.length : 0, '| value:', encryptedData);
    if (!encryptedData) {
      return res.status(400).json({ success: false, message: 'encryptedData is required' });
    }

    const payload = await decodeQrPayload(encryptedData);

    const owner = await User.findOne({ lockdocId: payload.lockdocId }).select('fullName lockdocId');
    if (!owner) {
      return res.status(404).json({ success: false, message: 'LockDoc ID not found' });
    }

    res.status(200).json({
      success: true,
      message: `This LockDoc belongs to ${owner.fullName}`,
      lockdocId: owner.lockdocId
    });
  } catch (err) {
    console.error('❌ Failed to scan QR:', err.message);
    res.status(400).json({ success: false, message: 'Invalid or tampered QR code' });
  }
}

async function scanVaultQr(req, res) {
  try {
    const { encryptedData } = req.body;
    if (!encryptedData) {
      return res.status(400).json({ success: false, message: 'encryptedData is required' });
    }

    const info = await resolveVaultQrScan(encryptedData);

    if (req.userId && info.ownerId === req.userId.toString()) {
      info.isSelf = true;
    }

    res.status(200).json({ success: true, ...info });
  } catch (err) {
    console.error('❌ Failed to scan vault QR:', err.message);
    res.status(400).json({ success: false, message: 'Invalid, tampered, or expired QR code' });
  }
}

module.exports = { getMyQr, scanQr, scanVaultQr };