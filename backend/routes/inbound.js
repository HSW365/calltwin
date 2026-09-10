const express = require("express");
const twilio = require("twilio");
const User = require("../models/User");
const InboundCall = require("../models/InboundCall");
const { requireAuth } = require("../middleware/authMiddleware");
const { synthesizeSpeech } = require("../services/voiceEngine");
const { getNextTurn } = require("../services/conversationEngine");

const router = express.Router();
const BASE_URL = process.env.PUBLIC_BASE_URL;

async function ownerForNumber(to) {
  const user = to ? await User.findOne({ twilioPhoneNumber: to }) : null;
  return user || (process.env.CALLTWIN_OWNER_EMAIL ? User.findOne({ email: process.env.CALLTWIN_OWNER_EMAIL.toLowerCase() }) : null);
}
function validWebhook(req) {
  if (!process.env.TWILIO_AUTH_TOKEN || !BASE_URL) return process.env.NODE_ENV !== "production";
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, req.headers["x-twilio-signature"], `${BASE_URL}${req.originalUrl}`, req.body);
}
function gather(twiml, callId) {
  twiml.gather({ input: "speech", action: `${BASE_URL}/api/inbound/turn?callId=${callId}`, method: "POST", speechTimeout: "auto", timeout: 6 });
}

router.post("/voice", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    if (!validWebhook(req)) return res.sendStatus(403);
    if (!BASE_URL) return res.status(500).send("PUBLIC_BASE_URL is not configured.");
    const owner = await ownerForNumber(req.body.To);
    const twiml = new twilio.twiml.VoiceResponse();
    if (!owner) { twiml.say("Thanks for calling. This CallTwin number is not configured yet."); twiml.hangup(); return res.type("text/xml").send(twiml.toString()); }
    const call = await InboundCall.create({ owner: owner._id, twilioCallSid: req.body.CallSid, from: req.body.From || "", to: req.body.To || "" });
    const greeting = `Thanks for calling ${owner.businessName || "our business"}. I'm the AI receptionist. How can I help you today?`;
    call.transcript.push({ speaker: "ai", text: greeting }); await call.save();
    twiml.play(await synthesizeSpeech(greeting, owner.voiceId || undefined));
    gather(twiml, call._id);
    twiml.redirect({ method: "POST" }, `${BASE_URL}/api/inbound/no-input?callId=${call._id}`);
    res.type("text/xml").send(twiml.toString());
  } catch (err) { console.error("[inbound/voice]", err); res.status(500).send("Server error"); }
});

router.post("/turn", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    if (!validWebhook(req)) return res.sendStatus(403);
    const call = await InboundCall.findById(req.query.callId); if (!call) return res.status(404).send("Call not found");
    const owner = await User.findById(call.owner); if (!owner) return res.status(404).send("Owner not found");
    const speech = (req.body.SpeechResult || "").trim(); const twiml = new twilio.twiml.VoiceResponse();
    if (!speech) { twiml.say("I didn't catch that. Please tell me how I can help."); gather(twiml, call._id); return res.type("text/xml").send(twiml.toString()); }
    call.transcript.push({ speaker: "caller", text: speech });
    const result = await getNextTurn({ pitchScript: owner.pitchScript || "", transcript: call.transcript.map(x => ({ speaker: x.speaker === "caller" ? "lead" : "ai", text: x.text })), leadSpeechText: speech });
    call.transcript.push({ speaker: "ai", text: result.reply }); call.outcome = result.outcome; await call.save();
    twiml.play(await synthesizeSpeech(result.reply, owner.voiceId || undefined));
    if (result.endCall) twiml.hangup(); else gather(twiml, call._id);
    res.type("text/xml").send(twiml.toString());
  } catch (err) { console.error("[inbound/turn]", err); res.status(500).send("Server error"); }
});

router.post("/no-input", express.urlencoded({ extended: false }), async (req, res) => {
  const call = await InboundCall.findById(req.query.callId); const twiml = new twilio.twiml.VoiceResponse();
  if (!call) { twiml.hangup(); return res.type("text/xml").send(twiml.toString()); }
  twiml.say("I didn't hear anything. Please call back when you're ready. Thank you."); twiml.hangup(); call.outcome = "no_answer"; await call.save(); res.type("text/xml").send(twiml.toString());
});

router.post("/status", express.urlencoded({ extended: false }), async (req, res) => {
  const call = await InboundCall.findOne({ twilioCallSid: req.body.CallSid });
  if (call) { call.durationSeconds = parseInt(req.body.CallDuration || "0", 10); if (req.body.CallStatus === "completed" && call.outcome === "in_progress") call.outcome = "completed"; await call.save(); }
  res.sendStatus(200);
});

router.get("/logs", requireAuth, async (req, res) => {
  try {
    const logs = await InboundCall.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ logs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
