# HSW365 AI ESTIMATE — CallTwin add-on

Turns a customer call, text, email or web request into a priced, editable estimate and a proposal the customer can sign and pay a deposit on — with the business owner in control of every price and every send.

```
CUSTOMER CALL -> AI INTAKE -> JOB ANALYSIS -> ESTIMATE -> OWNER APPROVAL -> PROPOSAL -> E-SIGN -> DEPOSIT -> SCHEDULED JOB
```

Lives inside the CallTwin backend (same Render service, same MongoDB) under `backend/estimate/`, mounted at `/api/estimates`. It has no hard dependency on CallTwin beyond the `Client` tenant record, so it can be lifted into its own service later.

## Pages (GitHub Pages, repo root)

| Page | Who | Link |
|---|---|---|
| `estimate.html` | Owner and team | `https://hsw365.github.io/calltwin/estimate.html?k=<portalKey>` (also linked from `portal.html`). Team members get `?t=<key>`. |
| `proposal.html` | Customer | Sent by text/email when the owner sends a proposal. |
| `request.html` | Customer | `?c=<intakeKey>` website request form (embeddable); `?p=<token>` photo upload link. |

## Safety rules (enforced in code)

- **AI never prices anything.** The model is never shown prices; any price it writes is scrubbed (`ai.js/sanitize`). All money comes from `pricing.js` using the owner's rates, price book, markups and fees.
- **No invented facts.** SKUs, labor keys and service templates are accepted only if they exist in the owner's data. Quantities/hours are kept only when stated by the customer or defined by an owner template; everything else is tagged `assumed`, shown in yellow, and must be confirmed.
- **Unpriced or unquantified lines block approval.** An AI-suggested item that isn't in the price book stays unpriced until the owner prices or removes it.
- **Human approval before sending.** `send` requires `approve`; any edit after approval clears it. Customers only ever see the snapshot that was approved and sent.
- **Audit trail.** `EstimateAudit` records AI output (provider, model, raw sanitized result), every human edit as a line-item diff, sends, views, customer questions, signatures (IP + user agent), payments and settings changes.

## Data model (MongoDB)

- `EstimateSettings` (1 per business): add-on status/billing, company profile + brand color + logo, pricing rules (tax, markups, service call, minimum, travel, emergency fee + labor %, after-hours, deposit %), labor rates, price book, service templates, discounts, terms/warranty/payment terms, follow-up templates, automation toggles, team members (hashed keys), Stripe Connect account.
- `EstimateJob`: status pipeline, source, customer (phone/email/address AES-256-GCM encrypted; phone HMAC for SMS threading), intake fields, AI analysis, estimate (line items in cents, totals, version, approval), proposal (hashed token, snapshot, views, events, signature, follow-ups), payment, schedule.
- `EstimatePhoto`: uploaded photos/PDFs (5 MB each, 20 per job).
- `EstimateAudit`: append-only trail.

Statuses: `new → drafting → ready → sent → viewed → (changes_requested) → approved → deposit_paid → scheduled → completed` (or `declined` / `lost`).

## Roles

| Role | Can |
|---|---|
| owner (portal key) | everything, incl. billing and team |
| manager | everything except billing and team |
| estimator | leads, analysis, edit estimates (cannot approve/send) |
| tech | add leads, notes, photos; cannot see pricing |

## API

See the header of `routes.js` for the full list. Owner calls send `x-portal-key` (or `x-team-key`). Public customer routes live under `/public/*` and are rate limited.

## Environment variables

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | AI analysis. `ESTIMATE_AI_PROVIDER=openai\|anthropic` to choose; models via `ESTIMATE_OPENAI_MODEL`, `ESTIMATE_ANTHROPIC_MODEL`. With no key, a rule-based analysis runs (restates facts, flags gaps, matches templates by keyword). |
| `ESTIMATE_ENC_KEY` | Key for customer PII encryption (falls back to `JWT_SECRET`). Set it once and never change it. |
| `ESTIMATE_ADDON_PRICE_CENTS` | Add-on monthly price (default `4900`). |
| `ESTIMATE_TRIAL_DAYS` | Add-on trial length (default `14`). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Add-on subscription + customer deposits (existing CallTwin keys). |
| `ESTIMATE_PLATFORM_DEPOSITS=true` | Only for HSW365's own use: allow deposits into the platform Stripe account when the business hasn't connected its own. Leave unset for client businesses. |
| `SENDGRID_API_KEY`, `ESTIMATE_FROM_EMAIL`, `ESTIMATE_FROM_NAME` | Email delivery (optional; SMS works without it). |
| `ESTIMATE_INBOUND_DOMAIN` | Domain configured in SendGrid Inbound Parse to POST to `/api/estimates/inbound/email`; leads arrive at `est+<intakeKey>@domain`. |
| `CALLTWIN_SITE` | Where the HTML pages are hosted (default `https://hsw365.github.io/calltwin`). |

SMS uses the existing SignalWire variables. New client numbers get their SMS webhook set to `/api/estimates/inbound/sms` automatically; for existing numbers set it in SignalWire.

## Stripe webhook events

Add to the existing webhook endpoint (`/api/webhooks/stripe`): `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` (already used by CallTwin). For Connect deposits no extra events are needed — the checkout session is created on the platform with `transfer_data.destination`.

## Tests

```
cd backend && npm install && npm test
```

Unit tests cover the pricing engine and AI sanitizer; `e2e.test.js` runs the whole call → proposal → signature → deposit → schedule flow, tenant isolation and role checks against an in-memory MongoDB.
