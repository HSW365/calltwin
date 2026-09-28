const mongoose = require("mongoose");

// A business that signed up for CallTwin through the public signup link.
const clientSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },
    industry: { type: String, default: "" },
    ownerName: { type: String, required: true },
    ownerEmail: { type: String, default: "", lowercase: true, index: true },
    ownerCell: { type: String, required: true }, // E.164
    businessPhone: { type: String, default: "" }, // the line customers already call
    forwardedLines: { type: [String], default: [] }, // every line the owner forwards to the CallTwin number (office, cell...)
    areaCode: { type: String, default: "" },
    city: { type: String, default: "" },
    services: { type: String, default: "" },
    hours: { type: String, default: "" },
    notes: { type: String, default: "" }, // FAQs, pricing policy, anything the AI should know

    portalKey: { type: String, required: true, unique: true }, // owner's private dashboard link
    hookKey: { type: String, required: true }, // secret the AI agent uses to post leads

    // AI + phone
    agentId: { type: String, default: "" },
    toolId: { type: String, default: "" },
    aiNumber: { type: String, default: "" }, // E.164 CallTwin number calls are forwarded to
    elPhoneId: { type: String, default: "" },
    aiEnabled: { type: Boolean, default: true },
    alertSms: { type: Boolean, default: true },
    provisionLog: { type: [String], default: [] },

    // Billing: 14-day free trial, then $99/month
    plan: { type: String, default: "calltwin_pro_99" },
    payMethod: { type: String, enum: ["card", "zelle", "cashapp", "comp"], default: "card" },
    status: { type: String, enum: ["trial", "active", "past_due", "canceled", "comp"], default: "trial" },
    trialEndsAt: { type: Date },
    promo: { type: String, default: "" }, // custom deal applied (services/promos.js)
    setupDue: { type: Boolean, default: false }, // one-time setup fee not yet paid (new self-serve signups)
    setupPaidAt: { type: Date, default: null },
    paidThrough: { type: Date, default: null },
    stripeCustomerId: { type: String, default: "" },
    stripeSubscriptionId: { type: String, default: "" },
    stripeSessionId: { type: String, default: "" },

    // Customer payment handles shown to the business's own customers (optional)
    payoutZelle: { type: String, default: "" },
    payoutCashapp: { type: String, default: "" },
    payoutStripeLink: { type: String, default: "" },
  },
  { timestamps: true }
);

// HSW365 owner accounts: always free, full access, never expire.
const COMP_EMAILS = ["hsw365media@gmail.com", "hoodstarent365@gmail.com"];
clientSchema.methods.isOwnerComp = function () {
  return COMP_EMAILS.includes(String(this.ownerEmail || "").toLowerCase().trim());
};
clientSchema.pre("save", function (next) {
  if (this.isOwnerComp()) { this.status = "comp"; this.payMethod = "comp"; this.setupDue = false; }
  next();
});

clientSchema.methods.inService = function () {
  if (this.isOwnerComp()) return true;
  if (this.setupDue && this.status !== "comp") return false; // receptionist turns on once the setup fee is paid
  if (this.status === "comp" || this.status === "active") return true;
  if (this.status === "trial" && this.trialEndsAt && this.trialEndsAt > new Date()) return true;
  if (this.paidThrough && this.paidThrough > new Date()) return true;
  return false;
};

clientSchema.statics.COMP_EMAILS = COMP_EMAILS;
module.exports = mongoose.model("Client", clientSchema);
