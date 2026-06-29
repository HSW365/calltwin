# QUEENEE 24/7 Virtual Front Desk — Deploy Guide

This is the real backend behind the "QUEENEE.io — AI Virtual Front Desk Setup" product
you're already selling on hsw365.co for $399. It answers calls, has a live AI conversation
with the caller, qualifies the lead (name, reason, callback time), texts YOU the second a
lead is captured, and logs every call to MongoDB.

## What it does on a real call
1. Phone rings → Twilio hits this server → AI greets the caller out loud.
2. Caller talks → Twilio transcribes it → sent to Claude → Claude replies → spoken back.
3. Loop continues until name + reason + callback time are captured (or 8 turns max, so a
   call can never run forever and burn Twilio minutes).
4. The moment a lead qualifies, you get a text message with the summary.
5. Every call is logged. Visit `/leads` on your live URL any time to see qualified leads as JSON.

## Step 1 — Push this code to GitHub
I can't push to your GitHub directly (no write access configured). Fastest way:
1. Go to github.com → New repository → name it `queenee-assistant` → Public or Private, doesn't matter.
2. On the new repo page, click "uploading an existing file."
3. Drag in every file from this folder (keep the `routes/` and `services/` folders intact).
4. Commit directly to `main`.

## Step 2 — Deploy on Render (same pattern as your CallTwin service)
1. Render dashboard → New → Web Service.
2. Connect the `queenee-assistant` repo, branch `main`.
3. Language: **Node**
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Instance type: Free is fine to test, but see the warning below before you go live.

## Step 3 — Add Environment Variables on Render
Copy every key from `.env.example` into Render's Environment tab and fill in real values:
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — from your Twilio console
- `TWILIO_PHONE_NUMBER` — your existing business number, in `+1XXXXXXXXXX` format
- `OWNER_PHONE_NUMBER` — your cell, where lead alerts get texted
- `ANTHROPIC_API_KEY` — your Claude API key
- `MONGODB_URI` — same Atlas cluster as CallTwin, just use a different db name in the path
  (already set to `queenee-assistant` in the example)
- `BUSINESS_NAME`, `BUSINESS_DESCRIPTION`, `GREETING` — customize per the client you're setting
  this up for (right now this is single-tenant: one deployment = one business's front desk)

## Step 4 — Point your Twilio number at this server
1. Twilio console → Phone Numbers → your number → Voice Configuration.
2. "A call comes in" → Webhook → paste: `https://YOUR-RENDER-URL.onrender.com/voice/incoming`
3. HTTP method: POST. Save.

## Step 5 — Set up the email-answering half (SendGrid Inbound Parse)
This is the one piece that needs a DNS change — and DNS is at GoDaddy, which is your registrar,
so this part's on you (or tell me the records and I'll walk you through pasting them in).

1. Sign up for SendGrid (free tier covers this easily) and grab an API key.
2. SendGrid console → Settings → Inbound Parse → Add Host & URL.
   - Subdomain: something like `mail` (so the address becomes `frontdesk@mail.queenee.io`)
   - Destination URL: `https://YOUR-RENDER-URL.onrender.com/email/incoming`
3. SendGrid will show you an MX record to add. Go to GoDaddy DNS for queenee.io (or hsw365.co,
   whichever domain you want this on) and add that MX record exactly as shown.
4. In SendGrid → Sender Authentication, verify `SENDGRID_FROM_ADDRESS` as a sender (single
   sender verification is fastest, full domain auth is better long-term).
5. Add `SENDGRID_API_KEY`, `SENDGRID_FROM_ADDRESS`, `OWNER_EMAIL_ADDRESS` to Render's env vars.
6. Have anyone wanting to reach the AI front desk email `frontdesk@mail.queenee.io` (or whatever
   subdomain you picked). Real-world deployment: you'd set this as the contact address on the
   QUEENEE site / business listing, not ask customers to know a weird subdomain.

### How the email side behaves
- **Leads & simple support questions** → AI replies automatically, no human involved.
- **Billing issues, complaints, anything sensitive** → AI does NOT auto-send. It logs a holding
  reply that would have been sent, and emails YOU instead so a human handles it. This is
  intentional — auto-replying to an angry customer or a legal threat is how you make things worse.
- **Spam / unclear** → logged, no reply sent, no alert spam to you.
- Check everything that came in any time at `https://YOUR-RENDER-URL.onrender.com/emails`

## Step 6 — Test it
Call your Twilio number from your own phone. Talk to it like a real customer. Confirm:
- It greets you
- It responds to what you say
- It eventually asks for a callback time
- You get a text the moment it qualifies you as a lead

Then send a test email to your new inbound address and confirm you get an auto-reply (or an
escalation alert if you word it like a complaint).

## ⚠️ Free tier warning (same issue as CallTwin)
Render's free instances spin down after inactivity and take 10-30 seconds to wake up on the
next request. If a real customer calls while the service is asleep, the call may ring dead air
or fail before the wake-up completes. **Before you sell this to a paying QUEENEE client, upgrade
this Render service to a paid instance** — incoming calls can't wait for a cold start the way
a cron job can.

## Known limitation — single business per deployment right now
This version is built to answer for ONE business at a time, configured via env vars. When you
start selling this to multiple QUEENEE clients, each client needs either their own Render
deployment (simple, more cost) or we extend this to look up the business profile by the `To`
phone number on each call and serve multiple businesses off one deployment (cheaper, more code).
Tell me which way you want to scale it once the first one is live and working.
