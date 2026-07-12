const express = require('express');
const router = express.Router();

const PAGE_STYLE = `
  <style>
    body { background:#0a0a0f; color:#e5e5e5; font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
           max-width:740px; margin:0 auto; padding:48px 24px 80px; line-height:1.65; }
    h1 { font-family:'Barlow Condensed',sans-serif; font-size:32px; color:#fff; margin-bottom:4px; }
    .updated { color:#888; font-size:13px; margin-bottom:32px; }
    h2 { color:#22d3ee; font-size:19px; margin-top:32px; }
    p, li { color:#c9c9c9; font-size:15px; }
    a { color:#22d3ee; }
    .contact { background:#141419; border:1px solid #2a2a33; border-radius:10px; padding:16px 20px; margin-top:32px; }
  </style>
`;

router.get('/privacy', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><title>CallTwin Privacy Policy</title>${PAGE_STYLE}</head><body>
    <h1>Privacy Policy</h1>
    <div class="updated">Last updated: ${new Date().toISOString().slice(0, 10)}</div>

    <p>CallTwin ("we," "us," "our") provides an AI-powered phone receptionist and appointment
    scheduling service for small businesses. This policy explains what information we collect
    and how we use it, including text messaging (SMS) data.</p>

    <h2>Information We Collect</h2>
    <ul>
      <li>Business account information you provide when signing up (name, email, phone number)</li>
      <li>Customer contact information provided by our business customers for scheduling purposes</li>
      <li>Call recordings and transcripts processed to provide the AI receptionist service</li>
      <li>Appointment details (date, time, service requested)</li>
    </ul>

    <h2>SMS / Text Messaging</h2>
    <p>If you provide a mobile phone number, you may receive text messages related to appointment
    scheduling, confirmations, and reminders. <strong>Message frequency varies. Message and data
    rates may apply.</strong> Text <strong>HELP</strong> to a CallTwin number for assistance, or
    <strong>STOP</strong> at any time to opt out of future messages.</p>
    <p>No mobile information will be shared with third parties or affiliates for marketing or
    promotional purposes. All other categories exclude text messaging originator opt-in data and
    consent; this information will not be shared with any third parties.</p>

    <h2>How We Use Information</h2>
    <ul>
      <li>To provide, operate, and improve the CallTwin service</li>
      <li>To send appointment confirmations and reminders via SMS or email</li>
      <li>To respond to support requests</li>
    </ul>

    <h2>Data Retention & Security</h2>
    <p>Call and message data is retained only as long as needed to provide the service, and is
    stored using industry-standard security practices. We do not sell personal information.</p>

    <h2>Your Rights</h2>
    <p>You may request deletion of your data at any time by contacting us below. Business
    customers can delete their account and associated data from account settings.</p>

    <div class="contact">
      Questions about this policy? Contact <a href="mailto:hsw365media@gmail.com">hsw365media@gmail.com</a>
      or call (856) 796-8081.
    </div>
  </body></html>`);
});

router.get('/terms', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><title>CallTwin Terms & Conditions</title>${PAGE_STYLE}</head><body>
    <h1>Terms &amp; Conditions</h1>
    <div class="updated">Last updated: ${new Date().toISOString().slice(0, 10)}</div>

    <p>By using CallTwin, you agree to the following terms.</p>

    <h2>The Service</h2>
    <p>CallTwin provides an AI-powered phone receptionist and appointment scheduling tool for
    small businesses. We may update or change features of the service at any time.</p>

    <h2>SMS Terms</h2>
    <p>By opting in, you agree to receive text messages related to appointment scheduling,
    confirmations, and reminders from CallTwin. <strong>Message frequency varies based on your
    appointment activity. Message and data rates may apply.</strong></p>
    <ul>
      <li>Reply <strong>STOP</strong> to a CallTwin message at any time to opt out</li>
      <li>Reply <strong>HELP</strong> for assistance, or contact hsw365media@gmail.com</li>
      <li>Carriers are not liable for delayed or undelivered messages</li>
    </ul>

    <h2>Account Responsibilities</h2>
    <p>You are responsible for the accuracy of information provided to CallTwin, including
    customer contact details used for scheduling communications, and for obtaining any consent
    required from your own customers before providing their information to our service.</p>

    <h2>Payment</h2>
    <p>Subscription fees are billed as described at signup. You may cancel at any time; fees
    already billed are non-refundable except as required by law.</p>

    <h2>Limitation of Liability</h2>
    <p>CallTwin is provided "as is." We are not liable for missed appointments, scheduling
    errors, or indirect damages arising from use of the service.</p>

    <h2>Changes</h2>
    <p>We may update these terms from time to time. Continued use of CallTwin after changes
    constitutes acceptance of the updated terms.</p>

    <div class="contact">
      Questions? Contact <a href="mailto:hsw365media@gmail.com">hsw365media@gmail.com</a>
      or call (856) 796-8081.
    </div>
  </body></html>`);
});

module.exports = router;
