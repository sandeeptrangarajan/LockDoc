/* ============================================================
   LockDoc — Document Viewer (Direct Clean Document Display)
   ============================================================ */

async function apiValidateAccess(requestId, token) {
  try {
    const res = await fetch(
      API_BASE + '/api/requests/document/access' +
      '?requestId=' + encodeURIComponent(requestId) +
      '&token='     + encodeURIComponent(token),
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    return await res.json();
  } catch (e) {
    console.error('apiValidateAccess error:', e);
    return { success: false, message: 'Network error. Please check your connection.' };
  }
}

function startCountdown(seconds) {
  const el = document.getElementById('viewer-countdown');
  let remaining = seconds;
  function tick() {
    if (el) {
      el.textContent = '⏱ ' + remaining + 's';
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

function closeSession() {
  const el = document.getElementById('viewer-active');
  if (el) el.innerHTML =
    '<div style="text-align:center;padding:48px 24px;margin:auto;">' +
      '<div style="font-size:52px;margin-bottom:16px;">🔒</div>' +
      '<h3 style="color:#F9FAFB;font-size:18px;">Session Completed</h3>' +
      '<p style="color:rgba(255,255,255,.5);font-size:14px;margin-top:8px;">' +
        'This viewing session has expired for security.' +
      '</p>' +
    '</div>';
}

function renderDocument(doc, requestId, token) {
  const shell = document.getElementById('viewer-doc-area');
  if (!shell) return;

  const docName = (doc && (doc.documentName || doc.name)) || 'Document';
  const docType = ((doc && doc.documentType) || '').toUpperCase();
  const mimeType = (doc && doc.metadata && doc.metadata.mimeType) || '';

  let fileUrl = doc && doc.dataUrl;
  if (!fileUrl && requestId && token) {
    fileUrl = API_BASE.replace(/\/+$/, '') + '/api/requests/document/file?requestId=' + encodeURIComponent(requestId) + '&token=' + encodeURIComponent(token);
  } else if (!fileUrl && doc && doc.fileUrl) {
    fileUrl = (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://') || doc.fileUrl.startsWith('data:'))
      ? doc.fileUrl
      : API_BASE.replace(/\/+$/, '') + (doc.fileUrl.startsWith('/') ? doc.fileUrl : '/' + doc.fileUrl);
  }

  // Update Direct Link button
  const directBtn = document.getElementById('viewer-direct-btn');
  if (directBtn && fileUrl) {
    directBtn.href = fileUrl;
    directBtn.style.display = 'inline-block';
  }

  const isImage = (doc.dataUrl && doc.dataUrl.startsWith('data:image/')) ||
    mimeType.startsWith('image/') ||
    ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG'].includes(docType) ||
    /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(fileUrl || '');

  // 1. Image Rendering
  if (isImage && fileUrl) {
    const iconEl = document.getElementById('doc-icon');
    if (iconEl) iconEl.textContent = '🖼️';

    shell.innerHTML =
      '<div class="doc-image-container">' +
        '<img src="' + fileUrl + '" alt="' + docName + '" />' +
      '</div>';
    return;
  }

  // 2. PDF / Standard Document Rendering
  const iconEl = document.getElementById('doc-icon');
  if (iconEl) iconEl.textContent = '📄';

  shell.innerHTML =
    '<iframe class="doc-iframe" src="' + fileUrl + '#toolbar=1&navpanes=0" title="' + docName + '"></iframe>';
}

async function setupViewerPage() {
  const params    = new URLSearchParams(window.location.search);
  const requestId = params.get('requestId');
  const token     = params.get('token');

  const loadingEl = document.getElementById('viewer-loading');
  const deniedEl  = document.getElementById('viewer-denied');
  const activeEl  = document.getElementById('viewer-active');

  if (!requestId || !token) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (deniedEl)  deniedEl.style.display  = 'block';
    return;
  }

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

  const data    = result.result   || {};
  const doc     = data.document   || data.doc || {};
  const session = data.session    || {};

  // Header information
  const docNameEl = document.getElementById('viewer-doc-name');
  if (docNameEl) docNameEl.textContent = doc.documentName || doc.name || 'Document';

  const subtitleEl = document.getElementById('viewer-subtitle');
  if (subtitleEl) subtitleEl.textContent = (session.ownerName ? 'Released by ' + session.ownerName : 'Approved Secure Document');

  if (activeEl) activeEl.style.display = 'flex';

  // Render the actual approved document
  renderDocument(doc, requestId, token);

  // Start auto-close timer
  startCountdown(60);
}

document.addEventListener('DOMContentLoaded', setupViewerPage);
