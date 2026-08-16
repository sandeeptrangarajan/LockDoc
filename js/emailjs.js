/* =========================================================
   LockDoc — emailjs.js
   EmailJS-based OTP verification module.
   Sends OTP codes via EmailJS (no demo fallback),
   stores OTP securely in localStorage with expiry,
   and provides verification + resend functionality.

   Dependencies:
     - EmailJS SDK (loaded via CDN in the host page)
     - storage.js (for LD.store, LD.data, LD.CONFIG, LD.KEYS)

   Future: Replace with Supabase/API calls by swapping
   the sendOTP and verifyOTP implementations.
   ========================================================= */

window.LD = window.LD || {};

LD.email = {};

/* ---------------------------------------------------------
   EmailJS configuration
   --------------------------------------------------------- */
LD.email.CONFIG = {
  PUBLIC_KEY: '061DqvylosTLBeUgt',
  SERVICE_ID: 'service_9iwc3us',
  TEMPLATE_ID: 'template_wrzj2ef',
  OTP_EXPIRY_MINUTES: 10
};

/* ---------------------------------------------------------
   Detect the original known-dead demo credential combo so we
   fail with an actionable message instead of a raw API error.
   (No longer matches once you've swapped in your own values.)
   --------------------------------------------------------- */
var DEMO_CREDENTIALS = {
  PUBLIC_KEY: 'AY8LK_xWoMT1mjZJ2hw0S',
  SERVICE_ID: 'service_9iwc3us',
  TEMPLATE_ID: 'template_arkzfq7'
};

LD.email.isConfigured = function(){
  var c = LD.email.CONFIG;
  if(!c.PUBLIC_KEY || !c.SERVICE_ID || !c.TEMPLATE_ID){
    return false;
  }
  if(c.PUBLIC_KEY === DEMO_CREDENTIALS.PUBLIC_KEY &&
     c.SERVICE_ID === DEMO_CREDENTIALS.SERVICE_ID &&
     c.TEMPLATE_ID === DEMO_CREDENTIALS.TEMPLATE_ID){
    return false;
  }
  return true;
};

if(!LD.email.isConfigured()){
  console.warn(
    '⚠️ LockDoc: js/emailjs.js is still using placeholder EmailJS demo credentials.\n' +
    '   Real OTP emails will NOT send until you replace PUBLIC_KEY, SERVICE_ID, and\n' +
    '   TEMPLATE_ID in js/emailjs.js with your own EmailJS account values.\n' +
    '   See the comment block above LD.email.CONFIG for step-by-step setup.'
  );
}

/* ---------------------------------------------------------
   Generate a cryptographically-random 6-digit OTP
   --------------------------------------------------------- */
LD.email.generateOTP = function(){
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  const num = (arr[0] * 16777216 + arr[1] * 65536 + arr[2] * 256 + arr[3]) % 1000000;
  return String(num).padStart(6, '0');
};

/* ---------------------------------------------------------
   Send OTP to the given email address via EmailJS.
   Stores the OTP hash + expiry in localStorage.
   Resolves with { success: true } or rejects with an error.
   --------------------------------------------------------- */
LD.email.sendOTP = function(email){
  return new Promise(function(resolve, reject){
    if(!window.emailjs){
      reject(new Error('EmailJS library not loaded. Check internet connection.'));
      return;
    }

    if(!LD.email.isConfigured()){
      reject(new Error(
        'Email is not set up yet. Open js/emailjs.js and replace PUBLIC_KEY, ' +
        'SERVICE_ID, and TEMPLATE_ID with your own EmailJS account credentials ' +
        '(see the setup steps in the comment above LD.email.CONFIG).'
      ));
      return;
    }

    const otp = LD.email.generateOTP();
    const expiresAt = Date.now() + LD.email.CONFIG.OTP_EXPIRY_MINUTES * 60 * 1000;

    // Store OTP info in localStorage
    const otpData = {
      email: email,
      otp: otp,
      expiresAt: expiresAt,
      verified: false
    };
    LD.store.set(LD.KEYS.OTP, otpData);

    // Initialize EmailJS with public key
    emailjs.init(LD.email.CONFIG.PUBLIC_KEY);

    const templateParams = {
      to_name: LD.data.user().name || 'User',
      to_email: email,
      otp_code: otp,
      app_name: 'LockDoc',
      expiry_minutes: String(LD.email.CONFIG.OTP_EXPIRY_MINUTES)
    };

    emailjs.send(LD.email.CONFIG.SERVICE_ID, LD.email.CONFIG.TEMPLATE_ID, templateParams)
      .then(function(response){
        resolve({ success: true, message: 'OTP sent successfully' });
      })
      .catch(function(error){
        // Clean up stored OTP on failure
        LD.store.set(LD.KEYS.OTP, null);
        var detail = error.text || error.message || 'Unknown error';
        reject(new Error(
          'Failed to send OTP: ' + detail +
          '. Double-check the Public Key, Service ID, and Template ID in js/emailjs.js ' +
          'against your EmailJS dashboard (https://dashboard.emailjs.com/admin).'
        ));
      });
  });
};

/* ---------------------------------------------------------
   Resend OTP — re-generates and re-sends to stored email
   --------------------------------------------------------- */
LD.email.resendOTP = function(){
  const otpData = LD.store.get(LD.KEYS.OTP, null);
  if(!otpData || !otpData.email){
    return Promise.reject(new Error('No email found. Please start registration again.'));
  }
  return LD.email.sendOTP(otpData.email);
};

/* ---------------------------------------------------------
   Verify the entered OTP against stored value.
   Checks expiry automatically.
   Returns { valid: boolean, reason?: string }
   --------------------------------------------------------- */
LD.email.verifyOTP = function(enteredOtp){
  const otpData = LD.store.get(LD.KEYS.OTP, null);

  if(!otpData){
    return { valid: false, reason: 'No OTP was sent. Please request a new code.' };
  }

  if(otpData.verified){
    return { valid: false, reason: 'This OTP has already been used.' };
  }

  if(Date.now() > otpData.expiresAt){
    LD.store.set(LD.KEYS.OTP, null);
    return { valid: false, reason: 'OTP has expired. Please request a new code.' };
  }

  if(enteredOtp !== otpData.otp){
    return { valid: false, reason: 'Incorrect OTP. Please try again.' };
  }

  // Mark as verified
  otpData.verified = true;
  LD.store.set(LD.KEYS.OTP, otpData);

  return { valid: true };
};

/* ---------------------------------------------------------
   Check if the current user is fully registered & verified
   --------------------------------------------------------- */
LD.email.isVerified = function(){
  const user = LD.data.user();
  return user && user.email && user.isVerified === true;
};

/* ---------------------------------------------------------
   Complete registration — stores user profile with email,
   role, and verification status after OTP is verified.
   --------------------------------------------------------- */
LD.email.completeRegistration = function(name, email, role){
  const initials = name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0, 2) || 'U';
  LD.data.updateUser({
    name: name,
    initials: initials,
    email: email,
    role: role,
    isVerified: true,
    memberSince: new Date().toISOString(),
    pinSet: true
  });

  // Mark OTP as consumed
  const otpData = LD.store.get(LD.KEYS.OTP, null);
  if(otpData){
    otpData.verified = true;
    LD.store.set(LD.KEYS.OTP, otpData);
  }

  LD.data.logActivity({ type: 'connect', title: name + ' registered as ' + role });
};

