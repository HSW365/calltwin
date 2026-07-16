const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { placeCall, sendSMS, buildSpeechTurn } = require("../services/callEngine");
const { buildOpeningLine, getNextTurn } = require("../services/conversationEngine");
const Lead = require("../models/Lead");
const CallLog = require("../models/CallLog");
const User = require("../models/User");

const router = express.Router();

// Where the SMS close-link sends leads. Defaults to the QUEENEE.io free-demo
// signup page (HSW365 Front Desk + Website offer). Override with FUNNEL_LINK
// in the environment to point a specific campaign elsewhere (e.g. back to
// the CallTwin dashboard signup at `${PUBLIC_BASE_URL}/dashboard`).
const FUNNEL_LINK =
  process.env.FUNNEL_LINK || "https://hsw365.github.io/QUEENEE.github.io/signup.html";

// Default cold-outreach text for the HSW365 Front Desk + Website offer.
// Kept short (fits one SMS segment) and always includes an opt-out per
// carrier/TCPA best practice for unsolicited marketing texts.
const DEFAULT_OFFER_SMS =
  `Hi, this is HSW365Media. We build modern websites + a 24/7 AI front desk ` +
  `assistant that answers every call so your business never misses one. ` +
  `Free demo, no cost to look: ${FUNNEL_LINK} Reply STOP to opt out.`;

// ------------------------------------------------------------------
// Cold SMS outreach — texts a lead directly with the offer, independent
// of the calling pipeline (no call has to happen first). Used by the
// automated outreach script (see calltwin repo: hsw365_sms_outreach.py),
// but also callable one-off from the dashboard.
// ------------------------------------------------------------------
router.post("/sms/:leadId", requireAuth, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, owner: req.user._id });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (!lead.phone) return res.status(400).json({ error: "Lead has no phone number." });
    if (lead.status === "do_not_call") {
      return res.status(400).json({ error: "Lead is marked do_not_call." });
    }
    if (lead.smsSentAt) {
      return res.json({ skipped: true, reason: "already texted", smsSentAt: lead.smsSentAt });
    }

    const message = req.body.message || DEFAULT_OFFER_SMS;
    await sendSMS({ to: lead.phone, message });
    lead.smsSentAt = new Date();
    await lead.save();
    res.json({ success: true, leadId: lead._id, phone: lead.phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
