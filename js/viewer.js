/* =========================================================
   LockDoc — viewer.js
   Drives viewer.html: validates the document request with
   temporary access token, renders documents view-only with
   a watermark, and runs a 60-second countdown that
   force-closes the session when it hits zero.

   Access is granted only if:
   - document request status === 'approved'
   - access token is valid (not expired, within 60s window)
   ========================================================= */

window.LD = window.LD || {};

LD.viewer = {
  docRequest: null,
  doc: null,
  session: null,
  secondsLeft: 60,
  timerId: null
};

/* ---------------------------------------------------------
   Initialize viewer by validating access token from URL
   --------------------------------------------------------- */
LD.viewer.init = async function(){
  var params = new URLSearchParams(window.location.search);
  var requestId = params.get('requestId');
  var token = params.get('token');

  if(!requestId || !token){
    LD.viewer.showLocked('Missing access parameters. Please request access again.');
    return false;
  }

  var docRequest = LD.data.getDocumentRequest(requestId);
  var backendResult = null;

  if(LD.data.isJwtAuthenticated()){
    try {
      const response = await LD.api.validateDocumentAccess(requestId, token);
      if(response && response.success && response.result){
        backendResult = response.result;
      }
    } catch (err) {
      console.error('Backend access validation failed:', err);
    }
  }

  if(backendResult){
    docRequest = backendResult.request;
    docRequest.requestId = docRequest._id || docRequest.requestId || docRequest.id;
    LD.data.addDocumentRequest(docRequest);
  }

  if(!docRequest){
    LD.viewer.showLocked('Document request not found.');
    return false;
  }

  if(!backendResult){
    // Legacy local validation
    if(docRequest.status !== 'approved'){
      LD.viewer.showLocked('This request has not been approved yet.');
      return false;
    }
    if(docRequest.accessToken !== token){
      LD.viewer.showLocked('Invalid access token.');
      return false;
    }
    if(Date.now() > docRequest.accessExpiresAt){
      LD.viewer.showLocked('Access has expired. Please request again.');
      return false;
    }
  }

  LD.viewer.docRequest = docRequest;

  // Find the document from local cache or backend result
  var doc = LD.data.documentById(docRequest.documentId);
  if(!doc && backendResult && backendResult.document){
    doc = {
      id: backendResult.document.id,
      name: backendResult.document.documentName,
      category: backendResult.document.category,
      issuer: backendResult.document.issuer,
      verified: true,
      fileUrl: backendResult.document.fileUrl,
      uploadDate: backendResult.document.uploadDate,
      metadata: backendResult.document.metadata
    };
  }
  if(!doc){
    LD.viewer.showLocked('Document not found.');
    return false;
  }
  LD.viewer.doc = doc;

  // Find the active session for requester info or use backend session data
  var sessions = LD.data.activeSessions();
  var session = sessions.find(function(s){ return s.sessionId === docRequest.sessionId; });
  if(!session && backendResult && backendResult.session){
    session = backendResult.session;
  }
  LD.viewer.session = session;

  // Audit log
  LD.data.addAuditLog('viewer_opened', 'Document viewed', (session ? session.requesterName : 'Someone') + ' viewed ' + doc.name);

  return true;
};

/* ---------------------------------------------------------
   Show locked/unavailable overlay
   --------------------------------------------------------- */
LD.viewer.showLocked = function(message){
  var overlay = document.getElementById('locked-overlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  var msgEl = document.getElementById('locked-message');
  if(msgEl) msgEl.textContent = message;
};

/* ---------------------------------------------------------
   Render the document on the stage
   --------------------------------------------------------- */
LD.viewer.renderStage = function(){
  var doc = LD.viewer.doc;
  var session = LD.viewer.session;
  if(!doc) return;

  var stage = document.getElementById('doc-stage');
  var cats = LD.data.categories();
  var cat = cats.find(function(c){ return c.id === doc.category; }) || { name: 'Document' };

  stage.innerHTML =
    '<div class="viewer-doc-surface">' +
      '<p class="doc-heading">' + cat.name + ' · Issued by ' + doc.issuer + '</p>' +
      '<h2 class="doc-title">' + doc.name + '</h2>' +
      '<div class="doc-field"><p class="k">Document holder</p><p class="v">' + (session ? session.ownerName : 'Holder') + '</p></div>' +
      '<div class="doc-field"><p class="k">Status</p><p class="v text-success">Verified &amp; active</p></div>' +
      '<div class="doc-field"><p class="k">Reference ID</p><p class="v letter-spacing-sm">' + doc.id.toUpperCase() + '-' + (session ? session.sessionId.slice(-6).toUpperCase() : 'XXXX') + '</p></div>' +
      '<div class="flex-1"></div>' +
      '<p class="text-xs text-faint">This is a view-only preview. Downloading, printing and screenshots are disabled within the app.</p>' +
    '</div>';

  // Stamp watermark with requester info
  if(LD.watermark && LD.watermark.stamp){
    LD.watermark.stamp(stage, {
      viewerName: session ? session.requesterName : 'Viewer',
      organization: session ? session.organizationName : '',
      purpose: LD.viewer.docRequest ? LD.viewer.docRequest.purpose : '',
      sessionId: session ? session.sessionId : 'N/A'
    });
  }
};

/* ---------------------------------------------------------
   60-second countdown — auto-closes the viewer at zero
   --------------------------------------------------------- */
LD.viewer.startCountdown = function(onExpire){
  LD.viewer.secondsLeft = 60;
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
  var pct = Math.max(0, (LD.viewer.secondsLeft / 60) * 100);
  var fill = document.getElementById('timer-fill');
  var label = document.getElementById('timer-label');
  var strip = document.getElementById('timer-strip');
  if(fill) fill.style.width = pct + '%';
  if(label) label.textContent = 'Closes in ' + LD.viewer.secondsLeft + 's';
  if(strip) strip.classList.toggle('warn', LD.viewer.secondsLeft <= 10);
};

LD.viewer.stop = function(){
  if(LD.viewer.timerId) clearInterval(LD.viewer.timerId);
};

/* ---------------------------------------------------------
   Basic anti-copy affordances (deterrent, not bulletproof)
   --------------------------------------------------------- */
LD.viewer.applyGuards = function(rootEl){
  rootEl.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  rootEl.addEventListener('dragstart', function(e){ e.preventDefault(); });
  rootEl.addEventListener('copy', function(e){ e.preventDefault(); });
  document.addEventListener('keydown', function(e){
    var blockedCombo = (e.ctrlKey || e.metaKey) && ['p','s','c','u'].includes(e.key.toLowerCase());
    if(blockedCombo) e.preventDefault();
  });
};

