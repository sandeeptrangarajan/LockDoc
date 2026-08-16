/* ============================================================
   LockDoc Auth - Frontend JavaScript (v2.0)
   MongoDB + JWT API calls — /api/auth/* endpoints
   ============================================================ */

// ---- API Base URL (Dynamic) ----
const API_BASE = (function(){
  var origin = window.location.origin || '';
  return origin.indexOf('http') === 0 ? origin : 'http://localhost:5000';
})();


// ---- JWT Token Management ----
const TOKEN_KEY = 'lockdoc_jwt_token';
const USER_KEY = 'lockdoc_currentUser';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function storeUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function removeStoredUser() {
  localStorage.removeItem(USER_KEY);
}

function isAuthenticated() {
  return !!getToken() && !!getStoredUser();
}

// ---- Redirect to login, remembering where to send the user back to ----
function redirectToLogin() {
  const here = window.location.pathname.split('/').pop() + window.location.search;
  window.location.href = 'login.html?redirect=' + encodeURIComponent(here);
}

// ---- JWT Auth Header Helper ----
function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// ---- Toast System ----
function createToastContainer() {
  if (!document.querySelector('.toast-container')) {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

function showToast(message, type) {
  createToastContainer();
  const container = document.querySelector('.toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ---- Show/Hide Message Box ----
function showMessage(elementId, message, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = `message-box show ${type}`;
  el.style.display = 'block';
}

function hideMessage(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.display = 'none';
  el.className = 'message-box';
}

// ---- Set Button Loading State ----
function setLoading(btnId, isLoading, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = isLoading;
  if (isLoading) {
    btn.innerHTML = '<span class="spinner"></span> ' + text;
  } else {
    btn.textContent = text;
  }
}

// ---- OTP Input Auto-Tab ----
function setupOTPInputs() {
  const inputs = document.querySelectorAll('.otp-input-row input');
  inputs.forEach((input, index) => {
    input.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(-1);
      this.classList.toggle('filled', this.value !== '');
      if (this.value && index < 5) {
        inputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && index > 0) {
        inputs[index - 1].focus();
      }
      if (e.key === 'Enter') {
        const verifyBtn = document.getElementById('verify-otp-btn');
        if (verifyBtn && !verifyBtn.disabled) {
          verifyBtn.click();
        }
      }
    });
  });
}

function getOTPValue() {
  const inputs = document.querySelectorAll('.otp-input-row input');
  return Array.from(inputs).map(i => i.value).join('');
}

function clearOTPInputs() {
  const inputs = document.querySelectorAll('.otp-input-row input');
  inputs.forEach(i => {
    i.value = '';
    i.classList.remove('filled');
  });
  if (inputs[0]) inputs[0].focus();
}

// ---- Start OTP Timer ----
function startOTPTimer(expiresAt, timerElId, resendBtnId) {
  const timerEl = document.getElementById(timerElId);
  const resendBtn = document.getElementById(resendBtnId);

  function tick() {
    const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    timerEl.innerHTML = `Code expires in <strong>${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}</strong>`;

    if (diff <= 0) {
      clearInterval(window.otpTimerInterval);
      timerEl.textContent = 'Code expired. Request a new one.';
      if (resendBtn) resendBtn.disabled = false;
    }
  }

  if (window.otpTimerInterval) clearInterval(window.otpTimerInterval);
  tick();
  window.otpTimerInterval = setInterval(tick, 1000);

  // Enable resend after 30 seconds
  if (resendBtn) {
    resendBtn.disabled = true;
    setTimeout(() => {
      if (resendBtn) resendBtn.disabled = false;
    }, 30000);
  }
}

// ============================================================
// API CALLS — /api/auth/* endpoints
// ============================================================

/**
 * Step 1: Register (send OTP)
 * POST /api/auth/register
 */
async function apiRegister(fullName, email, password, role) {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, email, password, role })
  });
  return response.json();
}

/**
 * Step 2: Verify OTP and complete registration
 * POST /api/auth/verify-otp
 */
async function apiVerifyOTP(email, otp) {
  const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  });
  return response.json();
}

/**
 * Login — returns JWT token
 * POST /api/auth/login
 */
async function apiLogin(email, password) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return response.json();
}

/**
 * Logout (destroys session server-side)
 * POST /api/auth/logout
 */
async function apiLogout() {
  const response = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: authHeaders()
  });
  return response.json();
}

/**
 * Get profile (requires JWT)
 * GET /api/auth/profile
 */
async function apiGetProfile() {
  const response = await fetch(`${API_BASE}/api/auth/profile`, {
    method: 'GET',
    headers: authHeaders()
  });
  return response.json();
}

/**
 * Send OTP for password reset / new device
 * POST /api/auth/send-otp
 */
async function apiSendOTP(email, type = 'password_reset') {
  const response = await fetch(`${API_BASE}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, type })
  });
  return response.json();
}

/**
 * Reset password with OTP
 * POST /api/auth/reset-password
 */
async function apiResetPassword(email, otp, newPassword) {
  const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, newPassword })
  });
  return response.json();
}

