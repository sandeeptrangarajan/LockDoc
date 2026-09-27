/* ============================================================
   LockDoc — Blockchain Routes
   Endpoints for blockchain ledger inspection, chain verification,
   document anchoring, and real-time tamper alert broadcast.
   ============================================================ */
const express = require('express');
const router = express.Router();
const Block = require('../models/Block');
const blockchainService = require('../services/blockchainService');

// Public or session-accessible: get current blockchain status & stats
router.get('/status', async (req, res) => {
  try {
    await blockchainService.ensureGenesisBlock();
    const count = await Block.countDocuments();
    const latest = await Block.findOne().sort({ index: -1 }).lean();
    res.json({
      success: true,
      chainLength: count,
      latestBlock: latest ? {
        index: latest.index,
        hash: latest.hash,
        previousHash: latest.previousHash,
        timestamp: latest.timestamp,
        transactionsCount: latest.transactions ? latest.transactions.length : 0
      } : null,
      status: 'SECURE_ACTIVE'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Full chain verification — checks for any hash or previousHash corruption
router.get('/verify', async (req, res) => {
  try {
    const audit = await blockchainService.verifyBlockchainIntegrity();
    res.json({
      success: true,
      audit
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all blocks in the ledger
router.get('/chain', async (req, res) => {
  try {
    await blockchainService.ensureGenesisBlock();
    const blocks = await Block.find().sort({ index: 1 }).limit(100).lean();
    res.json({
      success: true,
      count: blocks.length,
      chain: blocks
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Anchor a document to the blockchain
router.post('/anchor', async (req, res) => {
  try {
    const { documentName, documentType, fileUrl, size, actor } = req.body;
    if (!documentName) {
      return res.status(400).json({ success: false, message: 'documentName is required' });
    }
    const block = await blockchainService.anchorDocument({
      documentName,
      documentType: documentType || 'identity',
      fileUrl: fileUrl || '',
      metadata: { size: size || 1024 }
    }, actor || 'Checkpoint-Security-Node');

    res.json({
      success: true,
      message: 'Document anchored to blockchain ledger successfully',
      block: {
        index: block.index,
        hash: block.hash,
        previousHash: block.previousHash,
        timestamp: block.timestamp
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Broadcast and log immediate tamper detection alert
router.post('/tamper-alert', async (req, res) => {
  try {
    const { docName, originalHash, tamperedHash, alertDetails } = req.body;
    const result = await blockchainService.recordTamperAlert(
      docName || 'Unknown Document',
      originalHash || 'GENUINE_HASH_MISSING',
      tamperedHash || 'TAMPERED_HASH',
      alertDetails || 'Unauthorized modification intercepted by gate security node'
    );

    res.status(200).json({
      success: true,
      alertBroadcasted: true,
      message: 'CRITICAL: Tamper alert committed to blockchain and security node notified.',
      blockIndex: result.block.index,
      alertTx: result.alert
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
