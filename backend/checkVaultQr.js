// Run this from inside your backend folder:
//   node checkVaultQr.js
//
// It connects using the same MONGO_URI you already have in backend/.env,
// finds the vault QR record, shows you what's in it, and — only if
// encryptedData looks broken — offers to fix it automatically.

require('dotenv').config();
const mongoose = require('mongoose');

const OWNER_ID = '6a6882bda00a44167f50c993';
const VAULT_ID = '6a6c60e3d0e7448aaff7a9ff';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in your .env file');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection('vaultqrcodes');

  const doc = await collection.findOne({
    ownerId: new mongoose.Types.ObjectId(OWNER_ID),
    vaultId: new mongoose.Types.ObjectId(VAULT_ID),
    status: 'active'
  });

  if (!doc) {
    console.log('No active vault QR record found for this owner/vault — nothing to fix. A fresh one will be created next time the vault page loads.');
    await mongoose.disconnect();
    return;
  }

  console.log('\n--- Found record ---');
  console.log('_id:', doc._id.toString());
  console.log('status:', doc.status);
  console.log('encryptedData present?', !!doc.encryptedData);
  console.log('encryptedData length:', doc.encryptedData ? doc.encryptedData.length : 0);
  console.log('encryptedData value:', doc.encryptedData);
  console.log('---------------------\n');

  const isBroken = !doc.encryptedData || doc.encryptedData.length < 40; // valid payloads are much longer

  if (isBroken) {
    console.log('⚠️  This record looks broken (missing/short encryptedData). Marking it as revoked so a new one gets generated...');
    await collection.updateOne(
      { _id: doc._id },
      { $set: { status: 'revoked' } }
    );
    console.log('✅ Done. Reload vault-detail.html for this vault — a fresh QR code will be created automatically.');
  } else {
    console.log('This record looks fine (encryptedData is present and reasonably long). The issue may be elsewhere — let me know and we\'ll dig further.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Script error:', err.message);
  process.exit(1);
});