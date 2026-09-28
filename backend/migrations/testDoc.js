const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const connectDB = require('../config/db');
const Document = require('../models/Document');

async function check() {
  await connectDB();
  const doc = await Document.findOne({ documentName: /eAadhaar/i });
  console.log('✅ Found document:', doc ? doc.documentName : 'none');
  console.log('✅ Has fileData:', Boolean(doc && doc.fileData));
  if (doc && doc.fileData) {
    console.log('✅ Binary base64 length:', doc.fileData.length, 'chars');
    const buffer = Buffer.from(doc.fileData, 'base64');
    console.log('✅ First 4 bytes (PDF Magic Header):', buffer.slice(0, 4).toString());
  }
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
