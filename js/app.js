/* =========================================================
   LockDoc — app.js
   Shared UI utilities used across every page: icons, toast,
   bottom navigation, header rendering, formatting helpers.
   Requires storage.js to be loaded first.
   ========================================================= */

window.LD = window.LD || {};

LD.api = LD.api || {};
LD.api.baseUrl = (function(){
  var origin = window.location.origin || '';
  return origin.indexOf('http') === 0 ? origin : 'http://localhost:5000';
})();
LD.api.getToken = function(){
  return localStorage.getItem('lockdoc_jwt_token');
};
LD.api.getAuthHeaders = function(){
  var token = LD.api.getToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
};
LD.api.getProfile = async function(){
  var response = await fetch(LD.api.baseUrl + '/api/auth/profile', {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.getVaultDocuments = async function(){
  var response = await fetch(LD.api.baseUrl + '/api/vaults/me/documents', {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.getUserVaults = async function(){
  var response = await fetch(LD.api.baseUrl + '/api/vaults/me', {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.uploadDocuments = async function(formData){
  var response = await fetch(LD.api.baseUrl + '/api/vaults/create', {
    method: 'POST',
    headers: LD.api.getAuthHeaders(),
    body: formData
  });
  return response.json();
};

LD.api.deleteDocument = async function(vaultId, documentId){
  var response = await fetch(LD.api.baseUrl + '/api/vaults/' + encodeURIComponent(vaultId || 'default') + '/documents/' + encodeURIComponent(documentId), {
    method: 'DELETE',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.createConnectionRequest = async function(body){
  var response = await fetch(LD.api.baseUrl + '/api/requests/connection', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders()),
    body: JSON.stringify(body)
  });
  return response.json();
};

LD.api.listConnectionRequests = async function(){
  var response = await fetch(LD.api.baseUrl + '/api/requests/connection', {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.acceptConnectionRequest = async function(requestId){
  var response = await fetch(LD.api.baseUrl + '/api/requests/connection/' + encodeURIComponent(requestId) + '/accept', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.declineConnectionRequest = async function(requestId){
  var response = await fetch(LD.api.baseUrl + '/api/requests/connection/' + encodeURIComponent(requestId) + '/decline', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.createDocumentRequest = async function(body){
  var response = await fetch(LD.api.baseUrl + '/api/requests/document', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders()),
    body: JSON.stringify(body)
  });
  return response.json();
};

LD.api.listDocumentRequests = async function(){
  var response = await fetch(LD.api.baseUrl + '/api/requests/document', {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.getDocumentRequest = async function(requestId){
  var response = await fetch(LD.api.baseUrl + '/api/requests/document/' + encodeURIComponent(requestId), {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.approveDocumentRequest = async function(requestId){
  var response = await fetch(LD.api.baseUrl + '/api/requests/document/' + encodeURIComponent(requestId) + '/approve', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.denyDocumentRequest = async function(requestId){
  var response = await fetch(LD.api.baseUrl + '/api/requests/document/' + encodeURIComponent(requestId) + '/deny', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.validateDocumentAccess = async function(requestId, token){
  var response = await fetch(LD.api.baseUrl + '/api/requests/document/access?requestId=' + encodeURIComponent(requestId) + '&token=' + encodeURIComponent(token), {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.getConnectionRequest = async function(requestId){
  var response = await fetch(LD.api.baseUrl + '/api/requests/connection/' + encodeURIComponent(requestId), {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.api.getConnectionSession = async function(sessionId){
  var response = await fetch(LD.api.baseUrl + '/api/requests/connection/session/' + encodeURIComponent(sessionId), {
    method: 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, LD.api.getAuthHeaders())
  });
  return response.json();
};

LD.app = LD.app || {};
LD.app.loadVaultDocuments = async function(){
  if (!LD.data.isJwtAuthenticated()) return;
  try {
    var result = await LD.api.getVaultDocuments();
    if (result && result.success && Array.isArray(result.documents)) {
      var mapped = result.documents.map(function(doc){
        var categoryId = (doc.category || 'other').toString().toLowerCase();
        var known = LD.data.categories().find(function(c){ return c.id === categoryId; });
        if (!known) categoryId = 'other';
        return {
          id: doc.id,
          name: doc.documentName,
          category: categoryId,
          issuer: doc.vaultName || doc.metadata.provider || 'Vault',
          verified: doc.encryptionStatus === 'encrypted',
          fileUrl: doc.fileUrl,
          uploadDate: doc.uploadDate,
          metadata: doc.metadata
        };
      });
      LD.store.set(LD.KEYS.DOCUMENTS, mapped);
      if (typeof LD.ui.mountBottomNav === 'function') LD.ui.mountBottomNav();
      document.dispatchEvent(new CustomEvent('ld-vault-documents-loaded'));
    }
  } catch (err) {
    console.error('Failed to load vault documents:', err);
  }
};

LD.app.syncUserProfileFromBackend = async function(){
  if (!LD.data.isJwtAuthenticated()) return;
  try {
    var result = await LD.api.getProfile();
    if (result && result.success && result.user) {
      var u = result.user;
      var name = u.fullName || u.email || 'User';
      var initials = (name.trim().charAt(0) || '?').toUpperCase();
      var userObj = {
        name: name,
        initials: initials,
        fullName: u.fullName,
        email: u.email,
        role: u.role || 'holder',
        lockdocId: u.lockdocId,
        isVerified: u.isVerified,
        memberSince: u.createdAt || new Date().toISOString(),
        pinSet: true
      };
      LD.store.set(LD.KEYS.USER, userObj);
      LD.data.setCurrentUser(userObj);
      document.dispatchEvent(new CustomEvent('ld-user-profile-loaded'));
    }
  } catch (err) {
    console.error('Failed to sync user profile from backend:', err);
  }
};

document.addEventListener('DOMContentLoaded', function(){
  LD.init();
  LD.ui.checkRegistration();
  LD.ui.mountToastLayer();
  LD.ui.mountBottomNav();
  LD.ui.wireBackButtons();
  LD.ui.stampYear();
  LD.app.syncUserProfileFromBackend();
  LD.app.loadVaultDocuments();
});

/* ---------------------------------------------------------
   Icon set — inline SVG strings, currentColor based
   --------------------------------------------------------- */
LD.icons = {
  home:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>',
  qr:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01"/></svg>',
  scan:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M4 12h16"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/></svg>',
  bell:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  back:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  x:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  clock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>',
  lock:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  id:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="1.8"/><path d="M5 16c.7-1.6 2-2.4 3.5-2.4S11.3 14.4 12 16M14 9h5M14 12.5h5M14 16h3"/></svg>',
  bank:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9M3 21h18"/></svg>',
  cap:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>',
  home2:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  eye:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"/><circle cx="12" cy="13" r="3.3"/></svg>',
  arrowR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  users:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};
LD.icon = function(name, cls){ return '<span class="i ' + (cls||'') + '">' + (LD.icons[name] || '') + '</span>'; };

/* ---------------------------------------------------------
   Toast notifications
   --------------------------------------------------------- */
LD.ui = LD.ui || {};

LD.ui.mountToastLayer = function(){
  if(document.querySelector('.toast-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'toast-wrap';
  document.body.appendChild(wrap);
};

LD.ui.toast = function(message, type){
  const wrap = document.querySelector('.toast-wrap') || (LD.ui.mountToastLayer(), document.querySelector('.toast-wrap'));
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.innerHTML = (type === 'success' ? LD.icon('check') : type === 'error' ? LD.icon('x') : LD.icon('shield')) + '<span>' + message + '</span>';
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2600);
};

/* ---------------------------------------------------------
   Bottom navigation — injected into any page with
   <div id="bottom-nav-slot" data-active="home"></div>
   --------------------------------------------------------- */
LD.NAV_ITEMS = [
  { key: 'home',       label: 'Home',     href: 'index.html',      icon: 'home' },
  { key: 'qr',         label: 'My QR',    href: 'qr.html',         icon: 'qr' },
  { key: 'scan',       label: 'Scan',     href: 'scan.html',       icon: 'scan' },
  { key: 'categories', label: 'Vault',    href: 'index.html',      icon: 'folder' },
  { key: 'approval',   label: 'Requests', href: 'approval.html',   icon: 'bell' }
];

LD.ui.mountBottomNav = function(){
  const slot = document.getElementById('bottom-nav-slot');
  if(!slot) return;
  const active = slot.getAttribute('data-active');
  const pending = LD.data.pendingSessions().length;

  slot.innerHTML = '<nav class="bottom-nav">' + LD.NAV_ITEMS.map(item => {
    const isActive = item.key === active;
    const showBadge = item.key === 'approval' && pending > 0;
    return '<a class="nav-item' + (isActive ? ' active' : '') + '" href="' + item.href + '">' +
      LD.icon(item.icon) + (showBadge ? '<span class="nav-badge"></span>' : '') +
      '<span>' + item.label + '</span></a>';
  }).join('') + '</nav>';
};

/* ---------------------------------------------------------
   Header back-button wiring —
   any element with [data-back] navigates to history back
   or a fallback href if none exists.
   --------------------------------------------------------- */
LD.ui.wireBackButtons = function(){
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fallback = btn.getAttribute('data-back') || 'index.html';
      if(document.referrer && document.referrer.indexOf(window.location.host) !== -1){
        history.back();
      } else {
        window.location.href = fallback;
      }
    });
  });
};

/* ---------------------------------------------------------
   Formatting helpers
   --------------------------------------------------------- */
LD.ui.formatDate = function(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

LD.ui.formatTime = function(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

LD.ui.timeAgo = function(iso){
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff/60) + ' min ago';
  if(diff < 86400) return Math.floor(diff/3600) + ' hr ago';
  return Math.floor(diff/86400) + ' day' + (Math.floor(diff/86400) > 1 ? 's' : '') + ' ago';
};

LD.ui.stampYear = function(){
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
};

/* ---------------------------------------------------------
   Registration guard — redirect unverified users to
   register.html. Skips register.html itself and viewer.html
   (which may be shared via link) so email verification flow
   and document viewing work without interruption.
   --------------------------------------------------------- */
LD.ui.checkRegistration = function(){
  const current = (window.location.pathname.split('/').pop() || '').replace(/\.html$/, '');

  // Allow register page, viewer (shared links), login, index (dashboard), and static assets
  if(current === 'register' || current === 'viewer' || current === 'login' || current === 'dashboard' || current === 'index' || current === '' || !current) return;

  // Check if user is authenticated (via JWT or currentUser in localStorage)
  var currentUser = LD.data.currentUser();
  var jwtAuth = LD.data.isJwtAuthenticated();

  if (!currentUser || !currentUser.isVerified) {
    // JWT authenticated with user data
    if (jwtAuth && currentUser) {
      return;
    }
    // Check if legacy EmailJS user is verified
    if (typeof LD.email !== 'undefined' && LD.email.isVerified()) {
      return; // Legacy flow - allow access
    }
    // If on backend server (HTTP), redirect to login
    if (window.location.protocol.startsWith('http') && window.location.port) {
      window.location.href = 'public/login.html';
    } else {
      // For direct file access, check localStorage user
      if (!LD.store.get(LD.KEYS.USER) || !LD.store.get(LD.KEYS.USER).isVerified) {
        window.location.href = 'register.html';
      }
    }
  }
};

/* ---------------------------------------------------------
   Render audit logs on the dashboard
   --------------------------------------------------------- */
LD.ui.renderAuditLogs = function(containerId, limit){
  var container = document.getElementById(containerId);
  if(!container) return;

  var logs = LD.data.recentAuditLogs(limit || 10);

  if(logs.length === 0){
    container.innerHTML = '<div class="empty-state"><div class="icon">' + LD.icons.clock + '</div><p class="text-sm">No activity yet</p><p class="text-xs mt-4">Actions like QR scans, connections, and document views will appear here</p></div>';
    return;
  }

  container.innerHTML = logs.map(function(log){
    var iconMap = {
      qr_generated: 'qr',
      qr_scanned: 'camera',
      connection_requested: 'users',
      connection_accepted: 'check',
      connection_declined: 'x',
      document_requested: 'folder',
      document_approved: 'check',
      document_denied: 'x',
      viewer_opened: 'eye',
      session_expired: 'clock',
      blockchain_tamper_alert: 'shield',
      blockchain_anchored: 'lock',
      document_anchored: 'lock'
    };
    var colorMap = {
      qr_generated: 'blue',
      qr_scanned: 'blue',
      connection_requested: 'blue',
      connection_accepted: 'green',
      connection_declined: 'red',
      document_requested: 'amber',
      document_approved: 'green',
      document_denied: 'red',
      viewer_opened: 'blue',
      session_expired: 'red',
      blockchain_tamper_alert: 'red',
      blockchain_anchored: 'green',
      document_anchored: 'blue'
    };
    var icon = iconMap[log.type] || 'shield';
    var color = colorMap[log.type] || 'blue';

    return '<div class="list-row">' +
      '<div class="icon-tile ' + color + '">' + (LD.icons[icon] || LD.icons.shield) + '</div>' +
      '<div class="flex-1"><p class="text-sm font-medium">' + log.title + '</p><p class="text-muted text-xs">' + (log.detail ? log.detail + ' &middot; ' : '') + LD.ui.timeAgo(log.at) + '</p></div>' +
      '</div>';
  }).join('');
};

LD.ui.categoryIcon = function(catId){
  const map = {
    identity: 'id',
    apartment: 'home2',
    vehicles: 'shield',
    visitors: 'users',
    clearance: 'folder',
    emergency: 'shield',
    financial: 'bank',
    education: 'cap',
    property: 'home2',
    insurance: 'shield',
    other: 'folder'
  };
  return map[catId] || 'folder';
};
