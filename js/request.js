/* =========================================================
   LockDoc — request.js
   Drives request.html: pick which documents to ask for, submit
   the request, then poll localStorage for the owner's decision.
   ========================================================= */

LD.request = {
  pollTimer: null,
  pendingDocRequestIds: []
};

LD.request.selectedIds = new Set();

LD.request.toggle = function(docId){
  if(LD.request.selectedIds.has(docId)) LD.request.selectedIds.delete(docId);
  else LD.request.selectedIds.add(docId);
};

LD.request.submit = async function(sessionId){
  var session = LD.data.getActiveSession(sessionId);
  if(!session) return [];

  var selectedIds = Array.from(LD.request.selectedIds);
  if(!selectedIds.length) return [];

  LD.request.pendingDocRequestIds = [];
  var purpose = session.purpose || 'Verification';
  var now = new Date().toISOString();
  var requests = [];

  if(LD.data.isJwtAuthenticated()){
    for(var i = 0; i < selectedIds.length; i++){
      var docId = selectedIds[i];
      try {
        var response = await LD.api.createDocumentRequest({ sessionId: sessionId, documentId: docId, purpose: purpose });
        if(response && response.success && response.request){
          var docRequest = response.request;
          docRequest.requestId = docRequest._id || docRequest.requestId || docRequest.id;
          LD.data.addDocumentRequest(docRequest);
          LD.request.pendingDocRequestIds.push(docRequest.requestId);
          requests.push(docRequest);
        } else {
          console.error('Document request failed:', response && response.message);
        }
      } catch (err) {
        console.error('Document request API error:', err);
      }
    }
  } else {
    requests = selectedIds.map(function(docId){
      var docRequest = {
        requestId: LD.uid('docreq'),
        requesterId: session.requesterId,
        ownerId: session.ownerId,
        documentId: docId,
        sessionId: sessionId,
        purpose: purpose,
        status: 'pending',
        accessToken: null,
        accessExpiresAt: null,
        createdAt: now
      };
      LD.data.addDocumentRequest(docRequest);
      LD.request.pendingDocRequestIds.push(docRequest.requestId);
      return docRequest;
    });
  }

  if(requests.length){
    LD.data.addAuditLog('document_requested', 'Document requested', purpose + ' - ' + requests.map(function(r){ return r.documentId; }).join(', '));
  }

  LD.request.selectedIds.clear();
  return requests;
};

/* Polls the session's document requests every second so the requester's
   screen updates the moment the owner approves/denies a document. */
LD.request.pollForDecision = function(sessionId, onChange){
  if(LD.request.pollTimer) clearInterval(LD.request.pollTimer);

  function checkLocal(){
    var requests = LD.data.documentRequests().filter(function(r){ return r.sessionId === sessionId; });
    if(!requests.length) return null;
    return requests.find(function(r){ return r.status === 'approved' || r.status === 'denied' || r.status === 'expired'; });
  }

  LD.request.pollTimer = setInterval(async function(){
    if(LD.data.isJwtAuthenticated()){
      for(var i = 0; i < LD.request.pendingDocRequestIds.length; i++){
        var requestId = LD.request.pendingDocRequestIds[i];
        try {
          var response = await LD.api.getDocumentRequest(requestId);
          if(response && response.success && response.request){
            var req = response.request;
            req.requestId = req._id || req.requestId || req.id;
            LD.data.addDocumentRequest(req);
            if(req.status === 'approved' || req.status === 'denied' || req.status === 'expired'){
              clearInterval(LD.request.pollTimer);
              onChange(req);
              return;
            }
          }
        } catch (err) {
          console.error('Polling document request failed:', err);
        }
      }
    } else {
      var decided = checkLocal();
      if(decided){
        clearInterval(LD.request.pollTimer);
        onChange(decided);
      }
    }
  }, 1000);
};

LD.request.stopPolling = function(){
  if(LD.request.pollTimer) clearInterval(LD.request.pollTimer);
};
