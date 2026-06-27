const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    businessName: { type: String, required: true },
    contactName: { type: String, default: "" },
    phone: { type: String, required: true }, // E.164 format expected
    city: { type: String, default: "" },
    state: { type: String, default: "" },

    status: {
      type: String,
      enum: ["queued", "calling", "called", "interested", "closed", "callback_requested", "do_not_call", "failed"],
      default: "queued",
    },
    callbackAt: { type: Date, default: null },
    notes: { type: String, default: "" },

    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  },
  { timestamps: true }
);

leadSchema.index({ owner: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model("Lead", leadSchema);
