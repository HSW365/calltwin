const mongoose = require("mongoose");

const callLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
    twilioCallSid: { type: String, default: null },

    outcome: {
      type: String,
      enum: ["in_progress", "interested", "closed", "callback_requested", "do_not_call", "no_answer", "voicemail", "failed", "completed"],
      default: "in_progress",
    },
    transcript: [
      {
        speaker: { type: String, enum: ["ai", "lead"] },
        text: String,
        at: { type: Date, default: Date.now },
      },
    ],
    durationSeconds: { type: Number, default: 0 },
    smsLinkSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CallLog", callLogSchema);
