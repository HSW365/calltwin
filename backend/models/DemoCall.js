const mongoose = require("mongoose");

// One "Get your AI call FREE" request: who asked, the consent they gave, and the call that followed.
const DemoCallSchema = new mongoose.Schema({
  name: { type: String, required: true },
  business: { type: String, required: true },
  website: { type: String, default: "" },
  phone: { type: String, required: true, index: true },   // E.164
  email: { type: String, default: "" },
  consentText: { type: String, required: true },          // the exact wording they agreed to
  consentAt: { type: Date, required: true },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  siteText: { type: String, default: "" },                // what was read from their website
  status: { type: String, default: "queued" },            // queued | calling | in-progress | completed | failed | no-answer | busy
  callSid: { type: String, default: "" },
  turns: [{ role: String, content: String, at: { type: Date, default: Date.now } }],
  silent: { type: Number, default: 0 },
  durationSec: { type: Number, default: 0 },
  wantsSignup: { type: Boolean, default: false },
  optedOut: { type: Boolean, default: false },
  followUpSent: { type: Boolean, default: false },
  error: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.models.DemoCall || mongoose.model("DemoCall", DemoCallSchema);
