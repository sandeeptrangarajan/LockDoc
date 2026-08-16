/* ============================================================
   LockDoc — Verification Receipt Controller
   ============================================================ */
const {
  issueReceipt,
  verifyReceiptToken,
  listReceiptsForOwner,
  listReceiptsForVerifier
} = require('../services/receiptService');

async function createReceipt(req, res) {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required.' });
    }
    const receipt = await issueReceipt(requestId, req.user);
    res.status(201).json({ success: true, receipt });
  } catch (err) {
    console.error('Failed to issue verification receipt:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Failed to issue receipt.' });
  }
}

// Deliberately unauthenticated — anyone holding the receipt token
// (e.g. a hotel back office checking a guest's claim) can confirm
// it's genuine without a LockDoc account or seeing the document.
async function getReceipt(req, res) {
  try {
    const { token } = req.params;
    const receipt = await verifyReceiptToken(token);
    res.status(200).json({
      success: true,
      receipt: {
        ownerName: receipt.ownerName,
        verifierName: receipt.verifierName,
        documentName: receipt.documentName,
        documentType: receipt.documentType,
        verifiedAt: receipt.verifiedAt,
        status: receipt.status
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || 'Could not verify receipt.' });
  }
}

async function listMyReceipts(req, res) {
  try {
    const userId = req.userId || req.user._id;
    const role = req.query.role === 'verifier' ? 'verifier' : 'owner';
    const receipts = role === 'verifier'
      ? await listReceiptsForVerifier(userId)
      : await listReceiptsForOwner(userId);
    res.status(200).json({ success: true, receipts });
  } catch (err) {
    console.error('Failed to list receipts:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load receipts.' });
  }
}

module.exports = { createReceipt, getReceipt, listMyReceipts };
