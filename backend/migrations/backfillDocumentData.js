const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const connectDB = require('../config/db');
const Document = require('../models/Document');

async function backfill() {
  await connectDB();
  console.log('🔄 Checking existing documents for missing fileData...');

  const docs = await Document.find();
  console.log(`Found ${docs.length} total documents in database.`);

  const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'vaults');
  let updatedCount = 0;

  for (const doc of docs) {
    if (!doc.fileData) {
      let foundPath = null;
      if (doc.storagePath) {
        const candidate = path.join(UPLOAD_ROOT, path.basename(doc.storagePath));
        if (fs.existsSync(candidate)) foundPath = candidate;
      }
      if (!foundPath && doc.fileUrl) {
        const candidate = path.join(UPLOAD_ROOT, path.basename(doc.fileUrl));
        if (fs.existsSync(candidate)) foundPath = candidate;
      }
      if (!foundPath && doc.documentName) {
        // Search directory for original name match
        const files = fs.readdirSync(UPLOAD_ROOT);
        const match = files.find(f => f.includes(doc.documentName.replace(/[^a-zA-Z0-9\.\-_]/g, '_')));
        if (match) foundPath = path.join(UPLOAD_ROOT, match);
      }

      if (foundPath && fs.existsSync(foundPath)) {
        const buffer = fs.readFileSync(foundPath);
        const base64 = buffer.toString('base64');
        const mime = doc.metadata?.mimeType || (doc.documentType === 'PDF' ? 'application/pdf' : 'image/png');
        doc.fileData = base64;
        doc.fileUrl = `data:${mime};base64,${base64}`;
        await doc.save();
        updatedCount++;
        console.log(`✅ Backfilled fileData for: "${doc.documentName}" (${(buffer.length / 1024).toFixed(1)} KB)`);
      } else {
        console.log(`⚠️ File on disk not found for: "${doc.documentName}"`);
      }
    } else {
      console.log(`ℹ️ Document already has fileData: "${doc.documentName}"`);
    }
  }

  console.log(`\n🎉 Backfill complete. Updated ${updatedCount} documents.`);
  process.exit(0);
}

backfill().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
