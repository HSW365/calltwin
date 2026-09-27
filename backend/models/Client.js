const mongoose = require("mongoose");

// A business that signed up for CallTwin through the public signup link.
const clientSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },
    industry: { type: String, default: "" },
    ownerName: { type: String, required: true },
    ownerEmail: { type: String, required: true, lowercase: true, index: true },
    ownerCell: { type: String, required: true }, // E.164
    businessPhone: { type: String, default: "" }, // the line customers already call
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

clientSchema.methods.inService = function () {
  if (this.status === "comp" || this.status === "active") return true;
  if (this.status === "trial" && this.trialEndsAt && this.trialEndsAt > new Date()) return true;
  if (this.paidThrough && this.paidThrough > new Date()) return true;
  return false;
};

module.exports = mongoose.model("Client", clientSchema);
