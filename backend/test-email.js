/* ============================================================
   LockDoc — Email Configuration Test Script
   Run this directly to confirm your EmailJS credentials work
   BEFORE relying on the full registration flow.

   Usage:
     node test-email.js you@example.com
   ============================================================ */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { verifyEmailConfig, sendOTPEmail, isEmailConfigured } = require('./services/emailService');

async function main() {
  const recipient = process.argv[2];

  console.log('🔍 Checking backend/.env configuration...');
  console.log(`   EmailJS configured: ${isEmailConfigured() ? 'yes' : 'NO — EMAILJS_PUBLIC_KEY/SERVICE_ID/TEMPLATE_ID missing'}`);

  if (!isEmailConfigured()) {
    console.log('\n❌ Fill in EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID in backend/.env first.');
    console.log('   See backend/.env.example for step-by-step instructions.');
    process.exit(1);
  }

  await verifyEmailConfig();

  if (!recipient) {
    console.log('\nℹ️  No recipient given — skipping a live send test.');
    console.log('   Re-run as: node test-email.js you@example.com   to send a real test OTP email.');
    return;
  }

  console.log(`\n✉️  Sending a real test OTP email to ${recipient}...`);
  try {
    await sendOTPEmail(recipient, '123456', 10, 'Test User');
    console.log(`✅ Test email sent! Check the inbox (and spam folder) for ${recipient}.`);
  } catch (err) {
    console.log(`❌ Sending failed: ${err.message}`);
    console.log('\n   Most common causes:');
    console.log('   1. "Allow EmailJS API for non-browser applications" is OFF');
    console.log('      (EmailJS Dashboard -> Account -> Security).');
    console.log('   2. EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID do not match your dashboard exactly.');
    console.log('   3. EMAILJS_PUBLIC_KEY (or EMAILJS_PRIVATE_KEY, if set) is wrong.');
    process.exit(1);
  }
}

main();
