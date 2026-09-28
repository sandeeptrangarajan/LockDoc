/* ============================================================
   LockDoc — Vault Detail Page Logic
   Shows a single folder's QR code and lets the owner manage the
   documents stored inside it (add / rename / delete).
   ============================================================ */

function getVaultIdFromUrl() {
  return new URLSearchParams(window.location.search).get('vaultId');
}

async function apiGetVault(vaultId) {
  const response = await fetch(API_BASE + '/api/vaults/' + vaultId, {
    method: 'GET',
    headers: authHeaders()
  });
  return response.json();
}

async function apiGetVaultQr(vaultId) {
  const response = await fetch(API_BASE + '/api/vaults/' + vaultId + '/qrcode', {
    method: 'GET',
    headers: authHeaders()
  });
  return response.json();
}

async function apiRegenerateVaultQr(vaultId) {
  const response = await fetch(API_BASE + '/api/vaults/' + vaultId + '/qrcode/regenerate', {
    method: 'POST',
    headers: authHeaders()
  });
  return response.json();
}

async function apiAddDocuments(vaultId, formData) {
  const response = await fetch(API_BASE + '/api/vaults/' + vaultId + '/documents', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body: formData
  });
  return response.json();
}

async function apiRenameDocument(vaultId, documentId, documentName) {
  const response = await fetch(API_BASE + '/api/vaults/' + vaultId + '/documents/' + documentId, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ documentName })
  });
  return response.json();
}

async function apiDeleteDocument(vaultId, documentId) {
  const response = await fetch(API_BASE + '/api/vaults/' + vaultId + '/documents/' + documentId, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return response.json();
}

function docIcon(type) {
  const map = { PDF: '📄', PNG: '🖼️', JPG: '🖼️', JPEG: '🖼️', DOCX: '📝', XLSX: '📊', PPTX: '📑' };
  return map[type] || '📁';
}

function renderDocuments(vaultId, documents) {
  const list = document.getElementById('vd-doc-list');
  if (!documents || !documents.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">📁</div><p class="text-sm">No documents in this folder yet.</p></div>';
    return;
  }
  list.innerHTML = documents.map(doc => {
    const docId = doc._id || doc.id;
    return '<div class="doc-row" data-doc-id="' + docId + '">' +
      '<div class="doc-icon">' + docIcon(doc.documentType) + '</div>' +
      '<div class="doc-info" style="cursor:pointer;" onclick="window.location.href=\'viewer.html?doc=' + docId + '\'"><p>' + doc.documentName + '</p><p class="text-faint text-xs">' + doc.documentType + ' · ' + new Date(doc.uploadDate).toLocaleDateString() + '</p></div>' +
      '<div class="doc-actions">' +
        '<a class="icon-btn" href="viewer.html?doc=' + docId + '" title="View Document">👁️</a>' +
        '<button class="icon-btn" data-action="rename" title="Rename">✏️</button>' +
        '<button class="icon-btn danger" data-action="delete" title="Delete">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');

  list.querySelectorAll('[data-action="rename"]').forEach(btn => {
    btn.addEventListener('click', async function() {
      const row = btn.closest('.doc-row');
      const docId = row.getAttribute('data-doc-id');
      const currentName = row.querySelector('.doc-info p').textContent;
      const newName = prompt('Rename document', currentName);
      if (!newName || !newName.trim() || newName.trim() === currentName) return;
      const result = await apiRenameDocument(vaultId, docId, newName.trim());
      if (result.success) {
        showToast('Document renamed.', 'success');
        loadVault(vaultId);
      } else {
        showToast(result.message || 'Rename failed.', 'error');
      }
    });
  });

  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async function() {
      const row = btn.closest('.doc-row');
      const docId = row.getAttribute('data-doc-id');
      if (!confirm('Delete this document? This cannot be undone.')) return;
      const result = await apiDeleteDocument(vaultId, docId);
      if (result.success) {
        showToast('Document deleted.', 'success');
        loadVault(vaultId);
      } else {
        showToast(result.message || 'Delete failed.', 'error');
      }
    });
  });
}

async function loadQr(vaultId) {
  const box = document.getElementById('vd-qr-box');
  box.innerHTML = '<div class="spinner dark"></div>';
  const result = await apiGetVaultQr(vaultId);
  if (result.success) {
    box.innerHTML = '<img src="' + result.qr.qrImage + '" alt="Folder QR code">';
  } else {
    box.innerHTML = '<p class="text-muted text-sm">Unable to load QR code.</p>';
  }
}

async function loadVault(vaultId) {
  const result = await apiGetVault(vaultId);
  if (!result.success) {
    showToast(result.message || 'Unable to load folder.', 'error');
    return;
  }
  document.getElementById('vd-vault-name').textContent = result.vault.vaultName;
  document.getElementById('vd-vault-category').textContent = result.vault.category + ' folder';
  renderDocuments(vaultId, result.documents);
}

function setupVaultDetailPage() {
  if (!isAuthenticated()) {
    redirectToLogin();
    return;
  }

  const vaultId = getVaultIdFromUrl();
  if (!vaultId) {
    window.location.href = 'vault.html';
    return;
  }

  loadVault(vaultId);
  loadQr(vaultId);

  document.getElementById('vd-regenerate-btn').addEventListener('click', async function() {
    if (!confirm('Regenerate this folder\'s QR code? The old code will stop working immediately.')) return;
    setLoading('vd-regenerate-btn', true, 'Regenerating...');
    const result = await apiRegenerateVaultQr(vaultId);
    setLoading('vd-regenerate-btn', false, 'Regenerate QR');
    if (result.success) {
      showToast('QR code regenerated.', 'success');
      loadQr(vaultId);
    } else {
      showToast(result.message || 'Failed to regenerate QR.', 'error');
    }
  });

  const fileInput = document.getElementById('vd-file-input');
  document.getElementById('vd-add-btn').addEventListener('click', function() {
    fileInput.click();
  });

  fileInput.addEventListener('change', async function(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach(file => formData.append('documents', file));

    setLoading('vd-add-btn', true, 'Uploading...');
    const result = await apiAddDocuments(vaultId, formData);
    setLoading('vd-add-btn', false, '+ Add');
    fileInput.value = '';

    if (result.success) {
      showToast('Documents added.', 'success');
      loadVault(vaultId);
    } else {
      showToast(result.message || 'Upload failed.', 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', setupVaultDetailPage);
