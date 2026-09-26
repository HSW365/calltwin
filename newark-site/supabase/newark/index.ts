// New Ark x CallTwin backend — Supabase Edge Function "newark"
// Handles: public info, web leads, AI phone-agent leads (ElevenLabs webhook),
// payment notices, owner signup (claim), owner dashboard, settings + status updates.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SALT = "newark-calltwin-2026";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-newark-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const clip = (v: unknown, n = 500) => (v == null ? null : String(v).trim().slice(0, n) || null);
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
  business_phone: s?.business_phone,
  ai_enabled: s?.ai_enabled,
  pay: { zelle: s?.zelle_handle, cashapp: s?.cashapp_tag, stripe: s?.stripe_link, zelle_name: s?.owner_name },
});
const ownerView = (s: any) => ({
  owner_name: s.owner_name, owner_email: s.owner_email, owner_cell: s.owner_cell,
  zelle_handle: s.zelle_handle, cashapp_tag: s.cashapp_tag, stripe_link: s.stripe_link,
  business_phone: s.business_phone, ai_enabled: s.ai_enabled, claimed_at: s.claimed_at,
});
const settingsPatch = (b: any) => {
  const p: Record<string, unknown> = {};
  for (const k of ["owner_name", "owner_email", "owner_cell", "zelle_handle", "cashapp_tag", "stripe_link", "business_phone"]) {
    if (k in b) p[k] = clip(b[k], 200);
  }
  if (typeof b.ai_enabled === "boolean") p.ai_enabled = b.ai_enabled;
  if (p.stripe_link && !/^https:\/\//i.test(String(p.stripe_link))) p.stripe_link = null;
  p.updated_at = new Date().toISOString();
  return p;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") return json(publicView(await settings()));
    const b = await req.json().catch(() => ({}));
    const a = b.a ?? b.action;

    // ---- Lead from the AI phone agent (ElevenLabs webhook tool) ----
    const hk = req.headers.get("x-newark-key");
    if (hk && hk === (await settings())?.hook_key) {
      const row = {
        source: "phone", name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 160),
        service: clip(b.service, 80), urgency: clip(b.urgency, 40), address: clip(b.address, 300),
        preferred_date: clip(b.preferred_time, 120), details: clip(b.details, 2000), summary: clip(b.summary, 2000),
      };
      const { error } = await db.from("newark_leads").insert(row);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, message: "Saved. Dispatch has the job ticket and will call the customer back to confirm." });
    }

    switch (a) {
      case "public":
        return json(publicView(await settings()));

      case "lead": {
        if (b.website) return json({ ok: true }); // honeypot
        const row = {
          source: "web", name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 160),
          service: clip(b.service, 80), urgency: clip(b.urgency, 40), address: clip(b.address, 300),
          preferred_date: clip(b.preferred_date, 60), details: clip(b.details, 2000),
        };
        if (!row.name || !row.phone) return json({ ok: false, error: "Name and phone are required." }, 400);
        const { data, error } = await db.from("newark_leads").insert(row).select("id").single();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, ticket: "NA-" + data.id.slice(0, 6).toUpperCase() });
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
        return json({ ok: true, receipt: "PAY-" + data.id.slice(0, 6).toUpperCase() });
      }

      case "claim": {
        const s = await settings();
        if (s?.admin_pin) return json({ ok: false, error: "This account is already set up. Sign in with your PIN." }, 409);
        if (String(b.claim_code ?? "").trim().toUpperCase() !== s?.claim_code)
          return json({ ok: false, error: "That setup code doesn't match. Check the code from HSW365 Media." }, 403);
        if (!/^\d{6,10}$/.test(String(b.pin ?? ""))) return json({ ok: false, error: "Choose a PIN of 6 to 10 digits." }, 400);
        if (!clip(b.owner_name) || !clip(b.owner_email) || !clip(b.owner_cell))
          return json({ ok: false, error: "Name, email and cell are required." }, 400);
        const patch = { ...settingsPatch(b), admin_pin: await hash(String(b.pin)), claimed_at: new Date().toISOString() };
        const { error } = await db.from("newark_settings").update(patch).eq("id", 1);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true });
      }

      case "login": {
        const s = await authed(b.pin);
        if (!s) return json({ ok: false, error: "Wrong PIN." }, 401);
        const [leads, pays] = await Promise.all([
          db.from("newark_leads").select("*").order("created_at", { ascending: false }).limit(200),
          db.from("newark_payments").select("*").order("created_at", { ascending: false }).limit(200),
        ]);
        return json({ ok: true, settings: ownerView(s), leads: leads.data ?? [], payments: pays.data ?? [] });
      }

      case "update": {
        if (!(await authed(b.pin))) return json({ ok: false, error: "Wrong PIN." }, 401);
        const { error } = await db.from("newark_settings").update(settingsPatch(b.settings ?? {})).eq("id", 1);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true });
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
    return json({ ok: false, error: String(e) }, 500);
  }
});
