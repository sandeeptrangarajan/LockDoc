/* ============================================================
   LockDoc — Vault Page Logic
   Handles vault dashboard state, document selection, preview,
   and upload flow for authenticated users.
   ============================================================ */

async function apiCreateVault(formData) {
  const response = await fetch(API_BASE + '/api/vaults/create', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + getToken()
    },
    body: formData
  });
  return response.json();
}

async function apiGetMyVaults() {
  const response = await fetch(API_BASE + '/api/vaults/me', {
    method: 'GET',
    headers: authHeaders()
  });
  return response.json();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = 2;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function renderSelectedFiles(files) {
  const list = document.getElementById('selected-documents-list');
  list.innerHTML = files.map(file => {
    return '<div class="row-between" style="padding:.75rem 0;border-bottom:1px solid var(--border);">' +
      '<div><p class="font-semibold">' + file.name + '</p><p class="text-muted text-xs">' + file.type + '</p></div>' +
      '<span class="text-faint text-xs">' + formatBytes(file.size) + '</span>' +
    '</div>';
  }).join('');
}

function renderVaults(vaults) {
  const container = document.getElementById('vault-list');
  if (!container) return;
  if (!vaults || !vaults.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📁</div><p class="text-sm">No vaults yet. Upload documents to create your first vault.</p></div>';
    return;
  }
  container.innerHTML = vaults.map(vault => {
    return '<div class="card clickable mt-8" style="padding:16px;" onclick="window.location.href=\'vault-detail.html?vaultId=' + vault._id + '\'">' +
      '<div class="row-between"><div><p class="font-semibold">' + vault.vaultName + '</p><p class="text-muted text-xs">' + vault.category + '</p></div>' +
      '<span class="badge">' + vault.documentCount + ' Documents</span></div>' +
      '<p class="text-faint text-xs mt-8">Created: ' + new Date(vault.createdAt).toLocaleString() + ' · Tap to view QR &amp; manage</p>' +
    '</div>';
  }).join('');
}

function showQrModal(qr, vaultName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal-box">' +
      '<h3>Folder QR — ' + (vaultName || '') + '</h3>' +
      '<div class="qr-box"><img src="' + qr.qrImage + '" alt="Vault QR code"></div>' +
      '<p class="text-muted text-sm">Anyone who scans this code can request access to the documents in this folder. You approve or deny each request.</p>' +
      '<button class="btn btn-primary mt-16" id="qr-modal-close-btn">Done</button>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('qr-modal-close-btn').addEventListener('click', function() {
    overlay.remove();
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

async function loadVaults() {
  try {
    const result = await apiGetMyVaults();
    if (result.success) {
      document.getElementById('vault-status-count').textContent = result.vaults.reduce((sum, v) => sum + v.documentCount, 0) + ' Documents';
      document.getElementById('vault-status-message').textContent = result.vaults.length === 0 ? 'No documents uploaded yet.' : 'Your vaults are ready.';
      renderVaults(result.vaults);
    } else {
      document.getElementById('vault-status-message').textContent = 'Unable to load vault status.';
    }
  } catch (err) {
    console.error(err);
    document.getElementById('vault-status-message').textContent = 'Unable to load vault status.';
  }
}

function logout() {
  apiLogout().catch(() => {});
  removeToken();
  removeStoredUser();
  window.location.href = 'login.html';
}

function setupVaultPage() {
  if (!isAuthenticated()) {
    redirectToLogin();
    return;
  }

  const user = getStoredUser();
  document.getElementById('vault-user-avatar').textContent = (user.fullName || 'User').split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('vault-user-name').textContent = user.fullName || '—';
  document.getElementById('vault-user-email').textContent = user.email || '—';
  const roleEl = document.getElementById('vault-profile-role');
  if (roleEl) {
    roleEl.textContent = 'Account Type: ' + (user.role || 'holder');
  }

  document.getElementById('vault-logout-btn').addEventListener('click', logout);

  const fileInput = document.getElementById('vault-file-input');
  const browseBtn = document.getElementById('browse-documents-btn');
  const uploadCard = document.getElementById('upload-preview-card');
  const uploadBtn = document.getElementById('upload-documents-btn');
  let selectedFiles = [];

  browseBtn.addEventListener('click', function() {
    fileInput.click();
  });

  fileInput.addEventListener('change', function(event) {
    selectedFiles = Array.from(event.target.files).filter(file => {
      return ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(file.type);
    });

    if (!selectedFiles.length) {
      showToast('No valid documents were selected.', 'error');
      return;
    }

    renderSelectedFiles(selectedFiles);
    uploadCard.style.display = 'block';
  });

  uploadBtn.addEventListener('click', async function() {
    const vaultName = document.getElementById('vault-name-input').value.trim();
    const category = document.getElementById('vault-category-select').value;

    if (!vaultName) {
      showToast('Please enter a vault name.', 'error');
      return;
    }
    if (!selectedFiles.length) {
      showToast('Select at least one document.', 'error');
    }

    const formData = new FormData();
    formData.append('vaultName', vaultName);
    formData.append('category', category);
    selectedFiles.forEach(file => formData.append('documents', file));

    setLoading('upload-documents-btn', true, 'Uploading...');
    const result = await apiCreateVault(formData);
    setLoading('upload-documents-btn', false, 'Upload Documents');

    if (result.success) {
      showToast('Vault created successfully.', 'success');
      uploadCard.style.display = 'none';
      fileInput.value = '';
      document.getElementById('vault-name-input').value = '';
      selectedFiles = [];
      await loadVaults();
      if (result.qr) {
        showQrModal(result.qr, vaultName);
      }
    } else {
      showToast(result.message || 'Upload failed.', 'error');
    }
  });

  loadVaults();
}

document.addEventListener('DOMContentLoaded', setupVaultPage);
