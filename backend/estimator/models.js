/**
 * HSW365 AI Estimate: accounts, saved documents and the conversion ledger.
 *
 * A "conversion" is one job's photos / video / voice turned into a drafted estimate. Every conversion is paid for from exactly one source,
 * tried in this order: free trial, the plan's monthly allowance, plan top-up credits, then pay-per-conversion pack credits.
 * reserve() takes the credit atomically before the AI runs; refund() gives it back if the AI fails, so nobody pays for an error.
 */
const mongoose = require("mongoose");
const crypto = require("crypto");
const { PLANS } = require("./plans");

const SIZES = ["small", "mid", "large", "major"];
const PLAN_SIZE = { solo: "small", crew: "mid", pro: "large", commercial: "major" }; // biggest job each plan covers
const rank = (s) => SIZES.indexOf(s);

// His own emails never pay: every feature, no limits (HSW365 rule for every app he builds).
const COMP_EMAILS = ["hsw365media@gmail.com", "hoodstarent365@gmail.com"];
const isComp = (a) => !!(a && (a.comp || COMP_EMAILS.includes(String(a.email || "").toLowerCase())));

const secret = () => process.env.JWT_SECRET || process.env.CALLTWIN_ADMIN_KEY || "";
const pinHash = (pin) => crypto.createHmac("sha256", secret() || "estimator").update(String(pin)).digest("hex");
const newPin = () => String(crypto.randomInt(10000000, 100000000));

const AccountSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  business: { type: String, default: "" },
  trade: { type: String, default: "" },
  phone: { type: String, default: "" },
  pinHash: { type: String, required: true, unique: true },
  company: { type: Object, default: {} }, // the letterhead: name, address, licenses, brand colour...
  // billing
  plan: { type: String, default: "" },           // "" | solo | crew | pro | commercial
  subStatus: { type: String, default: "none" },  // none | active | past_due | canceled
  stripeCustomerId: { type: String, default: "", index: true },
  stripeSubscriptionId: { type: String, default: "", index: true },
  periodStart: { type: Date, default: Date.now },
  // credits
  trialLeft: { type: Number, default: 0 },
  usedPeriod: { type: Number, default: 0 },
  topups: { type: Number, default: 0 },
  packs: { small: { type: Number, default: 0 }, mid: { type: Number, default: 0 }, large: { type: Number, default: 0 }, major: { type: Number, default: 0 } },
  sessions: { type: [String], default: [] },     // Stripe checkout sessions already credited (idempotency)
  totalConversions: { type: Number, default: 0 },
  paidCents: { type: Number, default: 0 },
  source: { type: String, default: "" },
  comp: { type: Boolean, default: false },
}, { timestamps: true, minimize: false });

const DocSchema = new mongoose.Schema({
  acct: { type: mongoose.Schema.Types.ObjectId, index: true },
  number: String, type: String, customer: String, totalCents: Number,
  doc: { type: Object, default: {} },
}, { timestamps: true, minimize: false });

const UsageSchema = new mongoose.Schema({
  acct: { type: mongoose.Schema.Types.ObjectId, index: true },
  source: String, size: String, ok: { type: Boolean, default: true },
  at: { type: Date, default: Date.now, index: true },
}, { minimize: false });

const Account = mongoose.models.EstAccount || mongoose.model("EstAccount", AccountSchema);
const Doc = mongoose.models.EstDoc || mongoose.model("EstDoc", DocSchema);
const Usage = mongoose.models.EstUsage || mongoose.model("EstUsage", UsageSchema);

const planLive = (a) => isComp(a) || !!(a.plan && PLANS[a.plan] && (a.subStatus === "active"));

/** Take one conversion credit for a job of this size. Returns { source } or null when the account has nothing left. */
async function reserve(acct, size) {
  size = SIZES.includes(size) ? size : "small";
  const id = acct._id;
  if (isComp(acct)) { const r = await Account.findOneAndUpdate({ _id: id }, { $inc: { totalConversions: 1 } }, { new: true }); return { source: "comp", acct: r || acct }; }
  // 1. free trial (small and mid jobs)
  if (rank(size) <= rank("mid")) {
    const r = await Account.findOneAndUpdate({ _id: id, trialLeft: { $gt: 0 } }, { $inc: { trialLeft: -1, totalConversions: 1 } }, { new: true });
    if (r) return { source: "trial", acct: r };
  }
  // 2. plan allowance, 3. top-up credits (only for jobs the plan covers)
  const p = PLANS[acct.plan];
  if (planLive(acct) && p && rank(size) <= rank(PLAN_SIZE[acct.plan])) {
    const r = await Account.findOneAndUpdate({ _id: id, subStatus: "active", plan: acct.plan, usedPeriod: { $lt: p.included } }, { $inc: { usedPeriod: 1, totalConversions: 1 } }, { new: true });
    if (r) return { source: "plan", acct: r };
    const t = await Account.findOneAndUpdate({ _id: id, subStatus: "active", plan: acct.plan, topups: { $gt: 0 } }, { $inc: { topups: -1, totalConversions: 1 } }, { new: true });
    if (t) return { source: "topup", acct: t };
  }
  // 4. pack credits of this size, or a bigger pack when the right size is gone
  for (const s of SIZES.slice(rank(size))) {
    const r = await Account.findOneAndUpdate({ _id: id, [`packs.${s}`]: { $gt: 0 } }, { $inc: { [`packs.${s}`]: -1, totalConversions: 1 } }, { new: true });
    if (r) return { source: `pack:${s}`, acct: r };
  }
  return null;
}

async function refund(acctId, source) {
  const inc = { totalConversions: -1 };
  if (source === "trial") inc.trialLeft = 1;
  else if (source === "plan") inc.usedPeriod = -1;
  else if (source === "topup") inc.topups = 1;
  else if (/^pack:/.test(source)) inc[`packs.${source.slice(5)}`] = 1;
  else return;
  await Account.updateOne({ _id: acctId }, { $inc: inc });
}

/** What the app shows: what is left and which plan the account is on. */
function summary(a) {
  if (isComp(a)) return { id: String(a._id), email: a.email, business: a.business, trade: a.trade, plan: "commercial", planName: "Owner (free)", subStatus: "active", trialLeft: 0, planIncluded: 0, planUsed: 0, planLeft: 0, topups: 0, packs: { small: 0, mid: 0, large: 0, major: 0 }, packTotal: 0, left: 99999, unlimited: true, badge: false, maxSize: "major" };
  const p = PLANS[a.plan];
  const live = planLive(a);
  const packs = {}; let packTotal = 0;
  for (const s of SIZES) { packs[s] = (a.packs && a.packs[s]) || 0; packTotal += packs[s]; }
  const planLeft = live && p ? Math.max(0, p.included - (a.usedPeriod || 0)) : 0;
  return {
    id: String(a._id), email: a.email, business: a.business, trade: a.trade,
    plan: live ? a.plan : "", planName: live && p ? p.name : "", subStatus: a.subStatus,
    trialLeft: a.trialLeft || 0, planIncluded: live && p ? p.included : 0, planUsed: live ? a.usedPeriod || 0 : 0, planLeft,
    topups: live ? a.topups || 0 : 0, packs, packTotal,
    left: (a.trialLeft || 0) + planLeft + (live ? a.topups || 0 : 0) + packTotal,
    badge: !(live && a.plan !== "solo"), // the "Made with HSW365 AI Estimate" line stays on trial, Solo and pay-per-conversion documents
    maxSize: live ? PLAN_SIZE[a.plan] : "",
  };
}

module.exports = { isComp, Account, Doc, Usage, SIZES, PLAN_SIZE, rank, pinHash, newPin, reserve, refund, summary, planLive };
