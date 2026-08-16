/* ============================================================
   LockDoc — Scan Page Logic
   Scans a folder (vault) QR code with the camera or via pasted
   text, previews the folder's documents, and lets the requester
   ask the owner for access to specific ones.
   ============================================================ */

const SCAN = {
  stream: null,
  active: false,
  vaultInfo: null,
  requestIds: [],
  pollTimer: null
};

async function apiScanVaultQr(encryptedData) {
  const response = await fetch(API_BASE + '/api/qr/scan-vault', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ encryptedData })
  });
  return response.json();
}

async function apiCreateVaultConnection(ownerId, vaultId, purpose) {
  const user = getStoredUser();
  const response = await fetch(API_BASE + '/api/requests/connection/vault', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ownerId, vaultId, requesterName: user ? (user.fullName || user.name) : 'Requester', purpose })
  });
  return response.json();
}

async function apiCreateDocumentRequest(sessionId, documentId, purpose) {
  const response = await fetch(API_BASE + '/api/requests/document', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ sessionId, documentId, purpose })
  });
  return response.json();
}

async function apiGetDocumentRequest(requestId) {
  const response = await fetch(API_BASE + '/api/requests/document/' + requestId, {
    method: 'GET',
    headers: authHeaders()
  });
  return response.json();
}

function showStep(step) {
  ['camera', 'preview', 'waiting'].forEach(name => {
    document.getElementById('scan-step-' + name).style.display = (name === step) ? 'block' : 'none';
  });
}

/* ---------------------------------------------------------
   Camera scanning (jsQR)
   --------------------------------------------------------- */
function startCamera() {
  const video = document.getElementById('scan-video');
  const canvas = document.getElementById('scan-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const statusEl = document.getElementById('scan-status');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'Camera access is not supported on this browser. Paste the code manually below.';
    return;
  }

  function tryGetCamera(constraints) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  tryGetCamera({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      advanced: [{ focusMode: 'continuous' }]
    }
  })
    .catch(err => {
      console.warn('Camera with advanced constraints failed, retrying basic:', err.name, err.message);
      // Some phones reject unsupported 'advanced' constraints entirely (OverconstrainedError).
      // Fall back to plain facingMode-only constraints.
      return tryGetCamera({ video: { facingMode: 'environment' } });
    })
    .then(stream => {
      SCAN.stream = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', true);
      video.play();
      SCAN.active = true;
      const track = stream.getVideoTracks()[0];
      const settings = track ? track.getSettings() : {};
      statusEl.textContent = 'Camera: ' + (settings.width || '?') + 'x' + (settings.height || '?') +
        ' | jsQR loaded: ' + (window.jsQR ? 'yes' : 'NO') + ' | scanning...';
      requestAnimationFrame(tick);
    })
    .catch(err => {
      statusEl.textContent = 'Camera error: ' + err.name + ' — ' + err.message + '. Paste the code manually below.';
    });

  let frameCount = 0;

  function tick() {
    if (!SCAN.active) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frameCount++;
      if (frameCount % 30 === 0) {
        statusEl.textContent = 'Scanning... frame ' + frameCount + ' | canvas ' + canvas.width + 'x' + canvas.height +
          ' | jsQR: ' + (window.jsQR ? 'ok' : 'MISSING');
      }
      if (window.jsQR) {
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          stopCamera();
          handleScannedData(code.data);
          return;
        }
      }
    }
    requestAnimationFrame(tick);
  }
}

function stopCamera() {
  SCAN.active = false;
  if (SCAN.stream) {
    SCAN.stream.getTracks().forEach(t => t.stop());
    SCAN.stream = null;
  }
}

/* ---------------------------------------------------------
   Handle decoded QR payload
   --------------------------------------------------------- */
async function handleScannedData(raw) {
  const statusEl = document.getElementById('scan-status');
  if (statusEl) statusEl.textContent = 'Decoding...';

  const result = await apiScanVaultQr(raw.trim());
  if (!result || !result.success) {
    showToast((result && result.message) ? result.message : 'Invalid QR code.', 'error');
    if (statusEl) statusEl.textContent = 'That code could not be read. Try again or paste it manually.';
    startCamera();
    return;
  }

  if (result.isSelf) {
    showToast('Vault scanned successfully (Self-scan mode)', 'success');
  }

  SCAN.vaultInfo = result;
  renderPreview(result);
  showStep('preview');
}

function docIcon(type) {
  const map = { PDF: '📄', PNG: '🖼️', JPG: '🖼️', JPEG: '🖼️', DOCX: '📝', XLSX: '📊', PPTX: '📑' };
  return map[type] || '📁';
}

function renderPreview(info) {
  document.getElementById('scan-vault-name').textContent = info.vaultName;
  document.getElementById('scan-owner-name').textContent = 'Owned by ' + info.ownerName;

  const list = document.getElementById('scan-doc-list');
  if (!info.documents.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">📁</div><p class="text-sm">This folder has no documents yet.</p></div>';
    return;
  }
  list.innerHTML = info.documents.map(doc => {
    return '<label class="check-row">' +
      '<input type="checkbox" value="' + doc.id + '" checked>' +
      '<span>' + docIcon(doc.documentType) + ' ' + doc.documentName + '</span>' +
    '</label>';
  }).join('');
}

/* ---------------------------------------------------------
   Send request
   --------------------------------------------------------- */
async function sendRequest() {
  const info = SCAN.vaultInfo;
  const purpose = document.getElementById('scan-purpose-input').value.trim();
  const checked = Array.from(document.querySelectorAll('#scan-doc-list input[type="checkbox"]:checked')).map(el => el.value);

  if (!checked.length) {
    showToast('Select at least one document to request.', 'error');
    return;
  }

  setLoading('scan-request-btn', true, 'Sending...');

  const connResult = await apiCreateVaultConnection(info.ownerId, info.vaultId, purpose);
  if (!connResult.success) {
    setLoading('scan-request-btn', false, 'Send Request');
    showToast(connResult.message || 'Failed to reach the folder owner.', 'error');
    return;
  }

  const sessionId = connResult.request.sessionId;
  SCAN.requestIds = [];
  for (const documentId of checked) {
    const docResult = await apiCreateDocumentRequest(sessionId, documentId, purpose);
    if (docResult.success) {
      SCAN.requestIds.push(docResult.request.requestId || docResult.request._id);
    }
  }

  setLoading('scan-request-btn', false, 'Send Request');

  if (!SCAN.requestIds.length) {
    showToast('Failed to send request.', 'error');
    return;
  }

  showToast('Request sent to ' + info.ownerName + '.', 'success');
  showStep('waiting');
  pollForApproval();
}


async function pollForApproval() {
  if (SCAN.pollTimer) clearInterval(SCAN.pollTimer);

  async function tick() {
    const list = document.getElementById('scan-waiting-list');
    const rows = [];
    let anyApproved = false;
    let anyPending = false;

    for (const requestId of SCAN.requestIds) {
      const result = await apiGetDocumentRequest(requestId);
      if (!result.success) continue;
      const req = result.request;
      let badge = '<span class="badge-pending">Pending</span>';
      if (req.status === 'approved') {
        badge = '<span class="badge-approved">Approved</span>';
        anyApproved = true;
      } else if (req.status === 'denied') {
        badge = '<span class="badge-denied">Denied</span>';
      } else {
        anyPending = true;
      }

      const openBtn = req.status === 'approved'
        ? '<a class="btn btn-primary btn-sm mt-8" style="width:auto;padding:8px 14px;" href="viewer.html?requestId=' + req.requestId + '&token=' + req.accessToken + '">Open Document</a>'
        : '';

      rows.push('<div class="request-card"><div class="row-between"><span class="font-semibold text-sm">Document request</span>' + badge + '</div>' + openBtn + '</div>');
    }

    list.innerHTML = rows.join('');

    if (!anyPending) {
      clearInterval(SCAN.pollTimer);
    }
  }

  tick();
  SCAN.pollTimer = setInterval(tick, 3000);
}

/* ---------------------------------------------------------
   Setup
   --------------------------------------------------------- */
function setupScanPage() {
  if (!isAuthenticated()) {
    redirectToLogin();
    return;
  }

  startCamera();

  document.getElementById('scan-manual-btn').addEventListener('click', function() {
    const raw = document.getElementById('scan-manual-input').value.trim();
    if (!raw) {
      showToast('Paste a scanned code first.', 'error');
      return;
    }
    stopCamera();
    handleScannedData(raw);
  });

  document.getElementById('scan-request-btn').addEventListener('click', sendRequest);

  document.getElementById('scan-again-btn').addEventListener('click', function() {
    SCAN.vaultInfo = null;
    showStep('camera');
    document.getElementById('scan-status').textContent = 'Point your camera at a LockDoc folder QR code.';
    startCamera();
  });

  window.addEventListener('beforeunload', function() {
    stopCamera();
    if (SCAN.pollTimer) clearInterval(SCAN.pollTimer);
  });
}

document.addEventListener('DOMContentLoaded', setupScanPage);