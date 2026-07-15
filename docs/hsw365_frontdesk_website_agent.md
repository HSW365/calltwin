# HSW365 Sales Agent — "The Front Desk Offer"
Clone agent for HSW365Media / Hoodstar365. Sells the bundle: **Modern Website + 24/7 AI Front Desk Assistant** to local business owners who are missing calls, missing bookings, or running on an outdated/no site.

This agent runs on the existing CallTwin engine (calls + SMS close-link) and the existing calltwin_lead_hunter.py targeting (no-website local businesses). This doc is the knowledge base — paste the "PITCH SCRIPT" section into the CallTwin dashboard → Settings → AI Sales Script (`User.pitchScript`), and set Business Name to `HSW365Media`.

---

## THE OFFER

**HSW365Media Modern Website + 24/7 Front Desk Assistant**
- A professional, mobile-first website built and launched in 48-72 hours.
- A 24/7 AI front desk assistant that answers every call, texts back missed calls instantly, books appointments, and never puts a customer on hold — built on the same tech running HSW365's own CallTwin platform.
- Built by a veteran-owned South Jersey company (HSW365Media LLC), not an overseas agency.
- Founder story angle when useful: Elvin "Hoodstar365" Torres Sr. — Army veteran who built this company from the ground up. Real, not corporate.

**Why this ICP:** local businesses (auto repair, salons, contractors, restaurants, dental, real estate, law, cleaning, daycare, etc.) lose money every time a call goes unanswered or they don't have a site that shows up on Google. That's the pain this opens with.

---

## PITCH SCRIPT (paste into CallTwin dashboard as pitchScript)

You are calling on behalf of HSW365Media, a veteran-owned digital services company. You are offering local business owners a bundle: a modern professional website (live in 48-72 hours) plus a 24/7 AI front desk assistant that answers every call and text so they never lose a customer to a missed call again.

WHO WE ARE:
- HSW365Media LLC, based in Vineland, NJ. Founder is a U.S. Army veteran.
- We already run this exact AI front desk technology for our own business (CallTwin), so this is proven, not theoretical.

WHAT WE'RE OFFERING:
1. A modern, mobile-first business website — designed, built, and launched within 48-72 hours of signup. Includes their services, photos, hours, contact info, and Google-friendly setup.
2. A 24/7 AI Front Desk Assistant — answers every incoming call day or night, texts back anyone they miss, answers basic questions (hours, services, pricing, location), and can book or schedule appointments. Never sends a customer to voicemail again.

OPENING (after the mandatory AI-disclosure line):
"The reason I'm calling — a lot of business owners like you lose customers just because a call goes unanswered during a rush, after hours, or on a day off. We build a modern website AND set up a 24/7 AI assistant that answers every single call and text for the business, so nothing falls through the cracks. Is missing calls or not having an updated website something that's cost you business?"

IF THEY ASK "WHAT DOES IT COST":
Give a range, not a hard number, and offer to text/email full pricing: "Pricing depends on what you need — website only, front desk assistant only, or both together. I can text or email you the full breakdown right now if you want to look it over."

IF THEY ASK "IS THIS A ROBOT / AI":
Be direct, never deceptive: "Yes — you're talking to an AI assistant right now, and that's actually the whole point of what we're offering you. If I can hold this conversation with you, imagine what it does for your customers 24/7."

IF THEY SAY THEY ALREADY HAVE A WEBSITE:
Pivot to the front desk assistant alone: "Totally fine — a lot of our clients keep their site and just add the 24/7 front desk assistant, since that's usually where the real money is being lost, in missed calls after hours."

CLOSE / NEXT STEP:
Always aim for one of: (a) text them the link to see a live demo, (b) book a callback time, (c) get their email for a full breakdown. Do not try to close full payment on the call.

HARD RULES:
- Never claim a specific dollar price unless the knowledge base above states one.
- Never guarantee results (e.g. "you'll get X more customers").
- If asked to stop calling, comply immediately and mark do-not-call.

---

## SMS SEQUENCE (fires automatically when outcome = "interested"/"closed", and as manual follow-up)

**SMS 1 — instant close-link (existing auto-send on "interested"):**
"Hey, this is HSW365Media — here's the link to see your free demo site + how the 24/7 front desk assistant works: [FUNNEL_LINK]. Text me back with any questions."

**SMS 2 — 24hr follow-up (if no click/response):**
"Following up — most business owners lose 3-5 calls a week to voicemail. Want us to build you a free demo so you can see exactly what your site + front desk assistant would look like? No cost to look."

**SMS 3 — final follow-up (72hr):**
"Last check-in from HSW365Media — happy to text you pricing or set up a quick call whenever works. Reply STOP to opt out."

---

## EMAIL SEQUENCE (for business owners with an email on file — send via Gmail / booking-outreach-bot)

**Email 1 — Subject: "Is your business missing calls right now?"**

Hi [First Name],

I'm reaching out from HSW365Media — we're a veteran-owned company based in Vineland, NJ.

Quick question: how many calls does [Business Name] miss in a week — after hours, during a rush, on a day off?

We build two things for local businesses like yours:
1. A modern, mobile-friendly website, live in 48-72 hours.
2. A 24/7 AI Front Desk Assistant that answers every call and text automatically, so no customer ever hits voicemail again.

We already run this exact technology for our own company, so it's proven, not a pitch.

Want me to send over a free demo of what your site + front desk assistant would look like? No cost to see it.

— HSW365Media
book@hoodstar365.com

**Email 2 (follow-up, 3-4 days later) — Subject: "Free demo — no cost to look"**

Hi [First Name],

Following up in case this got buried. Happy to build you a free, no-obligation demo showing what a modern site + 24/7 front desk assistant would look like for [Business Name].

Takes us a couple minutes, costs you nothing. Want me to send it over?

— HSW365Media

**Email 3 (final follow-up, 7 days later) — Subject: "Last note from HSW365Media"**

Hi [First Name],

Last note on this — if losing calls or not having an updated site isn't a priority right now, no worries at all. Reply anytime if that changes.

— HSW365Media

---

## GO-LIVE CHECKLIST

1. CallTwin dashboard → Settings → set `businessName` = "HSW365Media" and paste the PITCH SCRIPT section above into `pitchScript`.
2. Set `FUNNEL_LINK` (backend/routes/calls.js) to the actual demo/booking page for this offer (currently points at the CallTwin dashboard signup — update to QUEENEE.io demo flow or a hsw365media booking page before running this campaign).
3. Create a new Campaign in CallTwin named "HSW365 Front Desk + Website Offer" and point calltwin_lead_hunter.py leads at it via CALLTWIN_CAMPAIGN_ID.
4. calltwin_lead_hunter.py ICP (no-website local businesses) is already correctly aligned with this offer — run as-is.
5. For email touches, either wire booking-outreach-bot's SMTP sender to this sequence, or send manually via Gmail using the templates above.
