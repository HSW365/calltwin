# CallTwin Backend — Complete Rebuild

Full working backend. Every file in this package was just written and
syntax-checked — no stubs, no TODOs. This is the system that runs
24/7/365 on its own once deployed: `services/scheduler.js` checks every
5 minutes for active campaigns and dials queued leads automatically,
forever, with no human triggering anything.

## What's in here

```
backend/
├── server.js                    # wires everything together
├── package.json
├── .env.example                 # every required key, one place
├── grant_founder_access.js      # gives hsw365media@gmail.com free unlimited access
├── models/
│   ├── User.js                  # accounts, subscription, voice, pitch script
│   ├── Lead.js                  # businesses to call
│   ├── Campaign.js              # calling windows + schedule
│   └── CallLog.js               # every call + transcript + outcome
├── routes/
│   ├── auth.js                  # signup/login
│   ├── leads.js                 # add leads manually or via CSV upload
│   ├── campaigns.js             # create/list/toggle campaigns on-off
│   ├── calls.js                 # manual dial + the live call webhook loop
│   ├── voice.js                 # voice clone upload + pitch script save
│   ├── billing.js               # Stripe $20/mo checkout
│   └── webhooks.js              # Stripe webhook handler
├── middleware/
│   └── authMiddleware.js        # JWT verification
└── services/
    ├── callEngine.js            # Twilio — placing calls, sending SMS
    ├── voiceEngine.js           # ElevenLabs — cloning + text-to-speech
    ├── conversationEngine.js    # Claude — decides what to say each turn
    └── scheduler.js             # the 24/7/365 autonomous cron
```

## How a call actually flows, end to end

1. `scheduler.js` wakes up every 5 minutes, finds active campaigns
   inside their calling window, grabs queued leads, calls
   `callEngine.placeCall()`.
2. Twilio dials the lead. The moment they answer, it hits
   `POST /api/calls/twiml` — that builds the AI-disclosure opening line
   via `conversationEngine.buildOpeningLine()`, synthesizes it with
   ElevenLabs (`voiceEngine.synthesizeSpeech()`), and plays it.
3. Twilio's built-in speech recognition captures what the lead says,
   POSTs it to `/api/calls/event`.
4. `conversationEngine.getNextTurn()` asks Claude what to say next,
   using the user's saved `pitchScript` as the knowledge base, and
   classifies the outcome (continue / interested / closed /
   callback_requested / do_not_call / not_interested).
5. On "interested" or "closed" → `sendSMS()` fires the funnel link
   immediately. On "do_not_call" → the lead is flagged forever, never
   called again by this system.
6. Loop repeats until the call ends.

## Setup — do this in order

```bash
cd backend
npm install
cp .env.example .env
# fill in every value in .env — see below for where each one comes from
```

| Variable | Where to get it |
|---|---|
| `MONGO_URI` | MongoDB Atlas (free tier is fine) — Database → Connect → driver connection string |
| `JWT_SECRET` | Any long random string — generate one, doesn't need to mean anything |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → add endpoint `https://yourdomain.com/api/webhooks/stripe`, copy the signing secret |
| `CALLTWIN_PRICE_ID` | Stripe Dashboard → Product catalog → create a $20.00/mo recurring price, copy its ID |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Twilio Console |
| `ELEVENLABS_API_KEY` | ElevenLabs → Profile → API key |
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys |
| `PUBLIC_BASE_URL` | Whatever Render gives you after first deploy — set this AFTER deploying once, then redeploy |

## Deploy (gets you the real public URL Twilio needs)

Use the `render.yaml` already provided separately — push this whole
`backend/` folder to a GitHub repo, connect it on render.com as a
Blueprint, fill in the env vars it prompts for, deploy.

## After it's live

1. `node grant_founder_access.js` — prints a password, log in with that
2. In the dashboard, upload a voice sample (`POST /api/voice/clone`) —
   this is what makes `synthesizeSpeech()` use your actual voice
   instead of the generic fallback
3. Save your pitch script (`POST /api/voice/pitch-script`) — paste in
   `queenee_pitch_script.md`'s content
4. Upload leads (`POST /api/leads/upload`, CSV from
   `leads_to_calltwin.py`)
5. Create a campaign (`POST /api/campaigns`), assign leads to it,
   toggle it active (`PATCH /api/campaigns/:id/toggle`)
6. That's it. `scheduler.js` takes over from here, permanently.

## Compliance — built in, don't strip these out

- AI-disclosure opening line on every single call, no exceptions
- Automatic, permanent do-not-call flagging the moment a lead asks
- Default calling window 8am–9pm (configurable per campaign, but
  calling outside reasonable hours is how complaints happen — keep it)
- No payment is ever requested verbally on a call — always the SMS
  link to native Shopify checkout

## What I genuinely could not build for you

- An actual dashboard UI (everything above is API routes only — you'd
  hit these with curl/Postman today, or I can build a simple HTML
  dashboard next if you want one)
- Multi-timezone-aware scheduling (the calling-window check uses
  server local time — fine if you're only targeting one timezone for
  now, needs a library like `luxon` if you want this fully correct
  across the nationwide town list)
- Anything that requires your actual API keys, your GitHub account, or
  your Render account — those steps are yours, no way around it
