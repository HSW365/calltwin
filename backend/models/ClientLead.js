const mongoose = require("mongoose");

// A job/lead captured for a CallTwin client (from a phone call the AI answered, or voicemail).
const clientLeadSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    source: { type: String, default: "phone" },
    name: String,
    phone: String,
    email: String,
    service: String,
    urgency: String,
    address: String,
    preferredTime: String,
    details: String,
    summary: String,
    conversationId: String,
    status: { type: String, enum: ["new", "contacted", "booked", "done", "lost"], default: "new" },
    notified: { type: Boolean, default: false },
    // Missed-call / voicemail delivery tracking: the alert is kept so a failed email can be re-sent later.
    callSid: { type: String, index: true },
    from: String,
    ownerAnswered: { type: Boolean, default: false },
    alertBody: String,
    alertAttempts: { type: Number, default: 0 },
    lastAlertError: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClientLead", clientLeadSchema);
