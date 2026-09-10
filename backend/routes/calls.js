const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { placeCall, sendSMS, buildSpeechTurn } = require("../services/signalwireCallEngine");
const { buildOpeningLine, getNextTurn } = require("../services/conversationEngine");
const Lead = require("../models/Lead");
const CallLog = require("../models/CallLog");
const User = require("../models/User");

const router = express.Router();
const FUNNEL_LINK = process.env.FUNNEL_LINK || "https://hsw365.github.io/QUEENEE.github.io/signup.html";
const DEFAULT_OFFER_SMS = `Hi, this is HSW365Media. We build modern websites + a 24/7 AI front desk assistant that answers every call so your business never misses one. Free demo, no cost to look: ${FUNNEL_LINK} Reply STOP to opt out.`;

router.post("/sms/:leadId", requireAuth, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, owner: req.user._id });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (!lead.phone) return res.status(400).json({ error: "Lead has no phone number." });
    if (lead.status === "do_not_call") return res.status(400).json({ error: "Lead is marked do_not_call." });
    if (lead.smsSentAt) return res.json({ skipped: true, reason: "already texted", smsSentAt: lead.smsSentAt });
    await sendSMS({ to: lead.phone, message: req.body.message || DEFAULT_OFFER_SMS });
    lead.smsSentAt = new Date();
    await lead.save();
    res.json({ success: true, leadId: lead._id, phone: lead.phone });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/dial/:leadId", requireAuth, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, owner: req.user._id });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (lead.status === "do_not_call") return res.status(403).json({ error: "Lead is flagged do-not-call." });
    const callLog = await CallLog.create({ owner: req.user._id, lead: lead._id, outcome: "in_progress" });
    const providerCallSid = await placeCall({ to: lead.phone, callSid: callLog._id.toString() });
    callLog.twilioCallSid = providerCallSid;
    await callLog.save();
    lead.status = "calling";
    await lead.save();
    res.json({ callLogId: callLog._id, providerCallSid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/twiml", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const callLogId = req.query.callSid;
    const callLog = await CallLog.findById(callLogId).populate("lead");
    if (!callLog) return res.status(404).send("Call not found.");
    const owner = await User.findById(callLog.owner);
    const opening = buildOpeningLine(owner.businessName || "our company");
    callLog.transcript.push({ speaker: "ai", text: opening });
    await callLog.save();
    const cxml = await buildSpeechTurn({ text: opening, callSid: callLogId });
    res.type("text/xml").send(cxml);
  } catch (err) {
    console.error("[calls/twiml] error:", err);
    res.status(500).send("Server error.");
  }
});

router.post("/event", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const callLogId = req.query.callSid;
    const speechResult = req.body.SpeechResult || "";
    const callLog = await CallLog.findById(callLogId).populate("lead");
    if (!callLog) return res.status(404).send("Call not found.");
    const owner = await User.findById(callLog.owner);
    if (!speechResult.trim()) {
      const cxml = await buildSpeechTurn({ text: "Alright, take care.", callSid: callLogId, endCall: true });
      callLog.outcome = "no_answer";
      await callLog.save();
      return res.type("text/xml").send(cxml);
    }
    callLog.transcript.push({ speaker: "lead", text: speechResult });
    const { reply, outcome, endCall } = await getNextTurn({ pitchScript: owner.pitchScript, transcript: callLog.transcript, leadSpeechText: speechResult });
    callLog.transcript.push({ speaker: "ai", text: reply });
    callLog.outcome = outcome === "continue" ? callLog.outcome : outcome;
    await callLog.save();
    if (outcome === "do_not_call") {
      callLog.lead.status = "do_not_call";
      await callLog.lead.save();
    } else if (outcome === "callback_requested") {
      callLog.lead.status = "callback_requested";
      await callLog.lead.save();
    } else if (outcome === "interested" || outcome === "closed") {
      callLog.lead.status = outcome === "closed" ? "closed" : "interested";
      await callLog.lead.save();
      await sendSMS({ to: callLog.lead.phone, message: `Here's the link we talked about: ${FUNNEL_LINK}` });
      callLog.smsLinkSent = true;
      await callLog.save();
    } else if (outcome === "not_interested") {
      callLog.lead.status = "called";
      await callLog.lead.save();
    }
    const cxml = await buildSpeechTurn({ text: reply, callSid: callLogId, endCall });
    res.type("text/xml").send(cxml);
  } catch (err) {
    console.error("[calls/event] error:", err);
    res.status(500).send("Server error.");
  }
});

router.post("/status", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const callLogId = req.query.callSid;
    const { CallStatus, CallDuration } = req.body;
    const callLog = await CallLog.findById(callLogId);
    if (!callLog) return res.sendStatus(200);
    if (CallStatus === "completed") {
      const seconds = parseInt(CallDuration || "0", 10);
      callLog.durationSeconds = seconds;
      if (callLog.outcome === "in_progress") callLog.outcome = "completed";
      await callLog.save();
      const owner = await User.findById(callLog.owner);
      if (owner) {
        owner.minutesUsed += Math.ceil(seconds / 60);
        await owner.save();
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("[calls/status] error:", err);
    res.sendStatus(200);
  }
});

router.get("/logs", requireAuth, async (req, res) => {
  const logs = await CallLog.find({ owner: req.user._id }).populate("lead").sort({ createdAt: -1 }).limit(200);
  res.json(logs);
});

module.exports = router;
