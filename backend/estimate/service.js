/**
 * Estimate add-on business logic shared by routes, the CallTwin lead hook and the scheduler.
 */
const cron = require("node-cron");
const axios = require("axios");
const { EstimateSettings, EstimateJob, EstimatePhoto, EstimateAudit } = require("./models");
const { seal, open, newToken, hashToken, phoneHash } = require("./secure");
const { applyRules, computeTotals, autoFees, money } = require("./pricing");
const { analyzeJob } = require("./ai");

const SITE = () => (process.env.CALLTWIN_SITE || "https://hsw365.github.io/calltwin").replace(/\/$/, "");
const TRIAL_DAYS = () => Number(process.env.ESTIMATE_TRIAL_DAYS || 14);
const COMP_EMAILS = ["hsw365media@gmail.com", "hoodstarent365@gmail.com"];
const { PROMOS, promoFor } = require("../services/promos");
/** Apply a business's custom deal to the Estimate add-on once. estimate:"comp" = free; else trialDays starts a trial. */
function applyPromo(client, s) {
  const p = promoFor(client);
  if (!p || !s || s.licensed) return false;
  if (p.estimate === "comp") { if (s.status === "comp" && s.promo === p.id) return false; s.promo = p.id; s.status = "comp"; return true; }
  if (!p.trialDays || s.promo === p.id || s.status === "comp") return false;
  s.promo = p.id;
  if (["off", "canceled", "trial"].includes(s.status)) { s.status = "trial"; s.trialEndsAt = new Date(Date.now() + p.trialDays * 864e5); }
  return true;
}
const e164 = (n) => {
  const d = String(n || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return null;
};
const clip = (v, n = 500) => (v == null ? "" : String(v).trim().slice(0, n));
const lid = () => Math.random().toString(36).slice(2, 10);
const kindOf = (book) => (book && book.kind === "equipment" ? "equipment" : book && book.kind === "fee" ? "fee" : book && book.kind === "service" ? "custom" : "material");

const DEFAULT_FOLLOWUPS = [
  { afterHours: 24, sms: "Hi {customer}, it's {business}. Just checking you got your estimate for {service} ({total}). View and approve here: {link}", emailSubject: "Your estimate from {business}", email: "Hi {customer},\n\nJust making sure you received your estimate for {service}. The total is {total}.\n\nYou can view it, ask a question, or approve it here:\n{link}\n\nThank you,\n{business}" },
  { afterHours: 72, sms: "Hi {customer}, {business} here. Any questions on your {service} estimate? Reply here or open: {link}", emailSubject: "Questions about your estimate?", email: "Hi {customer},\n\nDo you have any questions about your {service} estimate? You can reply to this email or request changes directly from the estimate page:\n{link}\n\n{business}" },
  { afterHours: 168, sms: "Hi {customer}, last check-in from {business} on your {service} estimate. It's still here when you're ready: {link}", emailSubject: "Your estimate is still available", email: "Hi {customer},\n\nThis is a final follow-up on your {service} estimate. It's still available whenever you're ready:\n{link}\n\n{business}" },
];

// ---------------- settings ----------------
async function getSettings(client, { create = true } = {}) {
  let s = await EstimateSettings.findOne({ client: client._id });
  const ownerComp = client.status === "comp" || COMP_EMAILS.includes(String(client.ownerEmail || "").toLowerCase().trim());
  if (s && ownerComp && s.status !== "comp") { s.status = "comp"; await s.save(); } // owner accounts always have full access
  if (!s && create) {
    const comp = client.status === "comp" || COMP_EMAILS.includes(String(client.ownerEmail || "").toLowerCase());
    s = await EstimateSettings.create({
      client: client._id,
      status: comp ? "comp" : "off",
      intakeKey: newToken(16),
      company: { name: client.businessName || "", phone: client.businessPhone || "", email: client.ownerEmail || "", address: client.city || "" },
      laborRates: [],
      followUps: { enabled: true, steps: DEFAULT_FOLLOWUPS },
      terms: "This estimate is based on the information available at the time it was prepared. Hidden conditions discovered during the work may require a change order, which will be approved by you before any additional work is done.",
      warranty: "",
      paymentTerms: "Deposit due at approval to schedule the work. Balance due on completion.",
    });
  }
  if (s && applyPromo(client, s)) { await s.save(); await audit(client._id, null, "system", "addon.promo_applied", { promo: s.promo, trialEndsAt: s.trialEndsAt });
    if (client.toolId && process.env.NODE_ENV !== "test") setImmediate(() => { try { const { updateTool, updateAgent } = require("../services/provision"); updateTool(client).then(() => updateAgent(client)).catch(() => {}); } catch (_) {} }); // teach the AI receptionist to collect estimate details
  }
  return s;
}

function startTrial(settings) {
  if (settings.status === "comp" || settings.status === "active") return settings;
  settings.status = "trial";
  settings.trialEndsAt = new Date(Date.now() + TRIAL_DAYS() * 864e5);
  return settings;
}

// ---------------- audit ----------------
function audit(clientId, jobId, actor, action, detail, ip) {
  return EstimateAudit.create({ client: clientId, job: jobId || null, actor, action, detail: detail || null, ip: ip || "" })
    .catch((e) => console.error("[estimate] audit:", e.message));
}

// ---------------- jobs ----------------
async function nextNumber(settings) {
  const s = await EstimateSettings.findOneAndUpdate({ _id: settings._id }, { $inc: { counter: 1 } }, { new: true });
  return `${s.prefix || "EST"}-${s.counter}`;
}

function searchKey(name, service, phone) {
  return [name, service, String(phone || "").replace(/\D/g, "").slice(-4)].filter(Boolean).join(" ").toLowerCase().slice(0, 300);
}

function customerOf(job) {
  return { name: job.customer.name, phone: open(job.customer.phone), email: open(job.customer.email), address: open(job.customer.address) };
}

async function createJob(client, settings, data, actor, ip) {
  const phone = e164(data.phone) || clip(data.phone, 40);
  const job = await EstimateJob.create({
    client: client._id,
    number: await nextNumber(settings),
    source: data.source || "manual",
    lead: data.lead || null,
    customer: { name: clip(data.name, 120), phone: seal(phone), email: seal(clip(data.email, 160).toLowerCase()), address: seal(clip(data.address, 300)), phoneHash: phoneHash(phone) },
    search: searchKey(clip(data.name, 120), clip(data.service, 120), phone),
    service: clip(data.service, 160),
    problem: clip(data.problem, 3000),
    urgency: clip(data.urgency, 40),
    afterHours: !!data.afterHours,
    measurements: clip(data.measurements, 2000),
    materialsNeeded: clip(data.materialsNeeded, 2000),
    laborNotes: clip(data.laborNotes, 2000),
    notes: clip(data.notes, 3000),
    preferredTime: clip(data.preferredTime, 160),
    callSummary: clip(data.callSummary, 3000),
    messages: data.message ? [{ from: "customer", channel: data.source || "manual", text: clip(data.message, 2000) }] : [],
    estimate: { depositPct: settings.pricing.defaultDepositPct || 0 },
  });
  await audit(client._id, job._id, actor, "job.created", { source: job.source, number: job.number }, ip);
  return job;
}

/** Turn an AI analysis into draft line items priced ONLY from the owner's rules. */
function draftLineItems(settings, job) {
  const a = job.analysis || {};
  const items = [];
  const tpl = (settings.services || []).find((s) => s.name === a.serviceTemplate);
  const usedSkus = new Set();
  if (tpl) {
    if (tpl.laborHours != null || tpl.laborKey) {
      items.push({ id: lid(), kind: "labor", description: `Labor — ${tpl.name}`, laborKey: tpl.laborKey || "", qty: tpl.laborHours, unit: "hour", origin: "service_template", basis: "template" });
    }
    for (const it of tpl.items || []) {
      const book = (settings.priceBook || []).find((b) => b.sku === it.sku);
      if (!book) continue;
      usedSkus.add(it.sku);
      items.push({ id: lid(), kind: kindOf(book), description: book.name, sku: book.sku, qty: it.qty, unit: book.unit, origin: "service_template", basis: "template" });
    }
  }
  for (const m of a.materials || []) {
    if (m.sku && usedSkus.has(m.sku)) continue;
    const book = m.sku ? (settings.priceBook || []).find((b) => b.sku === m.sku) : null;
    items.push({
      id: lid(), kind: book ? kindOf(book) : "material",
      description: book ? book.name : m.name, sku: book ? book.sku : "", qty: m.qty, unit: m.unit || (book && book.unit) || "each",
      origin: book ? "price_book" : "ai_suggested", basis: m.basis === "stated" ? "stated" : m.basis === "template" ? "template" : "assumed",
      aiNote: [m.note, book ? "" : "Not in your price book — set a price or remove"].filter(Boolean).join(" · "),
    });
  }
  const hasTemplateLabor = items.some((i) => i.kind === "labor");
  if (!hasTemplateLabor) {
    for (const l of a.labor || []) {
      items.push({ id: lid(), kind: "labor", description: l.task, laborKey: l.laborKey || "", qty: l.hours, unit: "hour", origin: "ai_suggested", basis: l.basis === "stated" ? "stated" : l.basis === "template" ? "template" : "assumed", aiNote: l.note || (l.hours == null ? "Hours not known — enter your estimate" : "") });
    }
  }
  for (const f of autoFees(settings, job)) items.push(f);
  return applyRules(settings, items, job);
}

function recompute(settings, job) {
  job.estimate.lineItems = applyRules(settings, job.estimate.lineItems.map((x) => (x.toObject ? x.toObject() : x)), job);
  job.estimate.totals = computeTotals(settings, job.estimate, job);
  job.markModified("estimate.totals");
  return job.estimate.totals;
}

async function runAnalysis(client, settings, job, actor = "system") {
  job.analysis.status = "running"; job.analysis.error = "";
  if (job.status === "new") job.status = "drafting";
  await job.save();
  try {
    const photos = await EstimatePhoto.find({ client: client._id, job: job._id }).sort({ createdAt: 1 }).limit(4);
    const { provider, model, result, moneyScrubbed } = await analyzeJob({ job, settings, customer: customerOf(job), photos });
    Object.assign(job.analysis, result, { status: "done", provider, model, at: new Date(), error: "" });
    const hadItems = (job.estimate.lineItems || []).length > 0;
    if (!hadItems) {
      job.estimate.lineItems = draftLineItems(settings, job);
      const tpl = (settings.services || []).find((s) => s.name === result.serviceTemplate);
      job.estimate.scope = (result.scope || []).map((s) => `• ${s}`).join("\n");
      job.estimate.timeline = (tpl && tpl.timeline) || settings.defaultTimeline || "";
      job.estimate.terms = settings.terms || "";
      job.estimate.warranty = settings.warranty || "";
      job.estimate.paymentTerms = settings.paymentTerms || "";
      job.estimate.validUntil = new Date(Date.now() + (settings.pricing.validDays || 30) * 864e5);
      job.proposal.overview = result.summary || "";
    }
    recompute(settings, job);
    if (["new", "drafting"].includes(job.status)) job.status = "ready";
    await job.save();
    await audit(client._id, job._id, `ai:${provider}`, "analysis.completed", { model, result, draftedItems: hadItems ? 0 : job.estimate.lineItems.length, moneyScrubbed: !!moneyScrubbed, requestedBy: actor });
    return job;
  } catch (e) {
    job.analysis.status = "failed";
    job.analysis.error = String(e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message).slice(0, 400);
    if (job.status === "drafting") job.status = "ready";
    if (!(job.estimate.lineItems || []).length) { job.estimate.lineItems = applyRules(settings, autoFees(settings, job), job); recompute(settings, job); }
    await job.save();
    await audit(client._id, job._id, "system", "analysis.failed", { error: job.analysis.error });
    return job;
  }
}

// ---------------- messaging ----------------
function sms() { return require("../routes/newark"); }
async function sendSms(to, body) {
  const num = e164(to);
  if (!num || !sms().smsReady()) return false;
  try { await sms().sendSms(num, String(body).slice(0, 1400)); return true; } catch (e) { console.error("[estimate] sms:", e.message); return false; }
}
function emailReady() { return !!(process.env.SENDGRID_API_KEY && process.env.ESTIMATE_FROM_EMAIL); }
async function sendEmail(to, subject, text, replyTo) {
  if (!emailReady() || !/@/.test(to || "")) return false;
  try {
    await axios.post("https://api.sendgrid.com/v3/mail/send", {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.ESTIMATE_FROM_EMAIL, name: process.env.ESTIMATE_FROM_NAME || "Estimates" },
      reply_to: replyTo && /@/.test(replyTo) ? { email: replyTo } : undefined,
      subject: String(subject).slice(0, 200),
      content: [{ type: "text/plain", value: String(text).slice(0, 20000) }],
    }, { headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` }, timeout: 15000 });
    return true;
  } catch (e) { console.error("[estimate] email:", e.response ? e.response.status : e.message); return false; }
}

function fill(tpl, vars) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

function proposalLink(job) { return `${SITE()}/proposal.html?t=${open(job.proposal.tokenSealed)}`; }
function ownerLink(client, jobId) { return `${SITE()}/estimate.html?k=${client.portalKey}${jobId ? "#job=" + jobId : ""}`; }

function msgVars(client, settings, job) {
  const c = customerOf(job);
  return {
    customer: (c.name || "there").split(" ")[0],
    business: settings.company.name || client.businessName,
    service: job.service || "your project",
    total: money(job.estimate.totals && job.estimate.totals.totalCents),
    deposit: money(job.estimate.totals && job.estimate.totals.depositCents),
    link: proposalLink(job),
    number: job.number,
  };
}

async function notifyOwner(client, settings, text) {
  if (settings && settings.notifyOwnerSms === false) return false;
  if (client.alertSms === false) return false;
  return sendSms(client.ownerCell, text);
}

// ---------------- CallTwin hook ----------------
/** Called after CallTwin's AI receptionist saves a job ticket. Never throws. */
async function fromCallTwinLead(client, lead, extra = {}) {
  try {
    const settings = await getSettings(client, { create: false });
    if (!settings || !settings.addonActive() || settings.autoDraftFromCalls === false) return null;
    const job = await createJob(client, settings, {
      source: lead.source === "voicemail" ? "voicemail" : "calltwin_call",
      lead: lead._id, name: lead.name, phone: lead.phone, email: lead.email, address: lead.address,
      service: lead.service, problem: lead.details, urgency: lead.urgency, preferredTime: lead.preferredTime, callSummary: lead.summary,
      measurements: extra.measurements, laborNotes: extra.access ? `Access: ${extra.access}` : "",
      notes: extra.equipment ? `Equipment (as stated by caller): ${extra.equipment}` : "",
    }, "calltwin", "");
    await runAnalysis(client, settings, job, "calltwin");
    if (settings.textCustomerPhotoLink && lead.phone) {
      const t = newToken(18); job.photoUploadToken = hashToken(t); await job.save();
      await sendSms(lead.phone, `${settings.company.name || client.businessName}: to help us prepare your estimate, you can send photos of the job here: ${SITE()}/request.html?p=${t}`);
    }
    await notifyOwner(client, settings, `Draft estimate ${job.number} is ready to review for ${job.customer.name || "a caller"} (${job.service || "new job"}). Nothing is sent until you approve it: ${ownerLink(client, job._id)}`);
    return job;
  } catch (e) {
    console.error("[estimate] fromCallTwinLead:", e.message);
    return null;
  }
}

// ---------------- follow-ups ----------------
async function followUpTick() {
  const now = Date.now();
  const jobs = await EstimateJob.find({ status: { $in: ["sent", "viewed"] }, "proposal.sentAt": { $ne: null }, "proposal.followupsStopped": { $ne: true } }).limit(500);
  const Client = require("../models/Client");
  for (const job of jobs) {
    try {
      const settings = await EstimateSettings.findOne({ client: job.client });
      if (!settings || !settings.addonActive() || !settings.followUps.enabled) continue;
      const steps = settings.followUps.steps || [];
      const done = new Set((job.proposal.followups || []).map((f) => f.step));
      const lastCustomerAction = Math.max(+new Date(job.proposal.sentAt), ...((job.proposal.events || []).filter((e) => ["question", "change_request"].includes(e.type)).map((e) => +new Date(e.at))));
      const idx = steps.findIndex((s, i) => !done.has(i) && now - lastCustomerAction >= s.afterHours * 3600e3);
      if (idx < 0) continue;
      const client = await Client.findById(job.client);
      if (!client) continue;
      const step = steps[idx];
      const vars = msgVars(client, settings, job);
      const c = customerOf(job);
      const channels = [];
      if (step.sms && c.phone && await sendSms(c.phone, fill(step.sms, vars))) channels.push("sms");
      if (step.email && c.email && await sendEmail(c.email, fill(step.emailSubject || "Your estimate", vars), fill(step.email, vars), settings.company.email)) channels.push("email");
      job.proposal.followups.push({ step: idx, at: new Date(), channels });
      if (idx === steps.length - 1) job.proposal.followupsStopped = true;
      await job.save();
      await audit(job.client, job._id, "system", "followup.sent", { step: idx, afterHours: step.afterHours, channels });
    } catch (e) { console.error("[estimate] followup:", e.message); }
  }
}

let started = false;
function startEstimateScheduler() {
  if (started) return; started = true;
  cron.schedule("*/15 * * * *", () => followUpTick().catch((e) => console.error("[estimate] tick:", e.message)));
  console.log("[estimate] follow-up scheduler running every 15 minutes");
}

module.exports = {
  getSettings, startTrial, audit, createJob, runAnalysis, draftLineItems, recompute, customerOf, searchKey,
  sendSms, sendEmail, emailReady, fill, msgVars, proposalLink, ownerLink, notifyOwner, fromCallTwinLead,
  followUpTick, startEstimateScheduler, DEFAULT_FOLLOWUPS, COMP_EMAILS, PROMOS, promoFor, applyPromo, SITE, e164, clip, lid,
};
