const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: false },

    // Calling window, in the owner's local time. Defaults: 8am-9pm, every day.
    startHour: { type: Number, default: 8, min: 0, max: 23 },
    endHour: { type: Number, default: 21, min: 0, max: 23 },
    timezone: { type: String, default: "America/New_York" },
    daysActive: {
      type: [String],
      default: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    },

    // How many leads to dial per scheduler tick (every 5 min). Keeps things
    // from blasting the whole list at once and respects Twilio rate limits.
    callsPerTick: { type: Number, default: 2 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Campaign", campaignSchema);
