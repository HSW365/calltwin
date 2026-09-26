# New Ark: website + CallTwin 24/7 AI receptionist

Live: https://newark-ark.onrender.com (Render static site `newark-ark`, branch `newark-site`, publish dir `newark-site`).
Owner portal: https://newark-ark.onrender.com/#owner

## Pieces
- `index.html`: the whole site. Services, talk-to-Marcus voice card (ElevenLabs web SDK), booking, pay (Zelle / Cash App / Stripe pulled live from owner settings), FAQ, owner portal.
- `supabase/newark/index.ts`: Supabase Edge Function `newark` (project `lsxdlmrjrcivxwgfkpop`, verify_jwt off). Tables `newark_settings`, `newark_leads`, `newark_payments`.
- ElevenLabs agent `agent_0801m3dq8s8hekkamghz1nx6s4tm` ("Marcus"), webhook tool `save_job_ticket` -> edge function (header `x-newark-key`). Audio ulaw_8000 for phone.
- CallTwin backend (`main` branch, Render `calltwin`): `/api/inbound/voice` bridges SignalWire calls to the agent; `/api/newark/notify` texts the owner; `/api/newark/voicemail` saves voicemails; `/api/newark/status` health.

## Owner signup (open)
Owner opens `#owner` -> Set up -> name, email, cell, payout (Zelle / Cash App / Stripe link), PIN. Emails in `newark_settings.allowed_emails` need no code (Joe's + HSW365). Anyone else needs `claim_code`. PIN reset uses the same code.

## Go-live checklist for phone calls
1. ElevenLabs API key on Render `calltwin` (`ELEVENLABS_API_KEY`) must have **Agents: write** (convai_write). Current key lacks it, so calls fall back to ring-owner + voicemail.
2. `SIGNALWIRE_API_TOKEN` on Render `calltwin`. With it, the server points +1 856-594-3303 at `/api/inbound/voice` on boot and owner SMS alerts turn on.
3. Joe forwards 908-454-4043 to (856) 594-3303 (`*72 8565943303`, or `**61*18565943303#` for no-answer only).
