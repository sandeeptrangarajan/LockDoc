/* ============================================================
   LockDoc — Blockchain Ledger & Tamper Sentinel Service
   Immutable cryptographic ledger for apartment entry verification,
   proof of existence, and real-time tamper detection.
   ============================================================ */
const crypto = require('crypto');
const Block = require('../models/Block');
const Document = require('../models/Document');
const AuditLog = require('../models/AuditLog');

function sha256(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

function calculateBlockHash(index, previousHash, timestamp, merkleRoot, nonce) {
  const ts = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  return sha256(`${index}-${previousHash}-${ts}-${merkleRoot}-${nonce}`);
}

function calculateDocHash(doc) {
  const canonical = {
    id: doc._id ? doc._id.toString() : (doc.id || ''),
    documentName: doc.documentName || doc.name || '',
    documentType: doc.documentType || doc.category || '',
    ownerId: doc.ownerId ? doc.ownerId.toString() : '',
    fileUrl: doc.fileUrl || '',
    size: (doc.metadata && doc.metadata.size) || 0
  };
  return sha256(canonical);
}

/**
 * Ensures Genesis Block exists in the database.
 */
async function ensureGenesisBlock() {
  const count = await Block.countDocuments();
  if (count > 0) return await Block.findOne({ index: 0 });

  const genesisTimestamp = new Date('2026-01-01T00:00:00.000Z');
  const genesisTransactions = [{
    txId: 'tx_genesis_0000',
    type: 'GENESIS',
    actor: 'Apartment-Gate-Master-Node',
    docHash: '0000000000000000000000000000000000000000000000000000000000000000',
    docName: 'LockDoc Genesis Ledger — Skyline Heights Gate Sentinel',
    details: 'Initial consensus block for urban apartment checkpoint verification ledger.',
    timestamp: genesisTimestamp
  }];

  const merkleRoot = sha256(genesisTransactions);
  const previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const hash = calculateBlockHash(0, previousHash, genesisTimestamp, merkleRoot, 0);

  const genesisBlock = await Block.create({
    index: 0,
    timestamp: genesisTimestamp,
    transactions: genesisTransactions,
    previousHash,
    merkleRoot,
    nonce: 0,
    hash,
    miner: 'Apartment-Gate-Master-Node'
  });

  return genesisBlock;
}

/**
 * Mines and commits a new block with given transactions.
 */
async function mineBlock(transactions, actor = 'Gate-Security-Node') {
  await ensureGenesisBlock();
  const latestBlock = await Block.findOne().sort({ index: -1 });
  const newIndex = latestBlock ? latestBlock.index + 1 : 1;
  const previousHash = latestBlock ? latestBlock.hash : '0000000000000000000000000000000000000000000000000000000000000000';
  const timestamp = new Date();
  const merkleRoot = sha256(transactions);

  let nonce = 0;
  let hash = '';
  // Lightweight proof-of-work (difficulty 1 - prefix with "0")
  while (true) {
    hash = calculateBlockHash(newIndex, previousHash, timestamp, merkleRoot, nonce);
    if (hash.startsWith('0')) break;
    nonce++;
  }

  const block = await Block.create({
    index: newIndex,
    timestamp,
    transactions,
    previousHash,
    merkleRoot,
    nonce,
    hash,
    miner: actor
  });

  return block;
}

/**
 * Anchors a document to the blockchain.
 */
async function anchorDocument(doc, actor = 'Resident-Self-Anchor') {
  const docHash = calculateDocHash(doc);
  const tx = {
    txId: 'tx_' + crypto.randomBytes(6).toString('hex'),
    type: 'DOCUMENT_ANCHOR',
    actor,
    docHash,
    docName: doc.documentName || doc.name,
    vaultId: (doc.vaultId || '').toString(),
    details: `Cryptographic anchoring for apartment checkpoint ID: ${doc.documentName || doc.name}`,
    timestamp: new Date()
  };

  return await mineBlock([tx], actor);
}

/**
 * Verifies the complete blockchain integrity and detects any document tampering.
 */
async function verifyBlockchainIntegrity() {
  await ensureGenesisBlock();
  const blocks = await Block.find().sort({ index: 1 });
  const tamperedBlocks = [];
  const tamperedDocs = [];

  for (let i = 0; i < blocks.length; i++) {
    const current = blocks[i];

    // Check block hash calculation
    const computedHash = calculateBlockHash(
      current.index,
      current.previousHash,
      current.timestamp,
      current.merkleRoot,
      current.nonce
    );

    if (computedHash !== current.hash) {
      tamperedBlocks.push({
        blockIndex: current.index,
        error: 'Block hash corrupted',
        expected: current.hash,
        computed: computedHash
      });
    }

    // Check previous hash link
    if (i > 0) {
      const prev = blocks[i - 1];
      if (current.previousHash !== prev.hash) {
        tamperedBlocks.push({
          blockIndex: current.index,
          error: 'Broken chain link: previousHash mismatch',
          expectedPrevHash: prev.hash,
          foundPrevHash: current.previousHash
        });
      }
    }

    // Verify transactions against active documents if applicable
    for (const tx of current.transactions) {
      if (tx.type === 'DOCUMENT_ANCHOR' && tx.docHash) {
        const doc = await Document.findOne({ documentName: tx.docName });
        if (doc) {
          const currentDocHash = calculateDocHash(doc);
          if (currentDocHash !== tx.docHash) {
            tamperedDocs.push({
              docId: doc._id,
              docName: doc.documentName,
              blockIndex: current.index,
              anchoredHash: tx.docHash,
              currentHash: currentDocHash,
              tamperedAt: new Date()
            });
          }
        }
      }
    }
  }

  const isValid = tamperedBlocks.length === 0 && tamperedDocs.length === 0;

  return {
    valid: isValid,
    totalBlocks: blocks.length,
    latestBlockHash: blocks[blocks.length - 1] ? blocks[blocks.length - 1].hash : '',
    tamperedBlocks,
    tamperedDocs,
    timestamp: new Date()
  };
}

/**
 * Records an immediate tamper alert block and logs it for instant notification.
 */
async function recordTamperAlert(docName, originalHash, tamperedHash, alertDetails) {
  const tx = {
    txId: 'alert_' + crypto.randomBytes(6).toString('hex'),
    type: 'TAMPER_ALERT',
    actor: 'Blockchain-Tamper-Sentinel',
    docHash: tamperedHash,
    docName: docName,
    details: `TAMPER ALERT: ${alertDetails}. Original: ${originalHash} -> Tampered: ${tamperedHash}`,
    timestamp: new Date()
  };

  const block = await mineBlock([tx], 'Security-Checkpoint-Sentinel');

  // Also log to AuditLog
  try {
    await AuditLog.create({
      action: 'TAMPER_ALERT',
      details: `Critical: Document "${docName}" was modified unauthorized! Mismatch with Block #${block.index}`,
      metadata: { originalHash, tamperedHash, blockIndex: block.index }
    });
  } catch (e) {}

  return { block, alert: tx };
}

module.exports = {
  sha256,
  calculateDocHash,
  calculateBlockHash,
  ensureGenesisBlock,
  mineBlock,
  anchorDocument,
  verifyBlockchainIntegrity,
  recordTamperAlert
};
