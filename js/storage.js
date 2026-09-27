/* =========================================================
   LockDoc — storage.js
   Single source of truth for all localStorage-backed data.
   Every other module reads/writes through LD.store.*
   ========================================================= */

window.LD = window.LD || {};

LD.KEYS = {
  USER: 'lockdoc_user',
  QR_TOKEN: 'lockdoc_qr_token',
  DOCUMENTS: 'lockdoc_documents',
  CATEGORIES: 'lockdoc_categories',
  SESSIONS: 'lockdoc_sessions',      // connection + access requests
  ACTIVITY: 'lockdoc_activity',      // activity log for dashboard
  SETTINGS: 'lockdoc_settings',
  OTP: 'lockdoc_otp',                 // OTP verification data
  // NEW: Core workflow data model keys
  CURRENT_USER: 'lockdoc_currentUser',
  CONNECTION_REQUESTS: 'lockdoc_connectionRequests',
  ACTIVE_SESSIONS: 'lockdoc_activeSessions',
  DOCUMENT_REQUESTS: 'lockdoc_documentRequests',
  AUDIT_LOGS: 'lockdoc_auditLogs',
  CATEGORY_QR_TOKENS: 'lockdoc_categoryQrTokens'   // permanent, per-folder QR tokens
};

LD.CONFIG = {
  APP_NAME: 'LockDoc',
  PIN: '123456',              // demo verification PIN
  VIEW_SESSION_SECONDS: 60,   // auto-close timer in viewer
  ACCESS_VALID_MINUTES: 10    // how long an approved session stays usable
};

LD.store = {
  get(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){
      console.error('LD.store.get failed for', key, e);
      return fallback;
    }
  },
  set(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(e){
      console.error('LD.store.set failed for', key, e);
      return false;
    }
  },
  update(key, updater, fallback){
    const current = LD.store.get(key, fallback);
    const next = updater(current);
    LD.store.set(key, next);
    return next;
  }
};

LD.uid = function(prefix){
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36).slice(-5);
  return (prefix ? prefix + '_' : '') + time + rand;
};

/* ---------------------------------------------------------
   Seed data — created once on first launch
   --------------------------------------------------------- */
// riskLevel drives how strongly the owner must verify before approving
// access to this folder: 'low' -> app approval, 'medium' -> fingerprint,
// 'high' -> face verification. See LD.qr.renderForCategory / verify.js.
// Urban Apartment & City Entrance Security Checkpoint Data
LD.SEED_CATEGORIES = [
  { id: 'identity',    name: 'Govt ID & Resident Proof',  icon: 'id',       color: 'blue',  riskLevel: 'high'   },
  { id: 'apartment',   name: 'Apartment & Tenancy Deeds', icon: 'home2',    color: 'cyan',  riskLevel: 'high'   },
  { id: 'vehicles',    name: 'Vehicle & RFID Gate Passes',icon: 'shield',   color: 'green', riskLevel: 'medium' },
  { id: 'visitors',    name: 'Visitor & Staff Passes',    icon: 'briefcase',color: 'amber', riskLevel: 'medium' },
  { id: 'clearance',   name: 'Move-In / Gate Clearance',  icon: 'folder',   color: 'blue',  riskLevel: 'low'    },
  { id: 'emergency',   name: 'Emergency & Health Cards',  icon: 'shield',   color: 'red',   riskLevel: 'high'   }
];

LD.SEED_DOCUMENTS = [
  { id: 'doc_aadhaar',    name: 'National Aadhaar Card (Resident ID)',  category: 'identity',  issuer: 'UIDAI / Govt. of India',        verified: true },
  { id: 'doc_dl',         name: 'Driver License & Address Proof',       category: 'identity',  issuer: 'State Motor Transport Dept.',    verified: true },
  { id: 'doc_lease',      name: 'Registered Flat Lease Deed (Unit 402)',category: 'apartment', issuer: 'Sub-Registrar & Flat Owner',   verified: true },
  { id: 'doc_noc',        name: 'RWA Maintenance Clearance NOC',        category: 'apartment', issuer: 'Skyline Heights RWA Society',   verified: true },
  { id: 'doc_parking',    name: 'Tower B Basement Parking Tag & RC',    category: 'vehicles',  issuer: 'Apartment Security Division',   verified: true },
  { id: 'doc_guest',      name: 'Pre-Approved Visitor Entry Pass',      category: 'visitors',  issuer: 'Main Gate Checkpoint Alpha',     verified: true },
  { id: 'doc_contractor', name: 'Contractor & Interior Work Permit',    category: 'visitors',  issuer: 'Facility Management Desk',       verified: true },
  { id: 'doc_movein',     name: 'Heavy Vehicle Move-In Gate Pass',      category: 'clearance', issuer: 'Society Estate Office',          verified: true },
  { id: 'doc_emergency',  name: 'Resident Emergency Contact & Medical', category: 'emergency', issuer: 'City Health Authority',         verified: true }
];

LD.init = function(){
  // Automatic migration to Apartment Checkpoint & Blockchain concept
  var SEED_VERSION = 'v3_apartment_blockchain_sentinel';
  var storedVersion = LD.store.get('lockdoc_seed_version');
  if (storedVersion !== SEED_VERSION) {
    LD.store.set(LD.KEYS.CATEGORIES, LD.SEED_CATEGORIES);
    LD.store.set(LD.KEYS.DOCUMENTS, LD.SEED_DOCUMENTS);
    LD.store.set(LD.KEYS.ORIGINAL_DOCS_BACKUP, LD.SEED_DOCUMENTS);
    LD.store.set('lockdoc_seed_version', SEED_VERSION);
    try {
      localStorage.removeItem('lockdoc_blockchain_ledger');
    } catch(e) {}
  }

  // User profile
  if(!LD.store.get(LD.KEYS.USER) || storedVersion !== SEED_VERSION){
    LD.store.set(LD.KEYS.USER, {
      name: 'Aarav Sharma',
      initials: 'AS',
      email: 'aarav.sharma@skylineheights.org',
      role: 'Resident (Flat 402 - Tower B)',
      apartment: 'Skyline City Heights Apartments',
      isVerified: true,
      memberSince: '2026-01-15T10:00:00.000Z',
      pinSet: true
    });
  }

  // Permanent QR token — generated once, never changes
  if(!LD.store.get(LD.KEYS.QR_TOKEN)){
    LD.store.set(LD.KEYS.QR_TOKEN, 'LD-GATE-' + LD.uid());
  }

  // Categories
  if(!LD.store.get(LD.KEYS.CATEGORIES)){
    LD.store.set(LD.KEYS.CATEGORIES, LD.SEED_CATEGORIES);
  }

  // Documents
  if(!LD.store.get(LD.KEYS.DOCUMENTS)){
    LD.store.set(LD.KEYS.DOCUMENTS, LD.SEED_DOCUMENTS);
  }

  // Sessions (connection/access requests)
  if(!LD.store.get(LD.KEYS.SESSIONS) || storedVersion !== SEED_VERSION){
    LD.store.set(LD.KEYS.SESSIONS, [
      {
        id: 'sess_gate_01',
        token: 'LD-GATE-ALPHA',
        requesterName: 'Main Gate Security (Officer Vikram)',
        purpose: 'Visitor Verification for Flat 402 Entry',
        documentIds: ['doc_aadhaar'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        decidedAt: new Date(Date.now() - 3550000).toISOString()
      },
      {
        id: 'sess_gate_02',
        token: 'LD-GATE-CONCIERGE',
        requesterName: 'Tower B Concierge Desk',
        purpose: 'Contractor Interior Work Permit Validation',
        documentIds: ['doc_contractor'],
        status: 'pending',
        createdAt: new Date(Date.now() - 600000).toISOString()
      }
    ]);
  }

  // Connection requests
  if(!LD.store.get(LD.KEYS.CONNECTION_REQUESTS) || storedVersion !== SEED_VERSION){
    LD.store.set(LD.KEYS.CONNECTION_REQUESTS, [
      {
        requestId: 'req_gate_01',
        requesterId: 'usr_guard_vikram',
        requesterName: 'Main Gate Checkpoint (Guard Vikram)',
        ownerId: 'usr_resident_aarav',
        ownerName: 'Aarav Sharma (Flat 402)',
        purpose: 'Visitor & Vehicle Gate Verification',
        status: 'pending',
        createdAt: new Date(Date.now() - 600000).toISOString()
      }
    ]);
  }

  // Activity log
  if(!LD.store.get(LD.KEYS.ACTIVITY) || storedVersion !== SEED_VERSION){
    LD.store.set(LD.KEYS.ACTIVITY, [
      { id: 'act_01', type: 'blockchain_anchored', title: 'Blockchain Ledger Verified', detail: 'Consensus Node anchored 9 apartment credentials', at: new Date(Date.now() - 1200000).toISOString() },
      { id: 'act_02', type: 'qr_scanned', title: 'Checkpoint Alpha QR Scanned', detail: 'Main gate verified resident QR code', at: new Date(Date.now() - 3600000).toISOString() },
      { id: 'act_03', type: 'document_approved', title: 'National ID Verified at Gate', detail: 'Ephemeral 60s watermarked view issued to Guard Vikram', at: new Date(Date.now() - 3550000).toISOString() }
    ]);
  }

  // Settings
  if(!LD.store.get(LD.KEYS.SETTINGS)){
    LD.store.set(LD.KEYS.SETTINGS, { biometricLock: false });
  }
};

/* ---------------------------------------------------------
   Domain helpers
   --------------------------------------------------------- */
LD.data = {
  user(){ return LD.store.get(LD.KEYS.USER); },
  updateUser(patch){
    return LD.store.update(LD.KEYS.USER, u => Object.assign({}, u, patch), {});
  },
  qrToken(){ return LD.store.get(LD.KEYS.QR_TOKEN); },
  categories(){ return LD.store.get(LD.KEYS.CATEGORIES, []); },
  documents(){ return LD.store.get(LD.KEYS.DOCUMENTS, []); },
  documentsByCategory(catId){ return LD.data.documents().filter(d => d.category === catId); },
  documentById(id){ return LD.data.documents().find(d => d.id === id); },

  sessions(){ return LD.store.get(LD.KEYS.SESSIONS, []); },
  sessionById(id){ return LD.data.sessions().find(s => s.id === id); },
  pendingSessions(){ return LD.data.sessions().filter(s => s.status === 'pending'); },
  approvedSessions(){ return LD.data.sessions().filter(s => s.status === 'approved'); },

  addSession(session){
    return LD.store.update(LD.KEYS.SESSIONS, list => {
      list.unshift(session);
      return list;
    }, []);
  },
  updateSession(id, patch){
    return LD.store.update(LD.KEYS.SESSIONS, list =>
      list.map(s => s.id === id ? Object.assign({}, s, patch) : s)
    , []);
  },

  logActivity(entry){
    LD.store.update(LD.KEYS.ACTIVITY, list => {
      list.unshift(Object.assign({ id: LD.uid('act'), at: new Date().toISOString() }, entry));
      return list.slice(0, 50);
    }, []);
  },
  activity(limit){
    const list = LD.store.get(LD.KEYS.ACTIVITY, []);
    return limit ? list.slice(0, limit) : list;
  },

  /* =========================================================
     NEW: Core workflow data helpers
     ========================================================= */

  // JWT Token key (shared with public/script.js)
  JWT_TOKEN_KEY: 'lockdoc_jwt_token',

  // Current user (from auth) — checks JWT-backed storage first
  currentUser(){
    // First try the centralized JWT user storage
    try {
      var raw = localStorage.getItem('lockdoc_currentUser');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.email) return parsed;
      }
    } catch(e) { /* fall through */ }
    // Fall back to legacy CURRENT_USER key
    return LD.store.get(LD.KEYS.CURRENT_USER);
  },
  setCurrentUser(user){
    LD.store.set(LD.KEYS.CURRENT_USER, user);
    // Also sync to the JWT-backed key for compatibility
    try {
      localStorage.setItem('lockdoc_currentUser', JSON.stringify(user));
    } catch(e) { /* ignore */ }
    return user;
  },
  // Check if JWT auth token exists
  isJwtAuthenticated(){
    try {
      return !!localStorage.getItem('lockdoc_jwt_token');
    } catch(e) {
      return false;
    }
  },

  // Generate a unique lockdocId for each verified user
  generateLockdocId(){
    return 'LD-' + LD.uid();
  },

  // Connection requests
  connectionRequests(){ return LD.store.get(LD.KEYS.CONNECTION_REQUESTS, []); },
  addConnectionRequest(req){
    return LD.store.update(LD.KEYS.CONNECTION_REQUESTS, list => {
      list.unshift(req);
      return list;
    }, []);
  },
  updateConnectionRequest(requestId, patch){
    return LD.store.update(LD.KEYS.CONNECTION_REQUESTS, list =>
      list.map(r => r.requestId === requestId ? Object.assign({}, r, patch) : r)
    , []);
  },
  getConnectionRequest(requestId){
    return LD.data.connectionRequests().find(r => r.requestId === requestId);
  },
  pendingConnectionRequests(){
    return LD.data.connectionRequests().filter(r => r.status === 'pending');
  },

  // Active sessions
  activeSessions(){ return LD.store.get(LD.KEYS.ACTIVE_SESSIONS, []); },
  addActiveSession(session){
    return LD.store.update(LD.KEYS.ACTIVE_SESSIONS, list => {
      list.unshift(session);
      return list;
    }, []);
  },
  getActiveSession(sessionId){
    return LD.data.activeSessions().find(s => s.sessionId === sessionId);
  },
  getActiveSessionsByRequester(requesterId){
    return LD.data.activeSessions().filter(s => s.requesterId === requesterId && s.status === 'active');
  },
  getActiveSessionsByOwner(ownerId){
    return LD.data.activeSessions().filter(s => s.ownerId === ownerId && s.status === 'active');
  },

  // Document requests (within a session)
  documentRequests(){ return LD.store.get(LD.KEYS.DOCUMENT_REQUESTS, []); },
  addDocumentRequest(req){
    return LD.store.update(LD.KEYS.DOCUMENT_REQUESTS, list => {
      list.unshift(req);
      return list;
    }, []);
  },
  updateDocumentRequest(requestId, patch){
    return LD.store.update(LD.KEYS.DOCUMENT_REQUESTS, list =>
      list.map(r => r.requestId === requestId ? Object.assign({}, r, patch) : r)
    , []);
  },
  getDocumentRequest(requestId){
    return LD.data.documentRequests().find(r => r.requestId === requestId);
  },
  pendingDocumentRequests(){
    return LD.data.documentRequests().filter(r => r.status === 'pending');
  },

  /* =========================================================
     Per-folder permanent QR codes
     One QR per category. Generated once on first request and
     never changes unless the owner explicitly regenerates it —
     matching the "permanent identity" model used for the user QR.
     ========================================================= */
  categoryQrTokens(){ return LD.store.get(LD.KEYS.CATEGORY_QR_TOKENS, {}); },

  // Get the folder's permanent token, creating it on first call.
  categoryQrToken(categoryId){
    var tokens = LD.data.categoryQrTokens();
    if(!tokens[categoryId]){
      tokens[categoryId] = {
        token: 'LDF-' + LD.uid(),          // "F" = folder, distinct prefix from user tokens (LD-)
        createdAt: new Date().toISOString()
      };
      LD.store.set(LD.KEYS.CATEGORY_QR_TOKENS, tokens);
    }
    return tokens[categoryId].token;
  },

  // Explicitly invalidate and reissue a folder's QR (old code stops working).
  regenerateCategoryQrToken(categoryId){
    var tokens = LD.data.categoryQrTokens();
    tokens[categoryId] = {
      token: 'LDF-' + LD.uid(),
      createdAt: new Date().toISOString()
    };
    LD.store.set(LD.KEYS.CATEGORY_QR_TOKENS, tokens);
    return tokens[categoryId].token;
  },

  // Reverse lookup used by the scan flow: token -> categoryId
  categoryIdByQrToken(token){
    var tokens = LD.data.categoryQrTokens();
    for(var catId in tokens){
      if(tokens[catId].token === token) return catId;
    }
    return null;
  },

  // Audit logs
  auditLogs(){ return LD.store.get(LD.KEYS.AUDIT_LOGS, []); },
  addAuditLog(type, title, detail){
    const entry = {
      id: LD.uid('audit'),
      type: type,
      title: title,
      detail: detail || '',
      at: new Date().toISOString()
    };
    return LD.store.update(LD.KEYS.AUDIT_LOGS, list => {
      list.unshift(entry);
      return list.slice(0, 100);
    }, []);
  },
  recentAuditLogs(limit){
    const list = LD.store.get(LD.KEYS.AUDIT_LOGS, []);
    return limit ? list.slice(0, limit) : list;
  }
};