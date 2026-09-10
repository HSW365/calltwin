const express = require("express");
const twilio = require("twilio");
const User = require("../models/User");
const InboundCall = require("../models/InboundCall");
const { synthesizeSpeech } = require("../services/voiceEngine");
const { getNextTurn } = require("../services/conversationEngine");

const router = express.Router();
const BASE_URL = process.env.PUBLIC_BASE_URL;

async function ownerForNumber(to) {
  if (to) {
    const user = await User.findOne({ twilioPhoneNumber: to });
    if (user) return user;
  }
  if (process.env.CALLTWIN_OWNER_EMAIL) return User.findOne({ email: process.env.CALLTWIN_OWNER_EMAIL.toLowerCase() });
  return null;
}

function validWebhook(req) {
  if (!process.env.TWILIO_AUTH_TOKEN || !BASE_URL) return true;
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, req.headers["x-twilio-signature"], `${BASE_URL}${req.originalUrl}`, req.body);
}

router.post("/voice", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    if (!validWebhook(req)) return res.sendStatus(403);
    const owner = await ownerForNumber(req.body.To);
    const twiml = new twilio.twiml.VoiceResponse();
    if (!owner) {
      twiml.say("Thanks for calling. This CallTwin number is not configured yet.");
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    const call = await InboundCall.create({ owner: owner._id, twilioCallSid: req.body.CallSid, from: req.body.From || "", to: req.body.To || "" });
    const greeting = `Thanks for calling ${owner.businessName || "our business"}. I'm the AI receptionist. How can I help you today?`;
    call.transcript.push({ speaker: "ai", text: greeting });
    await call.save();
    const audio = await synthesizeSpeech(greeting, owner.voiceId || undefined);
    twiml.play(audio);
    twiml.gather({ input: "speech", action: `${BASE_URL}/api/inbound/turn?callId=${call._id}`, method: "POST", speechTimeout: "auto", timeout: 6 });
    twiml.redirect({ method: "POST" }, `${BASE_URL}/api/inbound/voice?resume=1`);
    res.type("text/xml").send(twiml.toString());
  } catch (err) { console.error("[inbound/voice]", err); res.status(500).send("Server error"); }
});

router.post("/turn", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    if (!validWebhook(req)) return res.sendStatus(403);
    const call = await InboundCall.findById(req.query.callId);
    if (!call) return res.status(404).send("Call not found");
    const owner = await User.findById(call.owner);
    const speech = (req.body.SpeechResult || "").trim();
    const twiml = new twilio.twiml.VoiceResponse();
    if (!speech) {
      twiml.say("I didn't catch that. Please tell me how I can help.");
      twiml.redirect({ method: "POST" }, `${BASE_URL}/api/inbound/voice?resume=1`);
      return res.type("text/xml").send(twiml.toString());
    }
    call.transcript.push({ speaker: "caller", text: speech });
    const result = await getNextTurn({ pitchScript: owner.pitchScript || "", transcript: call.transcript.map(x => ({ speaker: x.speaker === "caller" ? "lead" : "ai", text: x.text })), leadSpeechText: speech });
    call.transcript.push({ speaker: "ai", text: result.reply });
    call.outcome = result.outcome;
    await call.save();
    const audio = await synthesizeSpeech(result.reply, owner.voiceId || undefined);
    twiml.play(audio);
    if (result.endCall) twiml.hangup();
    else twiml.gather({ input: "speech", action: `${BASE_URL}/api/inbound/turn?callId=${call._id}`, method: "POST", speechTimeout: "auto", timeout: 6 });
    res.type("text/xml").send(twiml.toString());
  } catch (err) { console.error("[inbound/turn]", err); res.status(500).send("Server error"); }
});

router.post("/status", express.urlencoded({ extended: false }), async (req, res) => {
  const call = await InboundCall.findOne({ twilioCallSid: req.body.CallSid });
  if (call) { call.durationSeconds = parseInt(req.body.CallDuration || "0", 10); if (req.body.CallStatus === "completed") call.outcome = call.outcome === "in_progress" ? "completed" : call.outcome; await call.save(); }
  res.sendStatus(200);
});

router.get("/logs", async (req, res) => {
  if (!process.env.CALLTWIN_OWNER_EMAIL) return res.json([]);
  const owner = await User.findOne({ email: process.env.CALLTWIN_OWNER_EMAIL.toLowerCase() });
  if (!owner) return res.json([]);
  res.json(await InboundCall.find({ owner: owner._id }).sort({ createdAt: -1 }).limit(100));
});

module.exports = router;
