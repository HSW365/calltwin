const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },

    subscriptionStatus: {
      type: String,
      enum: ["none", "active", "past_due", "canceled"],
      default: "none",
    },
    isFounderAccount: { type: Boolean, default: false },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },

    minutesIncluded: { type: Number, default: 150 },
    minutesUsed: { type: Number, default: 0 },
    minutesResetAt: { type: Date, default: Date.now },

    voiceId: { type: String, default: null }, // ElevenLabs voice_id once cloned
    pitchScript: { type: String, default: "" }, // free-text knowledge base used by conversationEngine.js
    businessName: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
