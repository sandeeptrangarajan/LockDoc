/* ============================================================
   LockDoc — Email Service via EmailJS API
   Sends OTP / welcome / password-reset emails through EmailJS's
   HTTP API (https://api.emailjs.com/api/v1.0/email/send).

   Required in backend/.env:
     EMAILJS_PUBLIC_KEY    - Account -> General -> Public Key
     EMAILJS_SERVICE_ID    - Email Services -> your service
     EMAILJS_TEMPLATE_ID   - Email Templates -> your template

   Optional (recommended for server-side calls):
     EMAILJS_PRIVATE_KEY   - Account -> General -> Private Key
                             Sent as `accessToken` so EmailJS can
                             authenticate a non-browser request.

   IMPORTANT — EmailJS blocks server calls by default:
     EmailJS's public API is designed for browser calls and, out
     of the box, rejects requests that don't come from a browser
     origin. To call it from Node you MUST enable this first:
       EmailJS Dashboard -> Account -> Security ->
       "Allow EmailJS API for non-browser applications" (turn ON)
     Without this, every send will fail with a 403 error even if
     all three IDs above are correct.

   Your EmailJS template must define these variables so the
   values below actually show up in the sent email:
     {{to_name}} {{to_email}} {{otp_code}} {{app_name}} {{expiry_minutes}}
   ============================================================ */
const https = require('https');

const EMAILJS_API_HOST = 'api.emailjs.com';
const EMAILJS_SEND_PATH = '/api/v1.0/email/send';

/** Read + trim the three required EmailJS env vars. */
function getConfig() {
  return {
    publicKey: (process.env.EMAILJS_PUBLIC_KEY || '').trim(),
    serviceId: (process.env.EMAILJS_SERVICE_ID || '').trim(),
    templateId: (process.env.EMAILJS_TEMPLATE_ID || '').trim(),
    privateKey: (process.env.EMAILJS_PRIVATE_KEY || '').trim() // optional
  };
}

/**
 * Is enough config present in .env to attempt sending?
 */
function isEmailConfigured() {
  const { publicKey, serviceId, templateId } = getConfig();
  return Boolean(publicKey && serviceId && templateId);
}

/**
 * Describe which required fields are missing, for debugging.
 */
function getMissingConfig() {
  const { publicKey, serviceId, templateId } = getConfig();
  const missing = [];
  if (!publicKey) missing.push('EMAILJS_PUBLIC_KEY');
  if (!serviceId) missing.push('EMAILJS_SERVICE_ID');
  if (!templateId) missing.push('EMAILJS_TEMPLATE_ID');
  return missing.join(', ');
}

/**
 * Translate EmailJS's raw HTTP error text into an actionable message.
 */
function describeEmailError(statusCode, rawBody) {
  const body = (rawBody || '').toString().trim();
  if (statusCode === 403) {
    return `EmailJS rejected the request (403): "${body}". ` +
      'If that message mentions "non-browser applications", enable it at ' +
      'Account -> Security. If it mentions the Public Key, Service ID, Template ID, ' +
      'or a blocked/restricted domain, the cause is that instead — the exact reason is in the quotes above.';
  }
  if (statusCode === 400) {
    return `EmailJS rejected the request as invalid (400): ${body}. ` +
      'Double check EMAILJS_SERVICE_ID and EMAILJS_TEMPLATE_ID match your dashboard exactly.';
  }
  if (statusCode === 401) {
    return `EmailJS rejected the credentials (401): "${body}". Check EMAILJS_PUBLIC_KEY ` +
      '(and EMAILJS_PRIVATE_KEY, if set) against Account -> General in your dashboard.';
  }
  return `EmailJS API error (${statusCode}): ${body}`;
}

/**
 * Low-level call to EmailJS's send endpoint. Always uses the
 * configured env values — never hardcoded literals — so changing
 * .env actually changes what gets sent.
 */
function sendEmailJS(templateParams) {
  return new Promise((resolve, reject) => {
    const { publicKey, serviceId, templateId, privateKey } = getConfig();

    if (!publicKey || !serviceId || !templateId) {
      reject(new Error(`EmailJS not configured. Missing: ${getMissingConfig()}`));
      return;
    }

    const body = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: templateParams
    };
    // Private Key lets EmailJS authenticate a server-side (non-browser)
    // request more strictly; include it only if the user configured one.
    if (privateKey) {
      body.accessToken = privateKey;
    }

    const payload = JSON.stringify(body);
    const options = {
      hostname: EMAILJS_API_HOST,
      path: EMAILJS_SEND_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, message: 'Email sent successfully' });
        } else {
          reject(new Error(describeEmailError(res.statusCode, data)));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`EmailJS request failed: ${err.message}`));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Verify EmailJS configuration is present. (EmailJS's API has no
 * lightweight "ping" endpoint, so this checks config completeness;
 * use test-email.js to confirm an actual send works end-to-end.)
 */
async function verifyEmailConfig() {
  if (!isEmailConfigured()) {
    console.warn('⚠️  EmailJS not configured — missing in backend/.env: ' + getMissingConfig());
    console.warn('   OTPs will NOT be sent. See backend/.env.example for setup.');
    return false;
  }
  const { serviceId, privateKey } = getConfig();
  console.log(`✅ EmailJS configured (Service: ${serviceId}${privateKey ? ', using Private Key' : ''})`);
  console.log('   Run "node test-email.js you@example.com" to confirm a real send works.');
  return true;
}

/**
 * Send an OTP email to the user via EmailJS.
 */
async function sendOTPEmail(email, otpCode, expiryMinutes = 10, userName = 'LockDoc User') {
  if (!isEmailConfigured()) {
    throw new Error(`EmailJS not configured. Missing: ${getMissingConfig()}`);
  }
  try {
    return await sendEmailJS({
      to_name: userName,
      to_email: email,
      otp_code: otpCode,
      app_name: 'LockDoc',
      expiry_minutes: String(expiryMinutes)
    });
  } catch (err) {
    console.error(`❌ Failed to send OTP email to ${email}:`, err.message);
    throw err;
  }
}

/**
 * Send a welcome email after successful registration via EmailJS.
 * Non-critical: failures are logged but not thrown.
 */
async function sendWelcomeEmail(email, userName) {
  if (!isEmailConfigured()) {
    console.warn('⚠️ Welcome email not sent — EmailJS not configured');
    return;
  }
  try {
    return await sendEmailJS({
      to_name: userName,
      to_email: email,
      otp_code: 'VERIFIED',
      app_name: 'LockDoc',
      expiry_minutes: ''
    });
  } catch (err) {
    console.warn('⚠️ Welcome email failed (non-critical):', err.message);
  }
}

/**
 * Send a password reset OTP email via EmailJS.
 */
async function sendPasswordResetEmail(email, otpCode, expiryMinutes = 10, userName = 'LockDoc User') {
  if (!isEmailConfigured()) {
    throw new Error(`EmailJS not configured. Missing: ${getMissingConfig()}`);
  }
  try {
    return await sendEmailJS({
      to_name: userName,
      to_email: email,
      otp_code: otpCode,
      app_name: 'LockDoc',
      expiry_minutes: String(expiryMinutes)
    });
  } catch (err) {
    console.error(`❌ Failed to send password reset email to ${email}:`, err.message);
    throw err;
  }
}

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  isEmailConfigured,
  verifyEmailConfig
};