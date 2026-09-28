/**
 * HSW365 AI ESTIMATE — data model (MongoDB, same cluster as CallTwin).
 *
 * Tenant = CallTwin `Client`. Every document carries `client` and every query filters on it.
 *
 *   EstimateSettings  one per business: add-on status, company profile, pricing rules, price book,
 *                     service templates, terms, follow-up templates, team members.
 *   EstimateJob       lead -> AI analysis -> estimate -> proposal -> approval -> deposit -> scheduled.
 *   EstimatePhoto     uploaded job photos (binary, capped).
 *   EstimateAudit     append-only trail of AI output, human edits, customer actions.
 *
 * Money is stored in integer cents everywhere.
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

// ---------------- settings ----------------
const laborRateSchema = new Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },
  rateCents: { type: Number, required: true, min: 0 },
  unit: { type: String, default: "hour" },
}, { _id: false });

const priceItemSchema = new Schema({
  sku: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, default: "" },
  kind: { type: String, enum: ["material", "equipment", "service", "fee"], default: "material" },
  unit: { type: String, default: "each" },
  costCents: { type: Number, default: null }, // what the business pays
  priceCents: { type: Number, default: null }, // fixed sell price; when null, cost + markup is used
  taxable: { type: Boolean, default: true },
  notes: { type: String, default: "" },
  active: { type: Boolean, default: true },
}, { _id: false });

const serviceTemplateSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  laborKey: { type: String, default: "" },
  laborHours: { type: Number, default: null }, // owner-defined standard hours for this service
  items: [{ sku: String, qty: Number, _id: false }],
  timeline: { type: String, default: "" },
}, { _id: false });

const memberSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, default: "" },
  role: { type: String, enum: ["manager", "estimator", "tech"], default: "estimator" },
  keyHash: { type: String, required: true },
  keyHint: { type: String, default: "" },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const followStepSchema = new Schema({
  afterHours: { type: Number, required: true },
  sms: { type: String, default: "" },
  emailSubject: { type: String, default: "" },
  email: { type: String, default: "" },
}, { _id: false });

const settingsSchema = new Schema({
  client: { type: Schema.Types.ObjectId, ref: "Client", required: true, unique: true },

  // add-on subscription
  status: { type: String, enum: ["off", "trial", "active", "past_due", "canceled", "comp"], default: "off" },
  trialEndsAt: { type: Date, default: null },
  paidThrough: { type: Date, default: null },
  stripeSubscriptionId: { type: String, default: "" },
  promo: { type: String, default: "" },            // custom deal applied to this business (see service.js PROMOS)
  licensed: { type: Boolean, default: false },     // bought the add-on outright (one-time license)
  stripeSessionId: { type: String, default: "" },
  stripeConnectId: { type: String, default: "" }, // contractor's own Stripe account for customer deposits

  company: {
    name: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    website: { type: String, default: "" },
    license: { type: String, default: "" },
    brandColor: { type: String, default: "#22d3ee" },
  },

  pricing: {
    taxRatePct: { type: Number, default: 0 },
    taxLabor: { type: Boolean, default: false },
    materialMarkupPct: { type: Number, default: 0 },
    equipmentMarkupPct: { type: Number, default: 0 },
    serviceCallFeeCents: { type: Number, default: 0 },
    minimumChargeCents: { type: Number, default: 0 },
    travelFeeCents: { type: Number, default: 0 },
    emergencyFeeCents: { type: Number, default: 0 },
    emergencyLaborPct: { type: Number, default: 0 }, // extra % on labor for emergency jobs
    afterHoursFeeCents: { type: Number, default: 0 },
    defaultDepositPct: { type: Number, default: 0 },
    validDays: { type: Number, default: 30 },
  },
  laborRates: { type: [laborRateSchema], default: [] },
  priceBook: { type: [priceItemSchema], default: [] },
  services: { type: [serviceTemplateSchema], default: [] },
  discounts: [{ name: String, type: { type: String, enum: ["pct", "flat"] }, value: Number, _id: false }],

  terms: { type: String, default: "" },
  warranty: { type: String, default: "" },
  paymentTerms: { type: String, default: "" },
  defaultTimeline: { type: String, default: "" },
  payInstructions: { type: String, default: "" }, // shown when no Stripe account is connected (Zelle, Cash App...)

  followUps: {
    enabled: { type: Boolean, default: true },
    steps: { type: [followStepSchema], default: [] },
  },

  autoDraftFromCalls: { type: Boolean, default: true },
  notifyOwnerSms: { type: Boolean, default: true },
  textCustomerPhotoLink: { type: Boolean, default: false },

  prefix: { type: String, default: "EST" },
  counter: { type: Number, default: 1000 },
  intakeKey: { type: String, required: true, index: true },
  members: { type: [memberSchema], default: [] },
}, { timestamps: true });

settingsSchema.methods.addonActive = function () {
  if (this.status === "comp" || this.status === "active") return true;
  if (this.status === "trial" && this.trialEndsAt && this.trialEndsAt > new Date()) return true;
  if (this.paidThrough && this.paidThrough > new Date()) return true;
  return false;
};

// ---------------- jobs ----------------
const lineItemSchema = new Schema({
  id: { type: String, required: true },
  kind: { type: String, enum: ["labor", "material", "equipment", "fee", "custom"], required: true },
  description: { type: String, default: "" },
  sku: { type: String, default: "" },
  laborKey: { type: String, default: "" },
  qty: { type: Number, default: null },
  unit: { type: String, default: "" },
  unitCents: { type: Number, default: null },
  taxable: { type: Boolean, default: true },
  origin: { type: String, enum: ["price_book", "service_template", "owner", "ai_suggested", "auto_fee"], default: "owner" },
  basis: { type: String, enum: ["stated", "owner", "template", "assumed"], default: "owner" },
  aiNote: { type: String, default: "" },
}, { _id: false });

const eventSchema = new Schema({
  type: { type: String, required: true }, // viewed, question, change_request, approved, declined, reply
  text: { type: String, default: "" },
  by: { type: String, default: "" },
  at: { type: Date, default: Date.now },
  ip: { type: String, default: "" },
}, { _id: false });

const jobSchema = new Schema({
  client: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
  number: { type: String, required: true },
  status: {
    type: String,
    enum: ["new", "drafting", "ready", "sent", "viewed", "changes_requested", "approved", "declined", "deposit_paid", "scheduled", "completed", "lost"],
    default: "new",
    index: true,
  },
  source: { type: String, enum: ["calltwin_call", "voicemail", "web_form", "manual", "sms", "email"], default: "manual" },
  lead: { type: Schema.Types.ObjectId, ref: "ClientLead", default: null },

  customer: {
    name: { type: String, default: "" },
    phone: { type: String, default: "" }, // sealed
    email: { type: String, default: "" }, // sealed
    address: { type: String, default: "" }, // sealed
    phoneHash: { type: String, default: "", index: true }, // HMAC of the 10-digit number, for SMS threading
  },
  search: { type: String, default: "", index: true }, // lowercase name + service + last 4 of phone

  service: { type: String, default: "" },
  problem: { type: String, default: "" },
  urgency: { type: String, default: "" },
  afterHours: { type: Boolean, default: false },
  measurements: { type: String, default: "" },
  materialsNeeded: { type: String, default: "" },
  laborNotes: { type: String, default: "" },
  notes: { type: String, default: "" },
  preferredTime: { type: String, default: "" },
  callSummary: { type: String, default: "" },
  messages: [{ from: String, channel: String, text: String, at: { type: Date, default: Date.now }, _id: false }],
  photoUploadToken: { type: String, default: "" }, // hash; customer photo-upload link

  analysis: {
    status: { type: String, enum: ["none", "running", "done", "failed"], default: "none" },
    error: { type: String, default: "" },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    at: { type: Date, default: null },
    summary: { type: String, default: "" },
    scope: [String],
    materials: [{ name: String, qty: Number, unit: String, sku: String, basis: String, note: String, _id: false }],
    labor: [{ task: String, hours: Number, laborKey: String, basis: String, note: String, _id: false }],
    serviceTemplate: { type: String, default: "" },
    additionalWork: [String],
    questions: [String],
    assumptions: [String],
    missingInfo: [String],
    nextSteps: [String],
  },

  estimate: {
    lineItems: { type: [lineItemSchema], default: [] },
    discount: { name: String, type: { type: String, enum: ["pct", "flat", ""] }, value: Number },
    depositPct: { type: Number, default: 0 },
    scope: { type: String, default: "" },
    timeline: { type: String, default: "" },
    terms: { type: String, default: "" },
    warranty: { type: String, default: "" },
    paymentTerms: { type: String, default: "" },
    notes: { type: String, default: "" },
    validUntil: { type: Date, default: null },
    totals: { type: Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 0 },
    approvedBy: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
  },

  proposal: {
    overview: { type: String, default: "" },
    tokenHash: { type: String, default: "", index: true },
    tokenSealed: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    sentVia: [String],
    viewedAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    respondedAt: { type: Date, default: null },
    response: { type: String, enum: ["", "approved", "declined", "changes_requested"], default: "" },
    declineReason: { type: String, default: "" },
    signature: {
      name: { type: String, default: "" },
      image: { type: String, default: "" }, // sealed PNG data URL
      at: { type: Date, default: null },
      ip: { type: String, default: "" },
      ua: { type: String, default: "" },
    },
    events: { type: [eventSchema], default: [] },
    followups: [{ step: Number, at: Date, channels: [String], _id: false }],
    followupsStopped: { type: Boolean, default: false },
    snapshot: { type: Schema.Types.Mixed, default: null }, // the exact estimate the customer approved
  },

  payment: {
    status: { type: String, enum: ["none", "pending", "paid", "manual"], default: "none" },
    depositCents: { type: Number, default: 0 },
    paidCents: { type: Number, default: 0 },
    method: { type: String, default: "" },
    stripeSessionId: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    balanceSessionId: { type: String, default: "" },
  },

  schedule: {
    date: { type: Date, default: null },
    window: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
}, { timestamps: true });

jobSchema.index({ client: 1, createdAt: -1 });
jobSchema.index({ client: 1, number: 1 }, { unique: true });

// ---------------- photos ----------------
const photoSchema = new Schema({
  client: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
  job: { type: Schema.Types.ObjectId, ref: "EstimateJob", required: true, index: true },
  name: { type: String, default: "" },
  mime: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploadedBy: { type: String, default: "" },
}, { timestamps: true });

// ---------------- audit ----------------
const auditSchema = new Schema({
  client: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
  job: { type: Schema.Types.ObjectId, ref: "EstimateJob", default: null, index: true },
  actor: { type: String, required: true }, // owner | member:<name> | ai:<provider> | customer | system
  action: { type: String, required: true },
  detail: { type: Schema.Types.Mixed, default: null },
  ip: { type: String, default: "" },
}, { timestamps: { createdAt: true, updatedAt: false } });

const EstimateSettings = mongoose.models.EstimateSettings || mongoose.model("EstimateSettings", settingsSchema);
const EstimateJob = mongoose.models.EstimateJob || mongoose.model("EstimateJob", jobSchema);
const EstimatePhoto = mongoose.models.EstimatePhoto || mongoose.model("EstimatePhoto", photoSchema);
const EstimateAudit = mongoose.models.EstimateAudit || mongoose.model("EstimateAudit", auditSchema);

module.exports = { EstimateSettings, EstimateJob, EstimatePhoto, EstimateAudit };
