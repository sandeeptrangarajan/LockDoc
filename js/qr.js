/* =========================================================
   LockDoc — qr.js
   Renders the user's permanent QR code (qr.html only).
   The QR payload contains ONLY: lockdocId, name, role.
   No document data is ever encoded in the QR.
   ========================================================= */

LD.qr = {};

/* ---------------------------------------------------------
   Render the permanent QR code for the current user.
   The payload is a JSON string with only three fields.
   --------------------------------------------------------- */
LD.qr.render = function(targetId){
  const el = document.getElementById(targetId);
  if(!el) return;

  // Get current user from auth data (stored by login flow)
  const currentUser = LD.data.currentUser() || LD.data.user();
  if(!currentUser || !currentUser.lockdocId){
    el.innerHTML = '<p class="text-muted text-sm text-center">Please log in first to see your QR code.</p>';
    return null;
  }

  // QR payload contains ONLY identity info - NO documents
  const payload = JSON.stringify({
    lockdocId: currentUser.lockdocId,
    name: currentUser.name,
    role: currentUser.role || 'holder'
  });

  el.innerHTML = '';
  if(window.QRCode){
    new QRCode(el, {
      text: payload,
      width: 220,
      height: 220,
      colorDark: '#0F172A',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    // Fallback if the CDN library failed to load
    el.innerHTML = '<p class="text-muted text-sm text-center">QR library unavailable — token below</p>';
  }

  // Record audit log
  LD.data.addAuditLog('qr_generated', 'QR code displayed', 'User ' + currentUser.name + ' viewed their QR code');

  return currentUser.lockdocId;
};

/* ---------------------------------------------------------
   Invalidate and reissue the user's main QR token.
   (Previously referenced by qr.html but never defined.)
   --------------------------------------------------------- */
LD.qr.regenerate = function(){
  const newToken = 'LD-' + LD.uid();
  LD.store.set(LD.KEYS.QR_TOKEN, newToken);
  return newToken;
};

/* ---------------------------------------------------------
   Render a PERMANENT, per-folder QR code.
   Scanning it identifies the owner + which folder is being
   requested, and carries that folder's riskLevel so the scan
   flow knows how strongly to challenge the owner before they
   can approve (low -> approve tap, medium -> fingerprint,
   high -> face verification). Still contains NO documents and
   NO personal data beyond the owner's LockDoc ID.
   --------------------------------------------------------- */
LD.qr.renderForCategory = function(targetId, categoryId){
  const el = document.getElementById(targetId);
  if(!el) return null;

  const currentUser = LD.data.currentUser() || LD.data.user();
  if(!currentUser || !currentUser.lockdocId){
    el.innerHTML = '<p class="text-muted text-sm text-center">Please log in first to see your QR code.</p>';
    return null;
  }

  const category = LD.data.categories().find(c => c.id === categoryId);
  if(!category){
    el.innerHTML = '<p class="text-muted text-sm text-center">Unknown folder.</p>';
    return null;
  }

  const token = LD.data.categoryQrToken(categoryId);   // get-or-create, permanent

  const payload = JSON.stringify({
    type: 'folder',
    lockdocId: currentUser.lockdocId,
    categoryId: category.id,
    categoryName: category.name,
    riskLevel: category.riskLevel || 'low',
    token: token
  });

  el.innerHTML = '';
  if(window.QRCode){
    new QRCode(el, {
      text: payload,
      width: 220,
      height: 220,
      colorDark: '#0F172A',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    el.innerHTML = '<p class="text-muted text-sm text-center">QR library unavailable — token below</p>';
  }

  LD.data.addAuditLog('folder_qr_generated', 'Folder QR code displayed',
    currentUser.name + ' viewed the permanent QR for "' + category.name + '" (risk: ' + (category.riskLevel || 'low') + ')');

  return token;
};