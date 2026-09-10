const mongoose = require("mongoose");

const inboundCallSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    twilioCallSid: { type: String, index: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
    outcome: { type: String, default: "in_progress" },
    transcript: [
      { speaker: { type: String, enum: ["ai", "caller"] }, text: String, at: { type: Date, default: Date.now } }
    ],
    durationSeconds: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("InboundCall", inboundCallSchema);
