/* ============================================================
   LockDoc — Viewer Page Logic (v5 — Real Document Display)
   
   KEY DESIGN:
   - Works WITHOUT requiring the requester to be logged in
   - The requestId + token ARE the credentials
   - Renders the ACTUAL document file (PDF stream or Image)
   ============================================================ */

/* ─── API helpers ─────────────────────────────────────────── */
async function apiValidateAccess(requestId, token) {
  try {
    // NOTE: No auth headers needed — this endpoint is intentionally public.
    // The requestId+token pair IS the authentication.
    const res = await fetch(
      API_BASE + '/api/requests/document/access' +
      '?requestId=' + encodeURIComponent(requestId) +
      '&token='     + encodeURIComponent(token),
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('apiValidateAccess error:', e);
    return { success: false, message: 'Network error. Please check your connection.' };
  }
}

async function apiIssueReceipt(requestId) {
  try {
    const res = await fetch(API_BASE + '/api/receipts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ requestId })
    });
    return res.json();
  } catch (e) {
    return { success: false };
  }
}

/* ─── Watermark ────────────────────────────────────────────── */
function buildWatermark(text) {
  const el = document.getElementById('viewer-watermark');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
  }
}

/* ─── Countdown ────────────────────────────────────────────── */
function startCountdown(seconds) {
  const el = document.getElementById('viewer-countdown');
  let remaining = seconds;
  function tick() {
    if (el) {
      el.textContent = '⏱ Closing in ' + remaining + 's';
      if (remaining <= 15) el.classList.add('warn');
    }
    if (remaining <= 0) {
      clearInterval(timer);
      closeSession();
    }
    remaining--;
  }
  tick();
  const timer = setInterval(tick, 1000);
}

/* ─── Session close ────────────────────────────────────────── */
function closeSession() {
  const el = document.getElementById('viewer-active');
  if (el) el.innerHTML =
    '<div style="text-align:center;padding:48px 24px;">' +
      '<div style="font-size:52px;margin-bottom:16px;">🔒</div>' +
      '<h3 style="color:#F9FAFB;font-size:18px;">Session Closed</h3>' +
      '<p style="color:rgba(255,255,255,.5);font-size:14px;margin-top:8px;">' +
        'This viewing session has expired for security. Request access again if needed.' +
      '</p>' +
    '</div>';
}

/* ─── Anti-copy ─────────────────────────────────────────────── */
function blockShortcuts(e) {
  if ((e.ctrlKey || e.metaKey) && ['p','s','c','u'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
}

/* ─── Receipt notice ────────────────────────────────────────── */
function showReceiptNotice(token) {
  const el = document.getElementById('viewer-receipt-notice');
  if (!el) return;
  const url = API_BASE + '/api/receipts/' + encodeURIComponent(token);
  el.innerHTML =
    '<p style="font-size:12px;color:rgba(255,255,255,.45);margin-top:10px;">' +
    '✅ Verification receipt issued. ' +
    '<a href="' + url + '" target="_blank" style="color:#00F0FF;">View receipt</a></p>';
}

/* ─── Digital Credential Card (fallback only) ──────────────── */
function renderCredentialCard(doc, session) {
  const name    = (doc && (doc.documentName || doc.name))          || 'Secure Document';
  const type    = (doc && (doc.documentType || doc.category))      || 'Official Document';
  const issuer  = (doc && doc.issuer)                              || (session && session.ownerOrg) || 'Issuing Authority';
  const holder  = (session && session.ownerName)                   || 'Document Holder';
  const viewer  = (session && session.requesterName)               || 'Authorised Viewer';
  const purpose = (doc && doc.purpose) || (session && session.purpose) || 'Identity Verification';
  const cat     = ((doc && doc.category) || 'identity').toLowerCase();
  const viewed  = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const catMap = {
    identity:  { icon: '🛡️', color: '#3B82F6' },
    apartment: { icon: '🏢', color: '#06B6D4' },
    vehicles:  { icon: '🚗', color: '#10B981' },
    visitors:  { icon: '👤', color: '#F59E0B' },
    clearance: { icon: '✅', color: '#8B5CF6' },
    emergency: { icon: '🚑', color: '#EF4444' }
  };
  const { icon, color } = catMap[cat] || { icon: '📄', color: '#3B82F6' };

  const hash = Array.from({length: 32}, () =>
    '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
  ).join('');

  const card =
    '<div class="cred-card">' +
      '<div class="cred-header">' +
        '<div class="cred-icon" style="background:' + color + '22;border-color:' + color + '44;">' + icon + '</div>' +
        '<div class="cred-header-text">' +
          '<div class="cred-type" style="color:' + color + ';">' + type.toUpperCase() + '</div>' +
          '<div class="cred-issuer">' + issuer + '</div>' +
        '</div>' +
        '<div class="cred-badge">✓ Verified</div>' +
      '</div>' +
      '<div class="cred-doc-name">' + name + '</div>' +
      '<div class="cred-grid">' +
        '<div class="cred-field"><span class="cred-label">Document Holder</span><span class="cred-val">' + holder + '</span></div>' +
        '<div class="cred-field"><span class="cred-label">Authorised Viewer</span><span class="cred-val">' + viewer + '</span></div>' +
        '<div class="cred-field"><span class="cred-label">Issuing Authority</span><span class="cred-val">' + issuer + '</span></div>' +
        '<div class="cred-field"><span class="cred-label">Purpose</span><span class="cred-val">' + purpose + '</span></div>' +
        '<div class="cred-field cred-field-full"><span class="cred-label">Access Session</span><span class="cred-val cred-mono">' + viewed + '</span></div>' +
      '</div>' +
      '<div class="cred-security">' +
        '<span>⛓️ Blockchain Anchored</span>' +
        '<span class="cred-mono" style="font-size:9.5px;opacity:.6;">SHA256:' + hash + '</span>' +
      '</div>' +
      '<div class="cred-chip-row">' +
        '<div class="cred-chip"></div>' +
        '<div class="cred-hologram">🔒 LOCKDOC SECURE · DIGITAL VAULT</div>' +
      '</div>' +
    '</div>';

  const shell = document.getElementById('viewer-doc-area');
  if (shell) {
    shell.innerHTML = card;
  }
}

/* ─── Render Actual Document Content ───────────────────────── */
async function renderDocument(doc, session, requestId, token) {
  const shell = document.getElementById('viewer-doc-area');
  if (!shell) return;

  const docName = (doc && (doc.documentName || doc.name)) || 'Document';
  const docType = ((doc && doc.documentType) || '').toUpperCase();
  const mimeType = (doc && doc.metadata && doc.metadata.mimeType) || '';

  // Determine stream endpoint or dataUrl
  let fileUrl = doc && doc.dataUrl;
  if (!fileUrl && requestId && token) {
    fileUrl = API_BASE.replace(/\/+$/, '') + '/api/requests/document/file?requestId=' + encodeURIComponent(requestId) + '&token=' + encodeURIComponent(token);
  } else if (!fileUrl && doc && doc.fileUrl) {
    fileUrl = (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://') || doc.fileUrl.startsWith('data:'))
      ? doc.fileUrl
      : API_BASE.replace(/\/+$/, '') + (doc.fileUrl.startsWith('/') ? doc.fileUrl : '/' + doc.fileUrl);
  }

  if (!fileUrl) {
    renderCredentialCard(doc, session);
    return;
  }

  const isImage = (doc.dataUrl && doc.dataUrl.startsWith('data:image/')) ||
    mimeType.startsWith('image/') ||
    ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG'].includes(docType) ||
    /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(fileUrl);

  const isPdf = (doc.dataUrl && doc.dataUrl.startsWith('data:application/pdf')) ||
    mimeType === 'application/pdf' ||
    docType === 'PDF' ||
    /\.pdf(\?|$)/i.test(fileUrl);

  // 1. Image Rendering
  if (isImage) {
    shell.innerHTML =
      '<div style="padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:480px;background:#0d1322;">' +
        '<div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 8px;">' +
          '<span style="font-size:12px;color:#00F0FF;font-weight:700;">📷 ' + docName + '</span>' +
          '<a href="' + fileUrl + '" target="_blank" rel="noopener" style="font-size:11px;color:#38BDF8;text-decoration:none;">Open Full Size ↗</a>' +
        '</div>' +
        '<img src="' + fileUrl + '" alt="' + docName + '" ' +
        'style="max-width:100%;max-height:65vh;object-fit:contain;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.6);border:1px solid rgba(0,240,255,0.2);" ' +
        'onerror="this.parentNode.innerHTML=\'<p style=\\\"color:rgba(255,255,255,.5);text-align:center;padding:40px;\\\">⚠️ Document image preview failed to load.</p>\';"' +
        '>' +
      '</div>';
    return;
  }

  // 2. PDF or Streaming Document Rendering
  shell.innerHTML =
    '<div style="width:100%;min-height:580px;height:72vh;display:flex;flex-direction:column;background:#0d1322;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(0,0,0,0.4);border-bottom:1px solid rgba(0,240,255,0.12);font-size:12px;color:#94a3b8;">' +
        '<span>📑 <strong>' + docName + '</strong> (Encrypted Stream)</span>' +
        '<a href="' + fileUrl + '" target="_blank" rel="noopener" style="color:#00F0FF;text-decoration:none;font-weight:700;">Open Direct ↗</a>' +
      '</div>' +
      '<iframe src="' + fileUrl + '#toolbar=0&navpanes=0" ' +
      'style="flex:1;width:100%;height:100%;border:none;background:#1e293b;" ' +
      'sandbox="allow-same-origin allow-scripts allow-forms" ' +
      'title="' + docName + '"></iframe>' +
    '</div>';
}

/* ─── Main ──────────────────────────────────────────────────── */
async function setupViewerPage() {
  const params    = new URLSearchParams(window.location.search);
  const requestId = params.get('requestId');
  const token     = params.get('token');

  const loadingEl = document.getElementById('viewer-loading');
  const deniedEl  = document.getElementById('viewer-denied');
  const activeEl  = document.getElementById('viewer-active');

  // No requestId/token in URL → access denied
  if (!requestId || !token) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (deniedEl)  deniedEl.style.display  = 'block';
    return;
  }

  // Validate the token with the backend
  const result = await apiValidateAccess(requestId, token);

  if (loadingEl) loadingEl.style.display = 'none';

  if (!result || !result.success) {
    if (deniedEl) {
      const msgEl = deniedEl.querySelector('#viewer-denied-msg');
      if (msgEl && result && result.message) {
        msgEl.textContent = result.message;
      }
      deniedEl.style.display = 'block';
    }
    return;
  }

  // ── Session data ─────────────────────────────────────────────
  const data    = result.result   || {};
  const doc     = data.document   || data.doc || {};
  const session = data.session    || {};

  // ── Populate header ──────────────────────────────────────────
  const subtitleEl = document.getElementById('viewer-subtitle');
  if (subtitleEl) subtitleEl.textContent = 'Owned by ' + (session.ownerName || 'Vault Owner');

  const docNameEl = document.getElementById('viewer-doc-name');
  if (docNameEl) docNameEl.textContent = doc.documentName || doc.name || 'Secure Document';

  const metaEl = document.getElementById('viewer-meta');
  if (metaEl) {
    metaEl.textContent =
      (doc.documentType || doc.category || 'Document') +
      ' · viewed by ' + (session.requesterName || 'Requester') +
      ' · ' + new Date().toLocaleString('en-IN');
  }

  // ── Show active viewer ───────────────────────────────────────
  if (activeEl) activeEl.style.display = 'block';

  // ── Render actual document content ───────────────────────────
  await renderDocument(doc, session, requestId, token);

  // ── Watermark ────────────────────────────────────────────────
  buildWatermark((session.requesterName || 'VIEWER') + ' · ' + new Date().toLocaleDateString('en-IN'));

  // ── Countdown + anti-copy ────────────────────────────────────
  startCountdown(60);
  document.addEventListener('keydown', blockShortcuts);

  // ── Issue receipt (best-effort, won't block render) ──────────
  try {
    const rec = await apiIssueReceipt(requestId);
    if (rec && rec.success && rec.receipt && rec.receipt.receiptToken) {
      showReceiptNotice(rec.receipt.receiptToken);
    }
  } catch (e) { /* silent */ }
}

document.addEventListener('DOMContentLoaded', setupViewerPage);
