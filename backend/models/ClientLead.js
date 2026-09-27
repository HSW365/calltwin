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
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClientLead", clientLeadSchema);
