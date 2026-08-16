/* ============================================================
   LockDoc — Viewer Page Logic
   Validates an approved document-access token, displays the
   document read-only with a tiled watermark, and force-closes
   the session after a countdown.
   ============================================================ */

async function apiValidateAccess(requestId, token) {
  const response = await fetch(API_BASE + '/api/requests/document/access?requestId=' + encodeURIComponent(requestId) + '&token=' + encodeURIComponent(token), {
    method: 'GET',
    headers: authHeaders()
  });
  return response.json();
}

async function apiIssueReceipt(requestId) {
  const response = await fetch(API_BASE + '/api/receipts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ requestId })
  });
  return response.json();
}

function showReceiptNotice(receiptToken) {
  const el = document.getElementById('viewer-receipt-notice');
  if (!el) return;
  const checkUrl = API_BASE + '/api/receipts/' + encodeURIComponent(receiptToken);
  el.innerHTML =
    '<p class="text-muted text-sm mt-8">✅ Verification receipt issued. ' +
    '<a href="' + checkUrl + '" target="_blank" rel="noopener">View/share receipt</a></p>';
}

function resolveFileUrl(fileUrl) {
  if (!fileUrl) return '';
  const fullUrl = (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))
    ? fileUrl
    : API_BASE + fileUrl;

  // iframe src is a plain navigation and can't carry the
  // 'ngrok-skip-browser-warning' header, so when tunneling through
  // ngrok we must use its query-param equivalent instead, or the
  // iframe ends up loading ngrok's warning page instead of the file.
  const separator = fullUrl.includes('?') ? '&' : '?';
  return fullUrl + separator + 'ngrok-skip-browser-warning=true';
}

function buildWatermark(text) {
  const el = document.getElementById('viewer-watermark');
  el.innerHTML = '';
  for (let i = 0; i < 15; i++) {
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
  }
}

function startCountdown(seconds) {
  const countdownEl = document.getElementById('viewer-countdown');
  let remaining = seconds;

  function tick() {
    countdownEl.textContent = 'Closing in ' + remaining + 's';
    if (remaining <= 15) countdownEl.classList.add('warn');
    if (remaining <= 0) {
      clearInterval(timer);
      closeSession();
      return;
    }
    remaining -= 1;
  }

  tick();
  const timer = setInterval(tick, 1000);
  return timer;
}

function closeSession() {
  document.getElementById('viewer-active').innerHTML =
    '<div class="dashboard-card" style="text-align:center;">' +
      '<h3>Session closed</h3>' +
      '<p class="text-muted text-sm mt-8">This document view has expired for security. Request access again if needed.</p>' +
      '<a href="dashboard.html" class="btn btn-secondary mt-16" style="width:auto;padding:8px 16px;">Back to Dashboard</a>' +
    '</div>';
}

function blockShortcuts(e) {
  const blocked = (e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'u'].includes(e.key.toLowerCase());
  if (blocked) e.preventDefault();
}

async function setupViewerPage() {
  if (!isAuthenticated()) {
    redirectToLogin();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const requestId = params.get('requestId');
  const token = params.get('token');

  if (!requestId || !token) {
    document.getElementById('viewer-loading').style.display = 'none';
    document.getElementById('viewer-denied').style.display = 'block';
    return;
  }

  const result = await apiValidateAccess(requestId, token);

  document.getElementById('viewer-loading').style.display = 'none';

  if (!result.success) {
    document.getElementById('viewer-denied').style.display = 'block';
    return;
  }

  const { document: doc, session } = result.result;

  document.getElementById('viewer-subtitle').textContent = 'Owned by ' + session.ownerName;
  document.getElementById('viewer-doc-name').textContent = doc.documentName;
  document.getElementById('viewer-meta').textContent = doc.documentType + ' · viewed by ' + session.requesterName + ' · ' + new Date().toLocaleString();

  document.getElementById('viewer-active').style.display = 'block';
  document.getElementById('viewer-frame').src = resolveFileUrl(doc.fileUrl);

  buildWatermark(session.requesterName + ' · ' + new Date().toLocaleDateString());
  startCountdown(60);

  document.addEventListener('keydown', blockShortcuts);

  // Issue a verification receipt for this session — a signed record
  // that this document was viewed, WITHOUT storing the document's
  // actual content or number anywhere in the receipt itself.
  apiIssueReceipt(requestId).then(receiptResult => {
    if (receiptResult.success) {
      showReceiptNotice(receiptResult.receipt.receiptToken);
    } else {
      console.warn('Could not issue verification receipt:', receiptResult.message);
    }
  });
}

document.addEventListener('DOMContentLoaded', setupViewerPage);
