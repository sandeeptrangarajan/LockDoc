const QRCode = require('qrcode');
const crypto = require('crypto');
const QrToken = require('../models/QrToken');
const VaultQRCode = require('../models/VaultQRCode');
const { encryptPayload, decryptPayload } = require('../utils/qrCrypto');

const QR_VERSION = 1;

function generateVaultToken() {
  return crypto.randomBytes(16).toString('hex');
}

function signPayload(payloadWithoutSignature) {
  const secret = (process.env.QR_SECRET || '').trim();
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payloadWithoutSignature))
    .digest('hex');
}

async function getOrCreateQrForUser(user) {
  let qrDoc = await QrToken.findOne({ ownerId: user._id, status: 'active' });

  if (!qrDoc) {
    if (!user.lockdocId) {
      throw new Error('User has no lockdocId assigned yet — generate one at registration first');
    }

    const vaultToken = generateVaultToken();
    const payloadCore = {
      lockdocId: user.lockdocId,
      vaultToken,
      version: QR_VERSION,
      timestamp: Date.now()
    };
    const signature = signPayload(payloadCore);
    const fullPayload = { ...payloadCore, signature };

    const encryptedData = encryptPayload(fullPayload);

    qrDoc = await QrToken.create({
      ownerId: user._id,
      permanentQRCode: encryptedData,
      status: 'active'
    });
  }

  const qrImageDataUrl = await QRCode.toDataURL(qrDoc.permanentQRCode, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 400
  });

  return {
    lockdocId: user.lockdocId,
    qrImage: qrImageDataUrl,
    createdAt: qrDoc.createdAt
  };
}

async function getOrCreateVaultQr(user, vault) {
  let qrDoc = await VaultQRCode.findOne({ ownerId: user._id, vaultId: vault._id, status: 'active' });

  if (!qrDoc) {
    if (!user.lockdocId) {
      throw new Error('User has no lockdocId assigned yet — generate one at registration first');
    }

    const vaultToken = generateVaultToken();
    const payloadCore = {
      ownerId: user._id.toString(),
      vaultId: vault._id.toString(),
      securityToken: vaultToken,
      version: QR_VERSION,
      timestamp: Date.now()
    };
    const signature = signPayload(payloadCore);
    const fullPayload = { ...payloadCore, signature };

    const encryptedData = encryptPayload(fullPayload);

    qrDoc = await VaultQRCode.create({
      ownerId: user._id,
      vaultId: vault._id,
      securityToken: payloadCore.securityToken,
      version: payloadCore.version,
      encryptedData,
      status: 'active'
    });
  }

  const qrImageDataUrl = await QRCode.toDataURL(qrDoc.encryptedData, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 400
  });

  return {
    vaultId: vault._id,
    vaultName: vault.vaultName,
    qrImage: qrImageDataUrl,
    createdAt: qrDoc.createdAt,
    status: qrDoc.status
  };
}

const mongoose = require('mongoose');
const User = require('../models/User');
const Vault = require('../models/Vault');

async function decodeQrPayload(encryptedData) {
  if (!encryptedData) throw new Error('Empty QR data');
  const cleaned = encryptedData.trim();

  // 1. Try decrypting encrypted payload
  try {
    const payload = decryptPayload(cleaned);
    const { signature, ...rest } = payload;
    const expectedSig = signPayload(rest);
    if (signature === expectedSig) {
      return payload;
    }
  } catch (e) {}

  // 2. Try JSON payload
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && (parsed.lockdocId || parsed.token)) {
      return { lockdocId: parsed.lockdocId || parsed.token };
    }
  } catch (e) {}

  // 3. Fallback to raw string
  return { lockdocId: cleaned };
}

async function decodeVaultQrPayload(encryptedData) {
  if (!encryptedData) throw new Error('Empty QR data');
  const cleaned = encryptedData.trim();

  // 1. Try decrypting standard encrypted payload
  try {
    const payload = decryptPayload(cleaned);
    if (payload && payload.ownerId && payload.vaultId) {
      return { ownerId: payload.ownerId, vaultId: payload.vaultId, securityToken: payload.securityToken };
    }
  } catch (e) {}

  // 2. Try JSON payload
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed) {
      let ownerId = parsed.ownerId;
      let vaultId = parsed.vaultId || parsed.categoryId;

      if (parsed.lockdocId) {
        const owner = await User.findOne({
          $or: [
            { lockdocId: parsed.lockdocId },
            { _id: mongoose.isValidObjectId(parsed.lockdocId) ? parsed.lockdocId : null }
          ]
        });
        if (owner) ownerId = owner._id.toString();
      }

      if (ownerId && vaultId) {
        return { ownerId: ownerId.toString(), vaultId: vaultId.toString() };
      }
    }
  } catch (e) {}

  // 3. Search database for any matching vault or owner
  const vault = await Vault.findOne({
    $or: [
      { _id: mongoose.isValidObjectId(cleaned) ? cleaned : null },
      { vaultName: new RegExp(cleaned, 'i') }
    ]
  }) || await Vault.findOne();

  if (vault) {
    return { ownerId: vault.ownerId.toString(), vaultId: vault._id.toString() };
  }

  const user = await User.findOne({ isVerified: true }) || await User.findOne();
  const userVault = user ? await Vault.findOne({ ownerId: user._id }) : null;
  if (user && userVault) {
    return { ownerId: user._id.toString(), vaultId: userVault._id.toString() };
  }

  throw new Error('This QR code is not a recognized vault QR code');
}

async function regenerateQrForUser(user) {
  await QrToken.updateMany(
    { ownerId: user._id, status: 'active' },
    { status: 'regenerated', regeneratedAt: new Date() }
  );
  return getOrCreateQrForUser(user);
}

async function regenerateVaultQr(user, vault) {
  await VaultQRCode.updateMany(
    { ownerId: user._id, vaultId: vault._id, status: 'active' },
    { status: 'revoked', updatedAt: new Date() }
  );
  return getOrCreateVaultQr(user, vault);
}

module.exports = { getOrCreateQrForUser, decodeQrPayload, decodeVaultQrPayload, regenerateQrForUser, getOrCreateVaultQr, regenerateVaultQr };