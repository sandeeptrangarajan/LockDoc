/* ============================================================
   LockDoc — Approval Page Logic
   Lists pending document requests for the logged-in owner and
   lets them approve or deny each one.
   ============================================================ */

let approvalPollTimer = null;

async function apiListDocumentRequests() {
  const response = await fetch(API_BASE + '/api/requests/document', {
    method: 'GET',
    headers: authHeaders()
  });
  return response.json();
}

async function apiApproveDocument(requestId) {
  const response = await fetch(API_BASE + '/api/requests/document/' + requestId + '/approve', {
    method: 'POST',
    headers: authHeaders()
  });
  return response.json();
}

async function apiDenyDocument(requestId) {
  const response = await fetch(API_BASE + '/api/requests/document/' + requestId + '/deny', {
    method: 'POST',
    headers: authHeaders()
  });
  return response.json();
}

function renderRequests(requests) {
  const list = document.getElementById('approval-list');
  if (!requests || !requests.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">✅</div><p class="text-sm">No pending requests right now.</p></div>';
    return;
  }

  list.innerHTML = requests.map(req => {
    return '<div class="request-card" data-request-id="' + req.requestId + '">' +
      '<p class="font-semibold">' + (req.requesterName || 'Someone') + '</p>' +
      '<p class="text-muted text-sm">wants to view <strong>' + (req.documentName || 'a document') + '</strong></p>' +
      (req.purpose ? '<p class="text-faint text-xs mt-8">"' + req.purpose + '"</p>' : '') +
      '<div class="request-actions">' +
        '<button class="btn btn-primary" data-action="approve">Approve</button>' +
        '<button class="btn btn-outline" data-action="deny">Deny</button>' +
      '</div>' +
    '</div>';
  }).join('');

  list.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', async function() {
      const card = btn.closest('.request-card');
      const requestId = card.getAttribute('data-request-id');
      btn.disabled = true;
      const result = await apiApproveDocument(requestId);
      if (result.success) {
        showToast('Request approved.', 'success');
        const link = document.createElement('a');
        link.href = 'viewer.html?requestId=' + result.request.requestId + '&token=' + result.request.accessToken;
        link.className = 'btn btn-secondary mt-8';
        link.textContent = 'View Document';
        card.appendChild(link);
        card.querySelector('.request-actions').remove();
      } else {
        showToast(result.message || 'Failed to approve.', 'error');
        btn.disabled = false;
      }
    });
  });

  list.querySelectorAll('[data-action="deny"]').forEach(btn => {
    btn.addEventListener('click', async function() {
      const card = btn.closest('.request-card');
      const requestId = card.getAttribute('data-request-id');
      btn.disabled = true;
      const result = await apiDenyDocument(requestId);
      if (result.success) {
        showToast('Request denied.', 'success');
        loadRequests();
      } else {
        showToast(result.message || 'Failed to deny.', 'error');
        btn.disabled = false;
      }
    });
  });
}

async function loadRequests() {
  const result = await apiListDocumentRequests();
  if (result.success) {
    renderRequests(result.requests);
  }
}

function setupApprovalPage() {
  if (!isAuthenticated()) {
    redirectToLogin();
    return;
  }

  loadRequests();
  document.getElementById('approval-refresh-btn').addEventListener('click', loadRequests);

  approvalPollTimer = setInterval(loadRequests, 5000);
  window.addEventListener('beforeunload', function() {
    if (approvalPollTimer) clearInterval(approvalPollTimer);
  });
}

document.addEventListener('DOMContentLoaded', setupApprovalPage);
