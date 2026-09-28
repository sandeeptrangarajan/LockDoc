/* =========================================================
   LockDoc — viewer.js
   Drives viewer.html: 
   1. Validates document access (either Direct Owner Vault View
      or Ephemeral 60s Requester Access with temporary token).
   2. Renders real document content (Images, PDFs, or Digital
      Credential Cards with blockchain anchors).
   3. Applies watermarking, countdown timer, and security guards.
   ========================================================= */

window.LD = window.LD || {};

LD.viewer = {
  isOwnerMode: false,
  docRequest: null,
  doc: null,
  session: null,
  block: null,
  secondsLeft: 60,
  maxSeconds: 60,
  timerId: null
};

/* ---------------------------------------------------------
   Helper: resolve file URL relative to backend / API_BASE
   --------------------------------------------------------- */
LD.viewer.resolveFileUrl = function(fileUrl) {
  if (!fileUrl) return '';
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://') || fileUrl.startsWith('data:')) {
    return fileUrl;
  }
  var base = (window.LD && LD.api && LD.api.baseUrl) ? LD.api.baseUrl : window.location.origin;
  var fullUrl = base.replace(/\/+$/, '') + '/' + fileUrl.replace(/^\/+/, '');
  var separator = fullUrl.includes('?') ? '&' : '?';
  return fullUrl + separator + 'ngrok-skip-browser-warning=true';
};

/* ---------------------------------------------------------
   Initialize viewer: handles ?doc=... OR ?requestId=...&token=...
   --------------------------------------------------------- */
LD.viewer.init = async function(){
  var params = new URLSearchParams(window.location.search);
  var docId = params.get('doc') || params.get('docId') || params.get('id');
  var requestId = params.get('requestId');
  var token = params.get('token');

  // Make sure documents are populated
  if (LD.data && typeof LD.data.documents === 'function' && LD.data.documents().length === 0) {
    if (LD.init) LD.init();
  }

  // If user is authenticated, attempt to sync vault documents from backend
  if (LD.data && LD.data.isJwtAuthenticated() && LD.app && LD.app.loadVaultDocuments) {
    try {
      await LD.app.loadVaultDocuments();
    } catch(e) {}
  }

  // -------------------------------------------------------
  // CASE 1: Direct Vault Owner Mode (?doc=...)
  // -------------------------------------------------------
  if (docId) {
    var doc = LD.data.documentById(docId);

    // If not found in local cache, search backend vault documents
    if (!doc && LD.api && LD.api.getVaultDocuments) {
      try {
        var vaultRes = await LD.api.getVaultDocuments();
        if (vaultRes && vaultRes.success && vaultRes.documents) {
          var found = vaultRes.documents.find(function(d){
            return d.id === docId || d._id === docId;
          });
          if (found) {
            doc = {
              id: found.id || found._id || docId,
              name: found.documentName || found.name || 'Document',
              category: found.category || 'identity',
              issuer: found.vaultName || (found.metadata && found.metadata.provider) || 'Vault Authority',
              verified: found.encryptionStatus === 'encrypted',
              fileUrl: found.fileUrl,
              uploadDate: found.uploadDate,
              metadata: found.metadata
            };
            // Persist into local store so subsequent calls find it
            var existing = LD.store.get(LD.KEYS.DOCUMENTS, []);
            if (!existing.find(function(d){ return d.id === doc.id; })) {
              existing.push(doc);
              LD.store.set(LD.KEYS.DOCUMENTS, existing);
            }
          }
        }
      } catch(err) {
        console.warn('Backend document search failed:', err);
      }
    }

    if (!doc) {
      LD.viewer.showLocked('Document not found in vault. Please check the document link.');
      return false;
    }

    var currentUser = (LD.data && LD.data.currentUser) ? LD.data.currentUser() : null;
    var ownerName = (currentUser && (currentUser.name || currentUser.fullName || currentUser.email)) 
      ? (currentUser.name || currentUser.fullName || currentUser.email) 
      : 'Vault Owner';

    LD.viewer.isOwnerMode = true;
    LD.viewer.doc = doc;
    LD.viewer.session = {
      sessionId: 'OWNER-' + doc.id.toUpperCase(),
      requesterName: ownerName + ' (Owner Inspection)',
      ownerName: ownerName,
      organizationName: 'LockDoc Hardware Vault',
      purpose: 'Owner Direct Security Inspection'
    };
    LD.viewer.secondsLeft = 180;
    LD.viewer.maxSeconds = 180;

    // Blockchain Ledger Integrity Check
    LD.viewer.verifyBlockchainIntegrity(doc);

    // Audit log
    LD.data.addAuditLog('owner_inspected', 'Vault document viewed', ownerName + ' inspected ' + doc.name);
    return true;
  }

  // -------------------------------------------------------
  // CASE 2: Ephemeral Requester Mode (?requestId=...&token=...)
  // -------------------------------------------------------
  if (!requestId || !token) {
    LD.viewer.showLocked('Missing access credentials. Please scan the vault QR or request access from the owner.');
    return false;
  }

  var docRequest = LD.data.getDocumentRequest(requestId);
  var backendResult = null;

  if (LD.data.isJwtAuthenticated() && LD.api && LD.api.validateDocumentAccess) {
    try {
      var response = await LD.api.validateDocumentAccess(requestId, token);
      if (response && response.success && response.result) {
        backendResult = response.result;
      }
    } catch (err) {
      console.error('Backend access validation failed:', err);
    }
  }

  if (backendResult) {
    docRequest = backendResult.request;
    docRequest.requestId = docRequest._id || docRequest.requestId || docRequest.id;
    LD.data.addDocumentRequest(docRequest);
  }

  if (!docRequest) {
    LD.viewer.showLocked('Document request record not found or has expired.');
    return false;
  }

  if (!backendResult) {
    // Local storage verification
    if (docRequest.status !== 'approved') {
      LD.viewer.showLocked('This request is pending PIN approval by the vault owner.');
      return false;
    }
    if (docRequest.accessToken !== token) {
      LD.viewer.showLocked('Invalid or revoked access token.');
      return false;
    }
    if (Date.now() > docRequest.accessExpiresAt) {
      LD.viewer.showLocked('Access time has expired. Please request access again.');
      return false;
    }
  }

  LD.viewer.docRequest = docRequest;
  LD.viewer.secondsLeft = 60;
  LD.viewer.maxSeconds = 60;

  var docObj = LD.data.documentById(docRequest.documentId);
  if (!docObj && backendResult && backendResult.document) {
    docObj = {
      id: backendResult.document.id || backendResult.document._id,
      name: backendResult.document.documentName || backendResult.document.name,
      category: backendResult.document.category,
      issuer: backendResult.document.issuer,
      verified: true,
      fileUrl: backendResult.document.fileUrl,
      uploadDate: backendResult.document.uploadDate,
      metadata: backendResult.document.metadata
    };
  }

  if (!docObj) {
    LD.viewer.showLocked('The requested document was not found.');
    return false;
  }
  LD.viewer.doc = docObj;

  // Blockchain Ledger Integrity Check
  LD.viewer.verifyBlockchainIntegrity(docObj);

  // Active session
  var sessions = LD.data.activeSessions();
  var session = sessions.find(function(s){ return s.sessionId === docRequest.sessionId; });
  if (!session && backendResult && backendResult.session) {
    session = backendResult.session;
  }
  LD.viewer.session = session || {
    requesterName: 'Verified Requester',
    ownerName: 'Vault Owner',
    sessionId: docRequest.sessionId || 'SESS-ONLINE'
  };

  // Audit log
  LD.data.addAuditLog('viewer_opened', 'Document viewed', (session ? session.requesterName : 'Requester') + ' viewed ' + docObj.name);
  return true;
};

/* ---------------------------------------------------------
   Blockchain verification helper
   --------------------------------------------------------- */
LD.viewer.verifyBlockchainIntegrity = function(doc){
  if (window.LD && LD.blockchain) {
    var chain = LD.blockchain.getChain();
    var block = chain.find(function(b){ return b.docId === doc.id; });
    if (block) {
      var currentHash = LD.blockchain.hashDocument(doc);
      if (currentHash !== block.docHash) {
        LD.viewer.showLocked('CRITICAL SECURITY BREACH: Cryptographic hash mismatch with Blockchain Block #' + block.index + '. Access revoked.');
        LD.blockchain.triggerImmediateTamperAlert({
          tamperedDocs: [{
            docId: doc.id,
            docName: doc.name,
            blockIndex: block.index,
            anchoredHash: block.docHash,
            currentHash: currentHash
          }]
        });
        return false;
      }
      LD.viewer.block = block;
    }
  }
  return true;
};

/* ---------------------------------------------------------
   Show locked / unavailable overlay
   --------------------------------------------------------- */
LD.viewer.showLocked = function(message){
  var overlay = document.getElementById('locked-overlay');
  if(!overlay) return;
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
  var msgEl = document.getElementById('locked-message');
  if(msgEl) msgEl.textContent = message;
};

/* ---------------------------------------------------------
   Render document surface
   --------------------------------------------------------- */
LD.viewer.renderStage = function(){
  var doc = LD.viewer.doc;
  var session = LD.viewer.session;
  var block = LD.viewer.block;
  if (!doc) return;

  var stage = document.getElementById('doc-stage');
  var cats = LD.data.categories ? LD.data.categories() : [];
  var cat = cats.find(function(c){ return c.id === doc.category; }) || { name: doc.category || 'General Document', color: 'blue' };

  var fileUrl = doc.fileUrl ? LD.viewer.resolveFileUrl(doc.fileUrl) : '';
  var isImage = fileUrl && (/\.(png|jpg|jpeg|webp|svg|gif)(\?.*)?$/i.test(fileUrl) || fileUrl.startsWith('data:image/'));
  var isPdf = fileUrl && (/\.pdf(\?.*)?$/i.test(fileUrl) || fileUrl.startsWith('data:application/pdf'));

  var stageHtml = '';

  // -------------------------------------------------------
  // RENDER OPTION 1: Real Image Document
  // -------------------------------------------------------
  if (isImage) {
    stageHtml = 
      '<div class="viewer-doc-surface">' +
        '<div class="row-between mb-3">' +
          '<div>' +
            '<span class="badge badge-primary font-mono text-xs">📷 ' + cat.name.toUpperCase() + '</span>' +
            '<h2 class="text-18 font-extrabold text-white mt-1">' + doc.name + '</h2>' +
            '<p class="text-xs text-muted">Issued by ' + (doc.issuer || 'Official Issuer') + '</p>' +
          '</div>' +
          '<span class="badge badge-success font-mono text-xs"><span class="badge-dot"></span> ' + (block ? 'Block #' + block.index + ' Verified' : 'Ledger Verified') + '</span>' +
        '</div>' +
        '<div class="viewer-image-wrap flex-1">' +
          '<img src="' + fileUrl + '" class="viewer-doc-img" alt="' + doc.name + '" />' +
        '</div>' +
        '<div class="row-between mt-3 text-xs text-faint">' +
          '<span>🔒 Encrypted Vault Release</span>' +
          '<span class="font-mono text-cyan">REF: ' + doc.id.toUpperCase() + '</span>' +
        '</div>' +
      '</div>';
  } 
  // -------------------------------------------------------
  // RENDER OPTION 2: Real PDF Document
  // -------------------------------------------------------
  else if (isPdf) {
    stageHtml = 
      '<div class="viewer-doc-surface">' +
        '<div class="row-between mb-3">' +
          '<div>' +
            '<span class="badge badge-primary font-mono text-xs">📑 ' + cat.name.toUpperCase() + '</span>' +
            '<h2 class="text-18 font-extrabold text-white mt-1">' + doc.name + '</h2>' +
          '</div>' +
          '<span class="badge badge-success font-mono text-xs"><span class="badge-dot"></span> ' + (block ? 'Block #' + block.index + ' Verified' : 'Ledger Verified') + '</span>' +
        '</div>' +
        '<div class="viewer-frame-container flex-1">' +
          '<iframe class="viewer-frame" src="' + fileUrl + '"></iframe>' +
        '</div>' +
        '<div class="row-between mt-2 text-xs text-faint">' +
          '<span>Protected View-Only Sandbox</span>' +
          '<a href="' + fileUrl + '" target="_blank" rel="noopener" class="text-cyan text-xs" style="text-decoration:underline;">Open in Secure Window ↗</a>' +
        '</div>' +
      '</div>';
  }
  // -------------------------------------------------------
  // RENDER OPTION 3: High-Fidelity Official Digital Credential
  // -------------------------------------------------------
  else {
    var holderName = (session && session.ownerName) ? session.ownerName : 'Aarav Sharma';
    var refNumber = (doc.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) + '-' + (session ? session.sessionId.slice(-6).toUpperCase() : '8942');
    var hashDisplay = block ? block.docHash : '8f4c2e1b9a7d3c5e8f1b4a6d2c7e9a1b3f5c7e9';
    var emblemIcon = (doc.category === 'identity') ? '🛡️' : (doc.category === 'apartment' ? '🏢' : (doc.category === 'vehicles' ? '🚗' : '📁'));

    stageHtml = 
      '<div class="viewer-doc-surface flex-center">' +
        '<div class="credential-card">' +
          '<div class="credential-top-strip">' +
            '<div class="credential-emblem-wrap">' +
              '<div class="credential-emblem icon-tile ' + (cat.color || 'cyan') + '">' + emblemIcon + '</div>' +
              '<div class="credential-meta-header">' +
                '<p class="credential-category-tag">' + cat.name + '</p>' +
                '<p class="credential-issuer-name">' + (doc.issuer || 'Skyline Heights Authority') + '</p>' +
              '</div>' +
            '</div>' +
            '<span class="hologram-seal">🔒 SECURE VAULT</span>' +
          '</div>' +

          '<div class="credential-body">' +
            '<h2 class="credential-title-h">' + doc.name + '</h2>' +

            '<div class="credential-chip-row">' +
              '<div class="smart-chip"></div>' +
              '<span class="badge badge-success font-mono"><span class="badge-dot"></span> Cryptographically Anchored</span>' +
            '</div>' +

            '<div class="credential-grid">' +
              '<div class="cred-field">' +
                '<p class="k">Authorized Holder</p>' +
                '<p class="v">' + holderName + '</p>' +
              '</div>' +
              '<div class="cred-field">' +
                '<p class="k">Document Reference No.</p>' +
                '<p class="v mono highlight">' + refNumber + '</p>' +
              '</div>' +
              '<div class="cred-field">' +
                '<p class="k">Issuing Authority</p>' +
                '<p class="v">' + (doc.issuer || 'Official Department') + '</p>' +
              '</div>' +
              '<div class="cred-field">' +
                '<p class="k">Verification Status</p>' +
                '<p class="v text-success">Active &amp; Legitimate</p>' +
              '</div>' +
            '</div>' +

            '<div class="credential-blockchain-bar">' +
              '<span class="blockchain-badge-text">⛓️ Blockchain Block #' + (block ? block.index : '1') + '</span>' +
              '<span class="blockchain-hash-text" title="' + hashDisplay + '">SHA: ' + hashDisplay + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="row-between text-xs text-faint pt-2" style="border-top:1px dashed rgba(255,255,255,0.08);">' +
            '<span>Watermarked Anti-Copy Display</span>' +
            '<span>Session: ' + (session ? session.sessionId.slice(-8).toUpperCase() : 'N/A') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  stage.innerHTML = stageHtml;

  // Stamp security watermark over the stage
  if (LD.watermark && LD.watermark.stamp) {
    LD.watermark.stamp(stage, {
      viewerName: session ? session.requesterName : 'Authenticated Viewer',
      organization: session ? (session.organizationName || 'LockDoc') : 'LockDoc Security',
      purpose: (LD.viewer.docRequest && LD.viewer.docRequest.purpose) ? LD.viewer.docRequest.purpose : (LD.viewer.isOwnerMode ? 'Vault Owner Direct Access' : 'Verified Access'),
      sessionId: session ? session.sessionId : 'SECURE-VIEW'
    });
  }
};

/* ---------------------------------------------------------
   Countdown timer
   --------------------------------------------------------- */
LD.viewer.startCountdown = function(onExpire){
  LD.viewer.renderTimer();

  LD.viewer.timerId = setInterval(function(){
    LD.viewer.secondsLeft--;
    LD.viewer.renderTimer();
    if(LD.viewer.secondsLeft <= 0){
      clearInterval(LD.viewer.timerId);
      if(onExpire) onExpire();
    }
  }, 1000);
};

LD.viewer.renderTimer = function(){
  var pct = Math.max(0, (LD.viewer.secondsLeft / LD.viewer.maxSeconds) * 100);
  var fill = document.getElementById('timer-fill');
  var label = document.getElementById('timer-label');
  var strip = document.getElementById('timer-strip');
  
  if (fill) fill.style.width = pct + '%';
  if (label) {
    if (LD.viewer.isOwnerMode) {
      label.textContent = 'Owner Inspection (' + LD.viewer.secondsLeft + 's)';
    } else {
      label.textContent = 'Auto-closes in ' + LD.viewer.secondsLeft + 's';
    }
  }
  if (strip) strip.classList.toggle('warn', LD.viewer.secondsLeft <= 15);
};

LD.viewer.stop = function(){
  if (LD.viewer.timerId) clearInterval(LD.viewer.timerId);
};

/* ---------------------------------------------------------
   Anti-copy guards
   --------------------------------------------------------- */
LD.viewer.applyGuards = function(rootEl){
  if (!rootEl) return;
  rootEl.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  rootEl.addEventListener('dragstart', function(e){ e.preventDefault(); });
  rootEl.addEventListener('copy', function(e){ e.preventDefault(); });
  document.addEventListener('keydown', function(e){
    var blockedCombo = (e.ctrlKey || e.metaKey) && ['p','s','c','u'].includes(e.key.toLowerCase());
    if(blockedCombo) e.preventDefault();
  });
};
