/* ============================================================
   LockDoc — Migration: Fix Vault QR Duplicate Key Errors

   This script:
   1. Drops the old strict unique index on (ownerId, vaultId)
   2. Keeps only the most recent 'active' QR per vault, revoking older ones
   3. Recreates the index as a PARTIAL unique index (only enforced on
      status: 'active' documents), matching the corrected model

   Run this ONCE against your database:
     cd backend
     node migrations/fixVaultQRDuplicates.js
   ============================================================ */

const mongoose = require('mongoose');
require('dotenv').config();

const VaultQRCode = require('../models/VaultQRCode');

async function fixDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Step 1: Drop the old (bad) index if it exists
    console.log('\n📋 Dropping old unique index...');
    try {
      await VaultQRCode.collection.dropIndex('ownerId_1_vaultId_1');
      console.log('✅ Old index dropped');
    } catch (err) {
      if (err.codeName === 'IndexNotFound' || /index not found/i.test(err.message)) {
        console.log("⚠️  Index already dropped or doesn't exist — continuing");
      } else {
        throw err;
      }
    }

    // Step 2: Find (ownerId, vaultId) pairs with more than one ACTIVE record
    // (these are the ones that will violate the new partial unique index)
    console.log("\n🔍 Finding vault QR pairs with multiple 'active' records...");
    const duplicates = await VaultQRCode.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: { ownerId: '$ownerId', vaultId: '$vaultId' },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    console.log(`Found ${duplicates.length} pairs with duplicate active records`);

    // Step 3: For each duplicate pair, keep the newest active one, revoke the rest
    for (const dup of duplicates) {
      const { _id, count } = dup;
      console.log(`\n  Processing (ownerId: ${_id.ownerId}, vaultId: ${_id.vaultId}) — ${count} active records`);

      const docs = await VaultQRCode.find({
        ownerId: _id.ownerId,
        vaultId: _id.vaultId,
        status: 'active'
      }).sort({ createdAt: -1 });

      for (let i = 1; i < docs.length; i++) {
        await VaultQRCode.updateOne(
          { _id: docs[i]._id },
          { status: 'revoked', updatedAt: new Date() }
        );
        console.log(`    ✅ Revoked older duplicate: ${docs[i]._id}`);
      }
    }

    // Step 4: Recreate the index as a partial unique index
    console.log('\n🔧 Creating new partial unique index...');
    await VaultQRCode.collection.createIndex(
      { ownerId: 1, vaultId: 1 },
      { unique: true, partialFilterExpression: { status: 'active' } }
    );
    console.log('✅ New partial index created');

    console.log('\n✨ Migration completed successfully!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixDuplicates();
