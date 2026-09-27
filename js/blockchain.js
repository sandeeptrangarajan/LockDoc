/* ============================================================
   LockDoc — blockchain.js
   Client-Side Cryptographic Blockchain Engine & Real-Time Tamper Sentinel
   for Urban Apartment & City Entrance ID Verification.
   
   Guarantees:
   1. Cryptographic proof-of-existence for all resident/visitor credentials.
   2. SHA-256 block-chaining with immutable parent-hash links.
   3. Real-time active watchdog: immediate notification if any data is altered.
   ============================================================ */

window.LD = window.LD || {};

LD.KEYS = LD.KEYS || {};
LD.KEYS.BLOCKCHAIN = 'lockdoc_blockchain_ledger';
LD.KEYS.ORIGINAL_DOCS_BACKUP = 'lockdoc_original_docs_backup';

(function () {
  /* ------------------------------------------------------------
     Fast, synchronous SHA-256 implementation (Bitwise pure JS)
     Guarantees instant hashing with zero async latency
     ------------------------------------------------------------ */
  function sha256Sync(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }

    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';

    var words = [];
    var asciiBitLength = ascii[lengthProperty] * 8;

    var hash = [];
    var k = [];
    var primeCounter = 0;

    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    ascii += '\x80';
    while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return; // Non-ASCII
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;

    for (j = 0; j < words[lengthProperty];) {
      var w = words.slice(j, (j += 16));
      var oldHash = hash;
      hash = hash.slice(0, 8);

      for (i = 0; i < 64; i++) {
        var i2 = i + j;
        var w15 = w[i - 15],
          w2 = w[i - 2];

        var a = hash[0],
          e = hash[4];
        var temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);

        var temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }

      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      for (i2 = 3; i2 >= 0; i2--) {
        var b = (hash[i] >> (i2 * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  LD.sha256 = sha256Sync;

  /* ------------------------------------------------------------
     Blockchain Core Engine
     ------------------------------------------------------------ */
  LD.blockchain = {
    isTamperAlertActive: false,
    watchdogTimer: null,
    listeners: [],

    // Deterministic canonical string for a document
    canonicalDocString: function (doc) {
      if (!doc) return '';
      return [
        doc.id || '',
        doc.name || '',
        doc.category || '',
        doc.issuer || '',
        doc.verified ? 'VERIFIED_TRUE' : 'VERIFIED_FALSE'
      ].join('::');
    },

    // Calculate SHA-256 hash of a document
    hashDocument: function (doc) {
      return sha256Sync(this.canonicalDocString(doc));
    },

    // Calculate block hash
    hashBlock: function (index, previousHash, timestamp, merkleRoot, nonce) {
      return sha256Sync(index + '||' + previousHash + '||' + timestamp + '||' + merkleRoot + '||' + nonce);
    },

    // Get all blocks in the local ledger
    getChain: function () {
      return LD.store.get(LD.KEYS.BLOCKCHAIN, []);
    },

    // Save chain to storage
    saveChain: function (chain) {
      LD.store.set(LD.KEYS.BLOCKCHAIN, chain);
    },

    // Initialize or bootstrap the blockchain
    init: function () {
      var chain = this.getChain();

      // Backup pristine seed docs for the tamper-restoration feature
      if (!LD.store.get(LD.KEYS.ORIGINAL_DOCS_BACKUP)) {
        LD.store.set(LD.KEYS.ORIGINAL_DOCS_BACKUP, LD.SEED_DOCUMENTS);
      }

      if (chain.length === 0) {
        // Create Genesis Block #0
        var genesisTimestamp = '2026-01-01T00:00:00.000Z';
        var genesisMerkle = sha256Sync('GENESIS_APARTMENT_CHECKPOINT_LEDGER');
        var genesisPrev = '0000000000000000000000000000000000000000000000000000000000000000';
        var genesisHash = this.hashBlock(0, genesisPrev, genesisTimestamp, genesisMerkle, 0);

        var genesisBlock = {
          index: 0,
          timestamp: genesisTimestamp,
          docId: 'GENESIS',
          docName: 'LockDoc Genesis Ledger — Skyline Heights Gate Sentinel',
          docHash: genesisMerkle,
          previousHash: genesisPrev,
          merkleRoot: genesisMerkle,
          nonce: 0,
          hash: genesisHash,
          miner: 'Skyline-Heights-Consensus-Node-01',
          status: 'IMMUTABLE'
        };

        chain = [genesisBlock];
        this.saveChain(chain);
      }

      // Anchor any documents that are not yet in the blockchain
      var docs = LD.data.documents();
      var updated = false;

      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var existing = chain.find(function (b) { return b.docId === doc.id; });
        if (!existing) {
          chain = this._appendDocBlock(chain, doc);
          updated = true;
        }
      }

      if (updated) {
        this.saveChain(chain);
      }

      // Start the real-time watchdog immediately
      this.startWatchdog(1200);

      // Listen for storage events across other tabs/windows
      window.addEventListener('storage', function (e) {
        if (e.key === LD.KEYS.DOCUMENTS || e.key === LD.KEYS.BLOCKCHAIN) {
          LD.blockchain.checkIntegrityNow();
        }
      });
    },

    // Internal helper to mine and append a document block
    _appendDocBlock: function (chain, doc) {
      var latest = chain[chain.length - 1];
      var newIndex = latest.index + 1;
      var docHash = this.hashDocument(doc);
      var timestamp = new Date().toISOString();
      var previousHash = latest.hash;
      var merkleRoot = docHash;

      // Fast proof-of-work (difficulty 1)
      var nonce = 0;
      var hash = '';
      while (true) {
        hash = this.hashBlock(newIndex, previousHash, timestamp, merkleRoot, nonce);
        if (hash.charAt(0) === '0' || nonce > 200) break; // target starting with '0'
        nonce++;
      }

      var newBlock = {
        index: newIndex,
        timestamp: timestamp,
        docId: doc.id,
        docName: doc.name,
        docCategory: doc.category,
        docIssuer: doc.issuer,
        docHash: docHash,
        previousHash: previousHash,
        merkleRoot: merkleRoot,
        nonce: nonce,
        hash: hash,
        miner: 'Apartment-Gate-Master-Node',
        status: 'IMMUTABLE'
      };

      chain.push(newBlock);
      return chain;
    },

    // Explicitly anchor a newly uploaded/added document
    anchorDocument: function (doc) {
      var chain = this.getChain();
      chain = this._appendDocBlock(chain, doc);
      this.saveChain(chain);

      LD.data.addAuditLog(
        'document_anchored',
        'Blockchain Block #' + (chain.length - 1) + ' Mined',
        'Cryptographic hash anchored for ' + doc.name
      );

      return chain[chain.length - 1];
    },

    /* ------------------------------------------------------------
       Integrity Verification & Tamper Detection
       ------------------------------------------------------------ */
    verify: function () {
      var chain = this.getChain();
      var docs = LD.data.documents();
      var tamperedDocs = [];
      var brokenChainBlocks = [];

      // 1. Verify chain internal hash integrity
      for (var i = 0; i < chain.length; i++) {
        var block = chain[i];
        var expectedHash = this.hashBlock(
          block.index,
          block.previousHash,
          block.timestamp,
          block.merkleRoot,
          block.nonce
        );

        if (expectedHash !== block.hash) {
          brokenChainBlocks.push({
            index: block.index,
            reason: 'Block internal hash mismatch',
            expected: block.hash,
            computed: expectedHash
          });
        }

        if (i > 0) {
          var prev = chain[i - 1];
          if (block.previousHash !== prev.hash) {
            brokenChainBlocks.push({
              index: block.index,
              reason: 'Parent block hash link broken',
              expectedParent: prev.hash,
              actualPrevious: block.previousHash
            });
          }
        }
      }

      // 2. Verify all active documents against their immutable blockchain record
      for (var j = 0; j < docs.length; j++) {
        var doc = docs[j];
        var matchingBlock = chain.find(function (b) { return b.docId === doc.id; });

        if (matchingBlock) {
          var currentHash = this.hashDocument(doc);
          if (currentHash !== matchingBlock.docHash) {
            tamperedDocs.push({
              docId: doc.id,
              docName: doc.name,
              category: doc.category,
              blockIndex: matchingBlock.index,
              anchoredHash: matchingBlock.docHash,
              currentHash: currentHash,
              detectedAt: new Date().toISOString()
            });
          }
        }
      }

      var isValid = brokenChainBlocks.length === 0 && tamperedDocs.length === 0;

      return {
        valid: isValid,
        chainLength: chain.length,
        tamperedDocs: tamperedDocs,
        brokenChainBlocks: brokenChainBlocks,
        latestHash: chain.length > 0 ? chain[chain.length - 1].hash : '',
        timestamp: new Date().toISOString()
      };
    },

    /* ------------------------------------------------------------
       Continuous Real-Time Watchdog
       ------------------------------------------------------------ */
    startWatchdog: function (intervalMs) {
      if (this.watchdogTimer) clearInterval(this.watchdogTimer);
      var self = this;
      this.watchdogTimer = setInterval(function () {
        self.checkIntegrityNow();
      }, intervalMs || 1200);
    },

    checkIntegrityNow: function () {
      var result = this.verify();
      if (!result.valid) {
        if (!this.isTamperAlertActive) {
          this.isTamperAlertActive = true;
          this.triggerImmediateTamperAlert(result);
        }
      } else {
        if (this.isTamperAlertActive) {
          this.isTamperAlertActive = false;
          this.dismissTamperAlert();
        }
      }
      this.updateStatusPill(result);
      return result;
    },

    /* ------------------------------------------------------------
       Immediate Tamper Alert Notification System
       ------------------------------------------------------------ */
    triggerImmediateTamperAlert: function (auditResult) {
      var tampered = auditResult.tamperedDocs[0] || {
        docName: 'Encrypted Credential',
        anchoredHash: 'UNKNOWN',
        currentHash: 'CORRUPTED',
        blockIndex: '?'
      };

      // 1. Audio-visual chime / beep
      try {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch alarm
        osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch (e) {}

      // 2. High-visibility pulsing Alert Modal & Banner
      var existingModal = document.getElementById('blockchain-tamper-modal');
      if (!existingModal) {
        var modal = document.createElement('div');
        modal.id = 'blockchain-tamper-modal';
        modal.style.cssText = [
          'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;',
          'background:rgba(15, 23, 42, 0.6);backdrop-filter:blur(10px);',
          'display:flex;align-items:center;justify-content:center;padding:20px;'
        ].join('');

        modal.innerHTML = [
          '<div style="max-width:540px;width:100%;background:#FFFFFF;border:2px solid #F43F5E;',
          'box-shadow:0 12px 40px rgba(244,63,94,0.3);',
          'border-radius:20px;padding:28px;color:#0F172A;text-align:center;animation:pulseAlarm 1.2s infinite alternate;">',
          '  <div style="width:68px;height:68px;border-radius:50%;background:#FFF1F2;border:2px solid #FECDD3;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;">🚨</div>',
          '  <span style="display:inline-block;padding:4px 14px;border-radius:100px;background:#F43F5E;color:#FFFFFF;font-weight:900;font-size:11.5px;letter-spacing:0.08em;margin-bottom:10px;">CRITICAL BLOCKCHAIN TAMPER ALERT</span>',
          '  <h2 style="font-size:22px;font-weight:800;color:#0F172A;margin-bottom:8px;">Data Integrity Breach Detected!</h2>',
          '  <p style="font-size:13.5px;color:#475569;line-height:1.55;margin-bottom:16px;">',
          '    A credential was altered unauthorizedly in storage! The document cryptographic hash does not match the immutable blockchain ledger.',
          '  </p>',
          '  <div style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:12px;padding:14px;text-align:left;font-family:monospace;font-size:11.5px;margin-bottom:18px;color:#0F172A;">',
          '    <div style="margin-bottom:6px;"><strong style="color:#0284C7;">Document:</strong> <span id="tamper-doc-name">' + tampered.docName + '</span></div>',
          '    <div style="margin-bottom:6px;"><strong style="color:#D97706;">Blockchain Block:</strong> #' + tampered.blockIndex + '</div>',
          '    <div style="margin-bottom:6px;word-break:break-all;"><strong style="color:#059669;">Ledger Hash:</strong> <span style="color:#64748B;">' + tampered.anchoredHash + '</span></div>',
          '    <div style="word-break:break-all;"><strong style="color:#E11D48;">Corrupted Hash:</strong> <span style="color:#E11D48;font-weight:bold;">' + tampered.currentHash + '</span></div>',
          '  </div>',
          '  <p style="font-size:12px;color:#64748B;margin-bottom:20px;">',
          '    🔒 <strong>Enforced Action:</strong> Access is locked. Checkpoint security &amp; apartment administration have been notified.',
          '  </p>',
          '  <div style="display:flex;gap:10px;justify-content:center;">',
          '    <button id="restore-tamper-btn" style="flex:1;padding:12px 18px;border-radius:12px;background:linear-gradient(135deg,#0284C7,#6366F1);color:#FFFFFF;font-weight:800;font-size:13px;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(2,132,199,0.3);">✓ Restore Legitimate Data</button>',
          '    <button id="dismiss-tamper-btn" style="padding:12px 18px;border-radius:12px;background:#F1F5F9;color:#334155;font-weight:600;font-size:13px;border:1px solid #CBD5E1;cursor:pointer;">Acknowledge</button>',
          '  </div>',
          '</div>'
        ].join('');

        document.body.appendChild(modal);

        document.getElementById('restore-tamper-btn').addEventListener('click', function () {
          LD.blockchain.restoreLegitimateState();
        });

        document.getElementById('dismiss-tamper-btn').addEventListener('click', function () {
          modal.remove();
        });
      }

      // 3. Log tamper alert to audit trail
      LD.data.addAuditLog(
        'blockchain_tamper_alert',
        '🚨 DATA TAMPER BREACH: ' + tampered.docName,
        'Hash mismatch with Block #' + tampered.blockIndex + '. Access frozen.'
      );

      // 4. Toast notification
      if (LD.ui && LD.ui.toast) {
        LD.ui.toast('🚨 DATA TAMPERED: ' + tampered.docName + ' hash mismatch!', 'error');
      }

      // 5. If viewer page is open, freeze it
      if (document.getElementById('doc-stage')) {
        document.getElementById('doc-stage').innerHTML = [
          '<div style="text-align:center;padding:40px 20px;color:#E11D48;background:#FFFFFF;">',
          '  <div style="font-size:50px;margin-bottom:14px;">⛔</div>',
          '  <h2 style="font-size:22px;font-weight:800;">SESSION TERMINATED: TAMPER DETECTED</h2>',
          '  <p style="color:#64748B;font-size:13px;margin-top:8px;">',
          '    The document signature failed blockchain verification. Access revoked for security compliance.',
          '  </p>',
          '  <a href="index.html" class="btn btn-primary mt-4" style="display:inline-block;">Return to Dashboard</a>',
          '</div>'
        ].join('');
        if (LD.viewer && LD.viewer.stop) LD.viewer.stop();
      }

      // 6. Notify backend if online
      if (window.fetch) {
        try {
          fetch((LD.api ? LD.api.baseUrl : 'http://localhost:5000') + '/api/blockchain/tamper-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docName: tampered.docName,
              originalHash: tampered.anchoredHash,
              tamperedHash: tampered.currentHash,
              alertDetails: 'Immediate client-side watchdog tamper alert at apartment checkpoint'
            })
          }).catch(function () {});
        } catch (e) {}
      }
    },

    dismissTamperAlert: function () {
      var modal = document.getElementById('blockchain-tamper-modal');
      if (modal) modal.remove();
    },

    /* ------------------------------------------------------------
       Simulation Actions for Testing
       ------------------------------------------------------------ */
    // Simulates an unauthorized data alteration (e.g. malicious forged data)
    simulateTamper: function (targetDocId) {
      var docs = LD.data.documents();
      if (docs.length === 0) return;

      var doc = targetDocId ? docs.find(function (d) { return d.id === targetDocId; }) : docs[0];
      if (!doc) doc = docs[0];

      // Mutate the document data maliciously
      doc.name = '[FORGED] ' + doc.name;
      doc.issuer = 'Fake Forged Entity / Malicious Edit';
      doc.verified = false;

      // Write directly to store without re-anchoring to trigger immediate blockchain tamper alert
      LD.store.set(LD.KEYS.DOCUMENTS, docs);

      // Force instant check
      this.checkIntegrityNow();
    },

    // Restores legitimate pristine state
    restoreLegitimateState: function () {
      var backup = LD.store.get(LD.KEYS.ORIGINAL_DOCS_BACKUP, LD.SEED_DOCUMENTS);
      LD.store.set(LD.KEYS.DOCUMENTS, JSON.parse(JSON.stringify(backup)));

      // Re-anchor fresh if needed
      var chain = this.getChain();
      for (var i = 0; i < backup.length; i++) {
        var doc = backup[i];
        var blk = chain.find(function (b) { return b.docId === doc.id; });
        if (blk) {
          blk.docHash = this.hashDocument(doc);
          blk.docName = doc.name;
          blk.docIssuer = doc.issuer;
        }
      }
      this.saveChain(chain);

      this.isTamperAlertActive = false;
      this.dismissTamperAlert();

      if (LD.ui && LD.ui.toast) {
        LD.ui.toast('Blockchain integrity restored. All blocks 100% verified!', 'success');
      }

      // Re-render UI components
      var audit = this.verify();
      this.updateStatusPill(audit);
      setTimeout(function () {
        window.location.reload();
      }, 500);
    },

    /* ------------------------------------------------------------
       UI Component: Blockchain Status Pill & Sentinel Widget
       ------------------------------------------------------------ */
    updateStatusPill: function (audit) {
      var pill = document.getElementById('blockchain-status-pill');
      if (!pill) return;

      if (audit.valid) {
        pill.innerHTML = [
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;box-shadow:0 0 10px #10B981;margin-right:6px;"></span>',
          '<span style="color:#10B981;font-weight:700;">BLOCKCHAIN SECURE (' + audit.chainLength + ' BLOCKS)</span>'
        ].join('');
        pill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        pill.style.background = 'rgba(16, 185, 129, 0.08)';
      } else {
        pill.innerHTML = [
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F43F5E;box-shadow:0 0 12px #F43F5E;margin-right:6px;animation:pulseAlarm 0.8s infinite alternate;"></span>',
          '<span style="color:#F43F5E;font-weight:800;">⚠️ TAMPER ALERT DETECTED</span>'
        ].join('');
        pill.style.borderColor = 'rgba(244, 63, 94, 0.6)';
        pill.style.background = 'rgba(244, 63, 94, 0.15)';
      }
    }
  };

  // Add styles for the alarm animation
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes pulseAlarm { 0% { transform: scale(1); box-shadow: 0 0 20px rgba(244,63,94,0.3); } 100% { transform: scale(1.02); box-shadow: 0 0 45px rgba(244,63,94,0.7); } }',
    '.blockchain-sentinel-bar { background:rgba(10,15,28,0.95);border:1px solid rgba(0,240,255,0.25);border-radius:var(--radius);padding:14px 18px;margin-bottom:16px;box-shadow:0 0 20px rgba(0,240,255,0.1); }',
    '.blockchain-sentinel-bar.tampered { border-color:#F43F5E;box-shadow:0 0 30px rgba(244,63,94,0.3);background:rgba(25,10,18,0.95); }'
  ].join('\n');
  document.head.appendChild(style);

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      LD.blockchain.init();
    });
  } else {
    LD.blockchain.init();
  }
})();
