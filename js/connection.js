/* =========================================================
   LockDoc — connection.js
   Handles connection requests and active sessions.

   Flow:
   1. Requester scans QR → connect.html creates a connection request
   2. Owner sees request in approval.html → Accepts/Declines with PIN
   3. On Accept → activeSession created
   4. Requester sees categories (no doc names) → requests specific doc
   5. Owner approves doc request with PIN → temporary token granted
   6. Requester views doc in secure viewer (60s, watermark)
   ========================================================= */

window.LD = window.LD || {};

LD.conn = {};

/* ---------------------------------------------------------
   Get parameters from URL (backward compat)
   --------------------------------------------------------- */
LD.conn.getTokenFromUrl = function(){
  var params = new URLSearchParams(window.location.search);
  return params.get('token') || params.get('lockdocId');
};

LD.conn.getSessionIdFromUrl = function(){
  var params = new URLSearchParams(window.location.search);
  return params.get('session');
};

/* ---------------------------------------------------------
   Create a connection request from scanned QR data
   --------------------------------------------------------- */
LD.conn.createConnectionRequest = async function(ownerLockdocId, ownerName, ownerRole, requesterName, organizationName, purpose){
  var request = {
    requestId: LD.uid('conn'),
    ownerId: ownerLockdocId,
    ownerName: ownerName,
    ownerRole: ownerRole || 'holder',
    requesterId: LD.data.currentUser() ? LD.data.currentUser().lockdocId || LD.data.currentUser().id : 'unknown',
    requesterName: requesterName,
    requesterRole: LD.data.currentUser() ? LD.data.currentUser().role || 'verifier' : 'verifier',
    organizationName: organizationName || '',
    purpose: purpose || '',
    createdAt: new Date().toISOString(),
    status: 'pending'  // pending | accepted | declined
  };

  // Try to persist the connection request on the backend if the user is authenticated.
  if(LD.data.isJwtAuthenticated()){
    try {
      const payload = {
        lockdocId: ownerLockdocId,
        ownerName: ownerName,
        ownerRole: ownerRole,
        requesterName: requesterName,
        requesterRole: request.requesterRole,
        organizationName: organizationName,
        purpose: purpose
      };
      const result = await LD.api.createConnectionRequest(payload);
      if(result && result.success && result.request){
        var backendRequest = result.request;
        backendRequest.requestId = backendRequest._id || backendRequest.requestId || backendRequest.id;
        backendRequest.ownerId = backendRequest.ownerId || ownerLockdocId;
        backendRequest.ownerName = ownerName;
        backendRequest.requesterName = requesterName;
        backendRequest.requesterRole = request.requesterRole;
        backendRequest.organizationName = organizationName || '';
        backendRequest.purpose = purpose || '';
        request = backendRequest;
        LD.data.addConnectionRequest(request);
        return request;
      }
    } catch (err) {
      console.error('Connection request backend sync failed:', err);
    }
  }

  LD.data.addConnectionRequest(request);

  // Audit log
  LD.data.addAuditLog('connection_requested', requesterName + ' requested to connect', 'To: ' + ownerName);

  return request;
};

/* ---------------------------------------------------------
   Accept a connection request — creates an active session
   --------------------------------------------------------- */
LD.conn.acceptRequest = function(requestId, sessionId){
  var request = LD.data.getConnectionRequest(requestId);
  if(!request) return null;

  // Update request status
  LD.data.updateConnectionRequest(requestId, {
    status: 'accepted',
    sessionId: sessionId || request.sessionId || LD.uid('sess'),
    decidedAt: new Date().toISOString()
  });

  // Create active session (expires in 24 hours by default)
  var session = {
    sessionId: sessionId || request.sessionId || LD.uid('sess'),
    ownerId: request.ownerId,
    ownerName: request.ownerName,
    requesterId: request.requesterId,
    requesterName: request.requesterName,
    requesterRole: request.requesterRole,
    organizationName: request.organizationName,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'active'
  };

  LD.data.addActiveSession(session);

  // Audit log
  LD.data.addAuditLog('connection_accepted', 'Connection accepted', request.requesterName + ' connected to ' + request.ownerName);

  return session;
};

/* ---------------------------------------------------------
   Decline a connection request
   --------------------------------------------------------- */
LD.conn.declineRequest = function(requestId){
  LD.data.updateConnectionRequest(requestId, {
    status: 'declined',
    decidedAt: new Date().toISOString()
  });

  var request = LD.data.getConnectionRequest(requestId);
  LD.data.addAuditLog('connection_declined', 'Connection declined', request ? request.requesterName : 'Unknown');
};

/* ---------------------------------------------------------
   Get active sessions for the current user (as owner or requester)
   --------------------------------------------------------- */
LD.conn.getMyActiveSessions = function(){
  var currentUser = LD.data.currentUser();
  if(!currentUser) return [];
  var uid = currentUser.lockdocId || currentUser.id;
  return LD.data.activeSessions().filter(function(s){
    return (s.ownerId === uid || s.requesterId === uid) && s.status === 'active';
  });
};

/* ---------------------------------------------------------
   Check if there's an active session between two parties
   --------------------------------------------------------- */
LD.conn.hasActiveSession = function(ownerId, requesterId){
  return LD.data.activeSessions().some(function(s){
    return s.ownerId === ownerId && s.requesterId === requesterId && s.status === 'active';
  });
};

