// New Ark x CallTwin backend — Supabase Edge Function "newark"
// Public info, web leads, AI phone-agent leads (ElevenLabs webhook tool), payment notices,
// open owner signup (name / email / cell + Stripe / Zelle / Cash App payout), owner dashboard,
// settings, status updates, and owner SMS alerts through the CallTwin backend (SignalWire).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SALT = "newark-calltwin-2026";
const CALLTWIN = Deno.env.get("CALLTWIN_URL") ?? "https://calltwin.onrender.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-newark-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const clip = (v: unknown, n = 500) => (v == null ? null : String(v).trim().slice(0, n) || null);
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const e164 = (v: unknown) => {
  const d = digits(v);
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return null;
};
async function hash(pin: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + ":" + pin));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function settings() {
  const { data } = await db.from("newark_settings").select("*").eq("id", 1).single();
  return data;
}
async function authed(pin: unknown) {
  const s = await settings();
  if (!s?.admin_pin || typeof pin !== "string" || pin.length < 4) return null;
  return (await hash(pin)) === s.admin_pin ? s : null;
}
const publicView = (s: any) => ({
  claimed: !!s?.admin_pin,
  business_name: s?.business_name ?? "New Ark",
  business_phone: s?.business_phone,
  ai_enabled: s?.ai_enabled,
  pay: {
    preferred: s?.payout_method, zelle: s?.zelle_handle, cashapp: s?.cashapp_tag,
    stripe: s?.stripe_link, zelle_name: s?.owner_name,
  },
});
const ownerView = (s: any) => ({
  business_name: s.business_name, owner_name: s.owner_name, owner_email: s.owner_email, owner_cell: s.owner_cell,
  payout_method: s.payout_method, zelle_handle: s.zelle_handle, cashapp_tag: s.cashapp_tag, stripe_link: s.stripe_link,
  business_phone: s.business_phone, ai_enabled: s.ai_enabled, alert_sms: s.alert_sms, claimed_at: s.claimed_at,
});
function settingsPatch(b: any) {
  const p: Record<string, unknown> = {};
  for (const k of ["business_name", "owner_name", "owner_email", "owner_cell", "zelle_handle", "cashapp_tag", "stripe_link", "business_phone"]) {
    if (k in b) p[k] = clip(b[k], 200);
  }
  if (p.owner_email) p.owner_email = String(p.owner_email).toLowerCase();
  if (p.cashapp_tag) p.cashapp_tag = "$" + String(p.cashapp_tag).replace(/^\$+/, "");
  if (p.stripe_link && !/^https:\/\//i.test(String(p.stripe_link))) p.stripe_link = null;
  if ("payout_method" in b) p.payout_method = ["zelle", "cashapp", "stripe"].includes(b.payout_method) ? b.payout_method : null;
  if (typeof b.ai_enabled === "boolean") p.ai_enabled = b.ai_enabled;
  if (typeof b.alert_sms === "boolean") p.alert_sms = b.alert_sms;
  p.updated_at = new Date().toISOString();
  return p;
}
function payoutProblem(p: Record<string, unknown>) {
  const m = p.payout_method;
  if (!m) return "Pick how you want to get paid: Zelle, Cash App or Stripe.";
  if (m === "zelle" && !p.zelle_handle) return "Enter the email or phone your Zelle is registered to.";
  if (m === "cashapp" && !p.cashapp_tag) return "Enter your Cash App $cashtag.";
  if (m === "stripe" && !p.stripe_link) return "Paste your Stripe payment link (starts with https://).";
  return null;
}

// Text the owner through the CallTwin backend (SignalWire). Never blocks the caller.
async function textOwner(s: any, body: string) {
  try {
    const to = e164(s?.owner_cell);
    if (!to || s?.alert_sms === false || !s?.hook_key) return false;
    const r = await fetch(`${CALLTWIN}/api/newark/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-newark-key": s.hook_key },
      body: JSON.stringify({ to, body: body.slice(0, 1400) }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
function leadText(row: any) {
  const tag = row.urgency === "Emergency" ? "EMERGENCY " : "";
  return [
    `${tag}New Ark ${row.source === "phone" ? "call" : "web request"}: ${row.name ?? "Unknown"} ${row.phone ?? ""}`.trim(),
    [row.service, row.urgency].filter(Boolean).join(" / "),
    row.address,
    row.summary || row.details,
    row.phone ? `Call back: tel:${digits(row.phone)}` : null,
  ].filter(Boolean).join("\n");
}
async function saveLead(row: any, s: any) {
  const { data, error } = await db.from("newark_leads").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  const sent = await textOwner(s, leadText(row));
  if (sent) await db.from("newark_leads").update({ notified: true }).eq("id", data.id);
  return data.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") return json(publicView(await settings()));
    const b = await req.json().catch(() => ({}));
    const a = b.a ?? b.action;

    // ---- Server-to-server calls (ElevenLabs tool + CallTwin backend) ----
    const hk = req.headers.get("x-newark-key");
    if (hk) {
      const s = await settings();
      if (hk !== s?.hook_key) return json({ ok: false, error: "Bad key." }, 401);
      if (a === "owner_contact") {
        return json({ ok: true, owner_cell: e164(s.owner_cell), ai_enabled: s.ai_enabled !== false, business_name: s.business_name });
      }
      const row = {
        source: "phone", name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 160),
        service: clip(b.service, 80), urgency: clip(b.urgency, 40), address: clip(b.address, 300),
        preferred_date: clip(b.preferred_time, 120), details: clip(b.details, 2000), summary: clip(b.summary, 2000),
        conversation_id: clip(b.conversation_id, 120),
      };
      await saveLead(row, s);
      return json({
        ok: true,
        message: row.urgency === "Emergency"
          ? "Saved and the owner has been alerted by text. Tell the caller a technician is being dispatched and they will get a call back within minutes."
          : "Saved. The owner has the job ticket and will call the customer back to confirm a time.",
      });
    }

    switch (a) {
      case "public":
        return json(publicView(await settings()));

      case "lead": {
        if (b.website) return json({ ok: true, ticket: "NA-000000" }); // honeypot
        const row = {
          source: "web", name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 160),
          service: clip(b.service, 80), urgency: clip(b.urgency, 40), address: clip(b.address, 300),
          preferred_date: clip(b.preferred_date, 60), details: clip(b.details, 2000),
        };
        if (!row.name || digits(row.phone).length < 10) return json({ ok: false, error: "Name and a 10-digit phone number are required." }, 400);
        const id = await saveLead(row, await settings());
        return json({ ok: true, ticket: "NA-" + id.slice(0, 6).toUpperCase() });
      }

      case "pay": {
        const amt = Number(b.amount);
        const method = ["zelle", "cashapp", "stripe"].includes(b.method) ? b.method : null;
        if (!clip(b.customer_name) || !method || !(amt > 0) || amt > 100000)
          return json({ ok: false, error: "Name, a payment method and a valid amount are required." }, 400);
        const { data, error } = await db.from("newark_payments").insert({
          customer_name: clip(b.customer_name, 120), customer_phone: clip(b.customer_phone, 40),
          customer_email: clip(b.customer_email, 160), invoice_ref: clip(b.invoice_ref, 60),
          amount: Math.round(amt * 100) / 100, method,
        }).select("id").single();
        if (error) return json({ ok: false, error: error.message }, 500);
        const s = await settings();
        await textOwner(s, `New Ark payment notice: ${clip(b.customer_name, 60)} says they sent $${amt.toFixed(2)} by ${method}${b.invoice_ref ? " for " + clip(b.invoice_ref, 40) : ""}. Confirm it in your owner portal.`);
        return json({ ok: true, receipt: "PAY-" + data.id.slice(0, 6).toUpperCase() });
      }

      // Open signup: owner enters name, email, cell and payout. Emails on the allow list need no code.
      case "claim": {
        const s = await settings();
        if (s?.admin_pin) return json({ ok: false, error: "This business is already set up. Sign in with your PIN." }, 409);
        const email = String(b.owner_email ?? "").trim().toLowerCase();
        const allowed = (s?.allowed_emails ?? []).map((e: string) => e.toLowerCase());
        const codeOk = String(b.claim_code ?? "").trim().toUpperCase() === s?.claim_code;
        if (!allowed.includes(email) && !codeOk)
          return json({ ok: false, need_code: true, error: "That email isn't on file for this business. Use the email you gave HSW365 Media, or enter your setup code." }, 403);
        if (!/^\d{6,10}$/.test(String(b.pin ?? ""))) return json({ ok: false, error: "Choose a PIN of 6 to 10 digits." }, 400);
        if (!clip(b.owner_name) || !email || !e164(b.owner_cell))
          return json({ ok: false, error: "Name, email and a 10-digit cell number are required." }, 400);
        const patch = settingsPatch(b);
        const bad = payoutProblem(patch);
        if (bad) return json({ ok: false, error: bad }, 400);
        Object.assign(patch, { admin_pin: await hash(String(b.pin)), claimed_at: new Date().toISOString(), ai_enabled: true });
        const { error } = await db.from("newark_settings").update(patch).eq("id", 1);
        if (error) return json({ ok: false, error: error.message }, 500);
        const texted = await textOwner({ ...s, ...patch },
          `CallTwin is live for ${patch.business_name ?? s.business_name ?? "your business"}. Every call is answered 24/7 and each new job is texted to this number. Owner portal: https://newark-ark.onrender.com/#owner`);
        return json({ ok: true, texted });
      }

      // PIN reset with the setup code from HSW365 Media.
      case "reset": {
        const s = await settings();
        if (String(b.claim_code ?? "").trim().toUpperCase() !== s?.claim_code)
          return json({ ok: false, error: "That setup code doesn't match." }, 403);
        if (!/^\d{6,10}$/.test(String(b.pin ?? ""))) return json({ ok: false, error: "Choose a PIN of 6 to 10 digits." }, 400);
        await db.from("newark_settings").update({ admin_pin: await hash(String(b.pin)), updated_at: new Date().toISOString() }).eq("id", 1);
        return json({ ok: true });
      }

      case "login": {
        const s = await authed(b.pin);
        if (!s) return json({ ok: false, error: "Wrong PIN." }, 401);
        const [leads, pays] = await Promise.all([
          db.from("newark_leads").select("*").order("created_at", { ascending: false }).limit(300),
          db.from("newark_payments").select("*").order("created_at", { ascending: false }).limit(300),
        ]);
        return json({ ok: true, settings: ownerView(s), leads: leads.data ?? [], payments: pays.data ?? [] });
      }

      case "update": {
        const s = await authed(b.pin);
        if (!s) return json({ ok: false, error: "Wrong PIN." }, 401);
        const patch = settingsPatch(b.settings ?? {});
        const bad = payoutProblem({ ...ownerView(s), ...patch });
        if (bad) return json({ ok: false, error: bad }, 400);
        if ("owner_cell" in patch && !e164(patch.owner_cell)) return json({ ok: false, error: "Enter a 10-digit cell number." }, 400);
        const { error } = await db.from("newark_settings").update(patch).eq("id", 1);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true });
      }

      case "test_alert": {
        const s = await authed(b.pin);
        if (!s) return json({ ok: false, error: "Wrong PIN." }, 401);
        const ok = await textOwner({ ...s, alert_sms: true }, "CallTwin test: job alerts for New Ark will arrive at this number.");
        return json({ ok, error: ok ? undefined : "Text alerts aren't connected on the phone server yet. Jobs still land in this portal." });
      }

      case "status": {
        if (!(await authed(b.pin))) return json({ ok: false, error: "Wrong PIN." }, 401);
        const table = b.table === "payments" ? "newark_payments" : "newark_leads";
        const allowed = table === "newark_payments" ? ["pending", "received", "refunded"] : ["new", "contacted", "booked", "done", "lost"];
        if (!allowed.includes(b.status)) return json({ ok: false, error: "Invalid status." }, 400);
        const { error } = await db.from(table).update({ status: b.status }).eq("id", b.id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true });
      }
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
