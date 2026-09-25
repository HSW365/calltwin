const mongoose = require("mongoose");

// Website orders placed on the QUEENEE landing page (GitHub Pages).
// CallTwin's backend stores them and runs the Stripe side of the CallTwin add-on.
const queeneeOrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    status: { type: String, enum: ["pending_payment", "paid", "in_progress", "review", "delivered", "canceled", "refunded"], default: "pending_payment" },
    comp: { type: Boolean, default: false },
    name: String,
    email: { type: String, lowercase: true, trim: true, index: true },
    phone: String,
    business: String,
    industry: String,
    location: String,
    siteType: { type: String, enum: ["new", "rebuild"], default: "new" },
    url: String,
    services: String,
    goal: String,
    style: String,
    notes: String,
    addCallTwin: { type: Boolean, default: false },
    addonTotalPayments: { type: Number, default: 0 },
    addonPaymentsMade: { type: Number, default: 0 },
    addonInvoiceIds: { type: [String], default: [] },
    addonPlanStatus: { type: String, default: null }, // pending | active | past_due | completed | canceled | comp
    stripeSessionId: { type: String, index: true },
    stripeCustomerId: { type: String, index: true },
    stripeSubscriptionId: { type: String, index: true },
    amountPaidCents: Number,
    paidAt: Date,
    liveUrl: String,
    adminNotes: String,
    source: { type: String, default: "form" } // form | stripe (order created from checkout because the form call never landed)
  },
  { timestamps: true }
);

module.exports = mongoose.model("QueeneeOrder", queeneeOrderSchema);
