const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { placeCall, sendSMS, buildSpeechTurn } = require("../services/callEngine");
const { buildOpeningLine, getNextTurn } = require("../services/conversationEngine");
const Lead = require("../models/Lead");
const CallLog = require("../models/CallLog");
const User = require("../models/User");

const router = express.Router();

const FUNNEL_LINK = `${process.env.PUBLIC_BASE_URL}/dashboard`; // CallTwin signup — was mistakenly pointing to hsw365.co streetwear store

// ------------------------------------------------------------------
// Manual dial — for testing a single lead right now from the dashboard,
// outside of a scheduled campaign.
// ------------------------------------------------------------------
router.post("/dial/:leadId", requireAuth, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, owner: req.user._id });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (lead.status === "do_not_call") return res.status(403).json({ error: "Lead is flagged do-not-call." });

    const callLog = await CallLog.create({ owner: req.user._id, lead: lead._id, outcome: "in_progress" });
    const twilioSid = await placeCall({ to: lead.phone, callSid: callLog._id.toString() });

    callLog.twilioCallSid = twilioSid;
    await callLog.save();

    lead.status = "calling";
    await lead.save();

    res.json({ callLogId: callLog._id, twilioSid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// First webhook hit when Twilio connects the call. callSid here is
// OUR callLog._id (passed through in callEngine.placeCall's url),
// not Twilio's own CallSid.
// ------------------------------------------------------------------
router.post("/twiml", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const callLogId = req.query.callSid;
    const callLog = await CallLog.findById(callLogId).populate("lead");
    if (!callLog) return res.status(404).send("Call not found.");

    const owner = await User.findById(callLog.owner);
    const opening = buildOpeningLine(owner.businessName || "our company");

    callLog.transcript.push({ speaker: "ai", text: opening });
    await callLog.save();

    const twiml = await buildSpeechTurn({ text: opening, callSid: callLogId });
    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("[calls/twiml] error:", err);
    res.status(500).send("Server error.");
  }
});

// ------------------------------------------------------------------
// Every subsequent turn. Twilio posts what it heard via SpeechResult.
// ------------------------------------------------------------------
router.post("/event", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const callLogId = req.query.callSid;
    const speechResult = req.body.SpeechResult || "";
    const callLog = await CallLog.findById(callLogId).populate("lead");
    if (!callLog) return res.status(404).send("Call not found.");

    const owner = await User.findById(callLog.owner);

    if (!speechResult.trim()) {
      // Nothing heard — let the call just end naturally rather than loop forever.
      const twiml = await buildSpeechTurn({ text: "Alright, take care.", callSid: callLogId, endCall: true });
      callLog.outcome = "no_answer";
      await callLog.save();
      return res.type("text/xml").send(twiml);
    }

    callLog.transcript.push({ speaker: "lead", text: speechResult });

    const { reply, outcome, endCall } = await getNextTurn({
      pitchScript: owner.pitchScript,
      transcript: callLog.transcript,
      leadSpeechText: speechResult,
    });

    callLog.transcript.push({ speaker: "ai", text: reply });
    callLog.outcome = outcome === "continue" ? callLog.outcome : outcome;
    await callLog.save();

    // React to the outcome.
    if (outcome === "do_not_call") {
      callLog.lead.status = "do_not_call";
      await callLog.lead.save();
    } else if (outcome === "callback_requested") {
      callLog.lead.status = "callback_requested";
      await callLog.lead.save();
    } else if (outcome === "interested" || outcome === "closed") {
      callLog.lead.status = outcome === "closed" ? "closed" : "interested";
      await callLog.lead.save();
      await sendSMS({
        to: callLog.lead.phone,
        message: `Here's the link we talked about: ${FUNNEL_LINK}`,
      });
      callLog.smsLinkSent = true;
      await callLog.save();
    } else if (outcome === "not_interested") {
      callLog.lead.status = "called";
      await callLog.lead.save();
    }

    const twiml = await buildSpeechTurn({ text: reply, callSid: callLogId, endCall });
    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("[calls/event] error:", err);
    res.status(500).send("Server error.");
  }
});

// ------------------------------------------------------------------
// Twilio call status updates (ringing, answered, completed) — used
// to track minutes used and final call duration.
// ------------------------------------------------------------------
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
    res.sendStatus(200); // always 200 to Twilio even on internal errors
  }
});

router.get("/logs", requireAuth, async (req, res) => {
  const logs = await CallLog.find({ owner: req.user._id }).populate("lead").sort({ createdAt: -1 }).limit(200);
  res.json(logs);
});

module.exports = router;
