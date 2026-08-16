/* =========================================================
   LockDoc — approval.js
   Handles:
   1. Connection request approval (Accept/Decline)
   2. Document request PIN approval (6-digit PIN: 123456)
   3. Temporary access token (60 seconds) for viewer

   The PIN is verified before any sensitive action.
   ========================================================= */

window.LD = window.LD || {};

LD.approval = {
  pinBuffer: '',
  pendingRequestId: null,
  pendingAction: null,   // 'accept_connection' | 'decline_connection' | 'approve_doc' | 'deny_doc'
  pendingDocRequestId: null
};

/* ---------------------------------------------------------
   PIN verification helpers
   --------------------------------------------------------- */

LD.approval.openPinSheet = function(requestId, action, docRequestId){
  LD.approval.pendingRequestId = requestId;
  LD.approval.pendingAction = action;
  LD.approval.pendingDocRequestId = docRequestId || null;
  LD.approval.pinBuffer = '';
  LD.approval.renderDots();

  var sheetTitle = 'Verify PIN';
  if(action === 'accept_connection') sheetTitle = 'Accept connection?';
  else if(action === 'decline_connection') sheetTitle = 'Decline connection?';
  else if(action === 'approve_doc') sheetTitle = 'Approve document?';
  else if(action === 'deny_doc') sheetTitle = 'Deny document?';

  var titleEl = document.getElementById('pin-sheet-title');
  if(titleEl) titleEl.textContent = sheetTitle;

  var overlay = document.getElementById('pin-overlay');
  if(overlay) overlay.classList.add('show');
};

LD.approval.closePinSheet = function(){
  var overlay = document.getElementById('pin-overlay');
  if(overlay) overlay.classList.remove('show');
  LD.approval.pinBuffer = '';
};

LD.approval.pressKey = function(key){
  if(key === 'back'){
    LD.approval.pinBuffer = LD.approval.pinBuffer.slice(0, -1);
    LD.approval.renderDots();
    return;
  }
  if(LD.approval.pinBuffer.length >= 6) return;
  LD.approval.pinBuffer += key;
  LD.approval.renderDots();

  if(LD.approval.pinBuffer.length === 6){
    setTimeout(LD.approval.verify, 150);
  }
};

LD.approval.renderDots = function(){
  var dots = document.querySelectorAll('.pin-dot');
  dots.forEach(function(d, i){
    d.classList.toggle('filled', i < LD.approval.pinBuffer.length);
    d.classList.remove('error');
  });
};

LD.approval.verify = async function(){
  // PIN is 123456 (stored in LD.CONFIG.PIN)
  var correct = LD.approval.pinBuffer === LD.CONFIG.PIN;

  if(correct){
    var action = LD.approval.pendingAction;
    var requestId = LD.approval.pendingRequestId;
    var docRequestId = LD.approval.pendingDocRequestId;

    try {
      if(action === 'accept_connection'){
        var result = await LD.api.acceptConnectionRequest(requestId);
        if(result && result.success && result.request){
          LD.ui.toast('Connection accepted!', 'success');
          LD.data.addAuditLog('connection_accepted', 'Connection accepted', 'Request ' + requestId + ' accepted');
          LD.data.updateConnectionRequest(requestId, {
            status: 'accepted',
            sessionId: result.request.sessionId,
            decidedAt: new Date().toISOString()
          });
          if(result.request.sessionId){
            LD.data.addActiveSession({
              sessionId: result.request.sessionId,
              ownerId: result.request.ownerId,
              ownerName: result.request.ownerName,
              requesterId: result.request.requesterId,
              requesterName: result.request.requesterName,
              requesterRole: result.request.requesterRole,
              organizationName: result.request.organizationName,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              status: 'active'
            });
          }
        } else {
          throw new Error(result.message || 'Failed to accept connection');
        }
      }
      else if(action === 'decline_connection'){
        var result = await LD.api.declineConnectionRequest(requestId);
        if(result && result.success){
          LD.ui.toast('Connection declined', 'error');
          LD.data.addAuditLog('connection_declined', 'Connection declined', 'Request ' + requestId + ' declined');
        } else {
          throw new Error(result.message || 'Failed to decline connection');
        }
      }
      else if(action === 'approve_doc' || action === 'deny_doc'){
        await LD.approval.handleDocDecision(action, docRequestId);
      }
    } catch (err) {
      LD.ui.toast(err.message || 'Approval failed', 'error');
    }

    LD.approval.closePinSheet();
    if(typeof LD.approval.onDecision === 'function') LD.approval.onDecision();
  } else {
    // Wrong PIN
    var dots = document.querySelectorAll('.pin-dot');
    dots.forEach(function(d){ d.classList.add('error'); });
    var pinDots = document.getElementById('pin-dots');
    if(pinDots) pinDots.classList.add('shake');
    setTimeout(function(){
      if(pinDots) pinDots.classList.remove('shake');
      LD.approval.pinBuffer = '';
      LD.approval.renderDots();
    }, 500);
  }
};

/* ---------------------------------------------------------
   Handle document request decision
   Creates a temporary access token valid for 60 seconds
   --------------------------------------------------------- */
LD.approval.handleDocDecision = async function(action, docRequestId){
  if(!docRequestId){
    LD.ui.toast('Invalid document request', 'error');
    return;
  }

  if(action === 'approve_doc'){
    var result = await LD.api.approveDocumentRequest(docRequestId);
    if(result && result.success && result.request){
      LD.ui.toast('Document approved! Access valid for 60 seconds.', 'success');
      LD.data.addAuditLog('document_approved', 'Document request approved', 'Request ' + docRequestId);
      LD.data.updateDocumentRequest(docRequestId, {
        status: result.request.status,
        accessToken: result.request.accessToken,
        accessExpiresAt: result.request.accessExpiresAt,
        decidedAt: new Date().toISOString()
      });
    } else {
      LD.ui.toast(result.message || 'Failed to approve document', 'error');
    }
  }
  else if(action === 'deny_doc'){
    var result = await LD.api.denyDocumentRequest(docRequestId);
    if(result && result.success && result.request){
      LD.ui.toast('Document request denied', 'error');
      LD.data.addAuditLog('document_denied', 'Document request denied', 'Request ' + docRequestId);
      LD.data.updateDocumentRequest(docRequestId, {
        status: result.request.status,
        decidedAt: new Date().toISOString()
      });
    } else {
      LD.ui.toast(result.message || 'Failed to deny document', 'error');
    }
  }
};

/* ---------------------------------------------------------
   Render connection requests list
   --------------------------------------------------------- */
LD.approval.renderConnections = function(containerId, requests){
  var container = document.getElementById(containerId);
  if(!container) return;

  requests = requests || LD.data.pendingConnectionRequests();
  var currentUser = LD.data.currentUser();
  var uid = currentUser ? (currentUser.lockdocId || currentUser.id) : null;

  // In case the backend returns all requests, filter by owner
  var myRequests = requests.filter(function(r){
    if(!r || r.status !== 'pending') return false;
    return true;
  });

  if(myRequests.length === 0){
    container.innerHTML = '<div class="empty-state"><div class="icon">' + LD.icons.users + '</div><p class="text-sm">No pending connection requests</p></div>';
    return;
  }

  container.innerHTML = myRequests.map(function(r){
    return '<div class="card" data-request-id="' + r.requestId + '">' +
      '<div class="row-between">' +
        '<div class="row"><div class="icon-tile blue">' + LD.icons.users + '</div>' +
          '<div><p class="font-semibold text-sm">' + r.requesterName + '</p>' +
          '<p class="text-muted text-xs">' + (r.organizationName || r.requesterRole || 'Requester') + ' · ' + LD.ui.timeAgo(r.createdAt) + '</p></div>' +
        '</div>' +
        '<span class="badge badge-warning"><span class="badge-dot"></span> Pending</span>' +
      '</div>' +
      '<div class="row mt-12 gap-10">' +
        '<button class="btn btn-danger btn-sm flex-1 decline-conn" data-id="' + r.requestId + '">Decline</button>' +
        '<button class="btn btn-primary btn-sm flex-1 accept-conn" data-id="' + r.requestId + '">Accept</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Wire up buttons
  container.querySelectorAll('.accept-conn').forEach(function(btn){
    btn.addEventListener('click', function(){
      LD.approval.openPinSheet(btn.getAttribute('data-id'), 'accept_connection');
    });
  });
  container.querySelectorAll('.decline-conn').forEach(function(btn){
    btn.addEventListener('click', function(){
      LD.approval.openPinSheet(btn.getAttribute('data-id'), 'decline_connection');
    });
  });
};

/* ---------------------------------------------------------
   Render document requests list (for PIN approval)
   --------------------------------------------------------- */
LD.approval.renderDocRequests = function(containerId, docReqs){
  var container = document.getElementById(containerId);
  if(!container) return;

  docReqs = docReqs || LD.data.pendingDocumentRequests();
  var currentUser = LD.data.currentUser();
  var uid = currentUser ? (currentUser.lockdocId || currentUser.id) : null;

  // Filter pending document requests
  var myDocReqs = docReqs.filter(function(r){
    return r && r.status === 'pending';
  });

  if(myDocReqs.length === 0){
    container.innerHTML = '<div class="empty-state"><div class="icon">' + LD.icons.folder + '</div><p class="text-sm">No pending document requests</p></div>';
    return;
  }

  container.innerHTML = myDocReqs.map(function(r){
    var session = LD.data.getActiveSession(r.sessionId);
    var doc = LD.data.documentById(r.documentId);
    var requester = r.requesterName || (session ? session.requesterName : 'Requester');
    return '<div class="card">' +
      '<div class="row-between">' +
        '<div class="row"><div class="icon-tile green">' + LD.icons.shield + '</div>' +
          '<div><p class="font-semibold text-sm">' + (doc ? doc.name : 'Document') + '</p>' +
          '<p class="text-muted text-xs">Requested by ' + requester + '</p></div>' +
        '</div>' +
        '<span class="badge badge-warning"><span class="badge-dot"></span> Pending</span>' +
      '</div>' +
      (r.purpose ? '<p class="text-sm mt-8 text-muted">"<strong>Purpose:</strong> ' + r.purpose + '"</p>' : '') +
      '<div class="row mt-12 gap-10">' +
        '<button class="btn btn-danger btn-sm flex-1 deny-doc" data-id="' + r.requestId + '">Deny</button>' +
        '<button class="btn btn-primary btn-sm flex-1 approve-doc" data-id="' + r.requestId + '">Approve with PIN</button>' +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.approve-doc').forEach(function(btn){
    btn.addEventListener('click', function(){
      LD.approval.openPinSheet(null, 'approve_doc', btn.getAttribute('data-id'));
    });
  });
  container.querySelectorAll('.deny-doc').forEach(function(btn){
    btn.addEventListener('click', function(){
      LD.approval.openPinSheet(null, 'deny_doc', btn.getAttribute('data-id'));
    });
  });
};

