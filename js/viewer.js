/* =========================================================
   LockDoc — viewer.js
   Direct Clean Original Document Surface
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
  return base.replace(/\/+$/, '') + '/' + fileUrl.replace(/^\/+/, '');
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
              verified: true,
              fileUrl: found.dataUrl || found.fileUrl,
              uploadDate: found.uploadDate,
              metadata: found.metadata
            };
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
      requesterName: ownerName,
      ownerName: ownerName,
      purpose: 'Direct Vault Inspection'
    };
    LD.viewer.secondsLeft = 180;
    LD.viewer.maxSeconds = 180;
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

  // Validate with backend (No JWT required — the requestId + token are the credential)
  if (LD.api && LD.api.validateDocumentAccess) {
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
      fileUrl: backendResult.document.dataUrl || backendResult.document.fileUrl,
      uploadDate: backendResult.document.uploadDate,
      metadata: backendResult.document.metadata
    };
  }

  if (!docObj) {
    LD.viewer.showLocked('The requested document was not found.');
    return false;
  }
  LD.viewer.doc = docObj;

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
   Render clean document directly on stage
   --------------------------------------------------------- */
LD.viewer.renderStage = function(){
  var doc = LD.viewer.doc;
  if (!doc) return;

  var stage = document.getElementById('doc-stage');
  var fileUrl = doc.fileUrl ? LD.viewer.resolveFileUrl(doc.fileUrl) : '';
  var docType = ((doc.documentType || doc.category) || '').toUpperCase();
  var mimeType = (doc.metadata && doc.metadata.mimeType) || '';

  // Update direct link button
  var directBtn = document.getElementById('viewer-direct-link');
  if (directBtn && fileUrl) {
    directBtn.href = fileUrl;
    directBtn.style.display = 'inline-block';
  }

  var isImage = (fileUrl && (/\.(png|jpg|jpeg|webp|svg|gif)(\?.*)?$/i.test(fileUrl) || fileUrl.startsWith('data:image/'))) ||
    ['PNG','JPG','JPEG','WEBP','GIF','SVG'].includes(docType) ||
    mimeType.startsWith('image/');

  // 1. Image Document
  if (isImage && fileUrl) {
    stage.innerHTML =
      '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#090D16;padding:20px;overflow:auto;">' +
        '<img src="' + fileUrl + '" alt="' + doc.name + '" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 16px 48px rgba(0,0,0,0.8);" />' +
      '</div>';
    return;
  }

  // 2. PDF or Streaming Document
  if (fileUrl) {
    stage.innerHTML =
      '<iframe src="' + fileUrl + '#toolbar=1&navpanes=0" style="width:100%;height:100%;border:none;background:#111827;" title="' + doc.name + '"></iframe>';
    return;
  }

  stage.innerHTML =
    '<div style="text-align:center;padding:60px 20px;margin:auto;">' +
      '<div style="font-size:48px;margin-bottom:12px;">⚠️</div>' +
      '<p style="color:#F9FAFB;font-weight:700;">Document file content unavailable.</p>' +
    '</div>';
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
  var badgeText = document.getElementById('mode-badge-text');
  var badge = document.getElementById('mode-badge');
  if (badgeText) {
    badgeText.textContent = '⏱ ' + LD.viewer.secondsLeft + 's';
  }
  if (badge && LD.viewer.secondsLeft <= 15) {
    badge.className = 'badge badge-danger font-mono text-xs';
  }
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
  document.addEventListener('keydown', function(e){
    var blockedCombo = (e.ctrlKey || e.metaKey) && ['p','s','c','u'].includes(e.key.toLowerCase());
    if(blockedCombo) e.preventDefault();
  });
};
