# CallTwin — HSW365 24/7 AI Receptionist

CallTwin is the HSW365 business communication platform for turning missed calls into captured leads, appointments, routed conversations and follow-up.

The repository already contains the production architecture: Node/Express backend, MongoDB persistence, authentication, lead management, campaigns, voice handling, Stripe billing, webhooks, legal pages and a browser dashboard.

## Product model

- **CallTwin setup:** $500 one-time launch offer, independent of the website product.
- **Service tier:** recurring service is sized by business size, call volume and requested capabilities.
- **QUEENEE:** separate HSW365 website-building product. CallTwin can be sold alone or bundled with a QUEENEE website.

## Architecture

```text
Business owner
     |
     +--> CallTwin website / signup
     |
     +--> Stripe checkout
     |
     +--> Dashboard
             |
             +--> Business profile / auth
             +--> Leads + CSV import
             +--> Campaigns
             +--> Calls / SMS
             +--> Voice receptionist
             +--> Billing

Customer call
     |
     v
Telephony provider
     |
     v
/api/voice/*
     |
     +--> conversation engine
     +--> business knowledge / pitch script
     +--> lead capture
     +--> call logging
     +--> escalation / follow-up
     |
     v
MongoDB + dashboard
```

## Repository layout

- `index.html` — public sales page / demo
- `dashboard/` — authenticated customer dashboard
- `backend/server.js` — API/server entry point
- `backend/routes/auth.js` — signup/login
- `backend/routes/leads.js` — lead management + CSV import
- `backend/routes/campaigns.js` — campaigns
- `backend/routes/calls.js` — calling/SMS actions
- `backend/routes/voice.js` — voice assistant and configuration
- `backend/routes/billing.js` — Stripe checkout
- `backend/routes/webhooks.js` — Stripe webhook handling
- `backend/services/conversationEngine.js` — AI conversation behavior
- `backend/services/scheduler.js` — scheduled jobs
- `backend/routes/legal.js` — privacy + terms
- `render.yaml` — Render deployment configuration

## Local development

```bash
cd backend
npm install
cp .env.example .env
npm start
```

The API health endpoint is:

```text
GET /health
```

## Render deployment

The repository Blueprint uses `backend/` as the Node service root, installs dependencies with `npm install`, starts with `npm start`, and checks `GET /health`.

Before production, configure all required secrets in Render. Never commit real API keys, MongoDB credentials, JWT secrets or Stripe webhook secrets.

### Required production configuration

- `MONGO_URI`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CALLTWIN_PRICE_ID` (recurring service price, if using the subscription checkout)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `ELEVENLABS_API_KEY` (when voice cloning/TTS is enabled)
- `ANTHROPIC_API_KEY`
- `PUBLIC_BASE_URL`

After Render supplies the public URL, set `PUBLIC_BASE_URL` to that exact HTTPS URL and redeploy.

## Production rule

Do not advertise a provider-free live calling experience until the selected telephony provider and voice/TTS configuration have been connected and tested. The sales layer is provider-neutral, but production calls still require a configured voice provider.

## Launch checklist

1. Deploy the backend on Render.
2. Confirm `GET /health` returns JSON.
3. Confirm MongoDB connects successfully.
4. Configure Stripe webhook to `/api/webhooks/stripe`.
5. Configure the CallTwin phone number to the production `/api/voice/...` endpoint required by the voice route.
6. Test inbound call → AI response → lead capture → dashboard.
7. Test SMS actions and opt-out behavior.
8. Test Stripe checkout and webhook activation.
9. Run a real-world test from a second phone before selling the deployment.
10. Upgrade the Render service before relying on it for production calls so cold starts do not interrupt callers.
