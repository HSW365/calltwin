const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },

    subscriptionStatus: { type: String, enum: ["none", "active", "past_due", "canceled"], default: "none" },
    isLifetime: { type: Boolean, default: false },
    isFounderAccount: { type: Boolean, default: false },
    calltwinPurchased: { type: Boolean, default: false },
    websitePurchased: { type: Boolean, default: false },
    bundlePurchased: { type: Boolean, default: false },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },

    minutesIncluded: { type: Number, default: 150 },
    minutesUsed: { type: Number, default: 0 },
    minutesResetAt: { type: Date, default: Date.now },

    voiceId: { type: String, default: null },
    pitchScript: { type: String, default: "" },
    businessName: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
