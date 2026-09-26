# New Ark — website + CallTwin 24/7 AI receptionist

- `index.html` — the whole site (static). Hosted on Render as a static site from branch `newark-site`, publish dir `newark-site`.
- Backend: Supabase Edge Function `newark` (project `lsxdlmrjrcivxwgfkpop`), source in `supabase/newark/index.ts`.
  Tables: `newark_settings`, `newark_leads`, `newark_payments` (RLS on, service-role only).
- Voice: ElevenLabs agent `agent_0801m3dq8s8hekkamghz1nx6s4tm` with webhook tool `save_job_ticket` → edge function.
- Owner onboarding: footer → Owner portal → First-time setup (needs setup code from HSW365 Media).
