const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { placeCall, sendSMS, startConversationRelay, hangupCall, decodeClientState } = require("../services/callEngine");
const { buildOpeningLine, getNextTurn } = require("../services/conversationEngine");
const Lead = require("../models/Lead");
const CallLog = require("../models/CallLog");
const User = require("../models/User");

const router = express.Router();
const FUNNEL_LINK = process.env.FUNNEL_LINK || "https://hsw365.github.io/QUEENEE.github.io/signup.html";
const DEFAULT_OFFER_SMS = `Hi, this is HSW365Media. We build modern websites + a 24/7 AI front desk assistant that answers every call so your business never misses one. Free demo, no cost to look: ${FUNNEL_LINK} Reply STOP to opt out.`;

async function getCallLog(callLogId) {
  return CallLog.findById(callLogId).populate("lead");
}

async function handleLeadTurn(callLog, owner, speechResult) {
  if (!speechResult || !speechResult.trim()) return { reply: "I didn't catch that. Could you say that again?", outcome: "continue", endCall: false };

  callLog.transcript.push({ speaker: "lead", text: speechResult });
  const result = await getNextTurn({
    pitchScript: owner.pitchScript,
    transcript: callLog.transcript,
    leadSpeechText: speechResult,
  });
  callLog.transcript.push({ speaker: "ai", text: result.reply });
  callLog.outcome = result.outcome === "continue" ? callLog.outcome : result.outcome;
  await callLog.save();
  return result;
}

router.post("/sms/:leadId", requireAuth, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, owner: req.user._id });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (!lead.phone) return res.status(400).json({ error: "Lead has no phone number." });
    if (lead.status === "do_not_call") return res.status(400).json({ error: "Lead is marked do_not_call." });
    if (lead.smsSentAt) return res.json({ skipped: true, reason: "already texted", smsSentAt: lead.smsSentAt });

    const message = req.body.message || DEFAULT_OFFER_SMS;
    await sendSMS({ to: lead.phone, message });
    lead.smsSentAt = new Date();
    await lead.save();
    res.json({ success: true, leadId: lead._id, phone: lead.phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/dial/:leadId", requireAuth, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, owner: req.user._id });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (lead.status === "do_not_call") return res.status(403).json({ error: "Lead is flagged do-not-call." });

    const callLog = await CallLog.create({ owner: req.user._id, lead: lead._id, outcome: "in_progress" });
    const providerCallId = await placeCall({ to: lead.phone, callSid: callLog._id.toString() });
    callLog.providerCallId = providerCallId;
    await callLog.save();

    lead.status = "calling";
    await lead.save();
    res.json({ callLogId: callLog._id, providerCallId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Telnyx webhook. Configure the Telnyx webhook URL as PUBLIC_BASE_URL/api/calls/telnyx-webhook.
router.post("/telnyx-webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const event = req.body?.data;
    const payload = event?.payload || {};
    const eventType = event?.event_type;
    const callControlId = payload?.call_control_id || payload?.call_leg_id;
    const state = decodeClientState(payload?.client_state);
    const callLogId = state?.callLogId;
    if (!callLogId) return;

    const callLog = await getCallLog(callLogId);
    if (!callLog) return;
    const owner = await User.findById(callLog.owner);
    if (!owner) return;

    if (eventType === "call.answered") {
      const opening = buildOpeningLine(owner.businessName || "our company");
      callLog.transcript.push({ speaker: "ai", text: opening });
      callLog.providerCallId = callControlId || callLog.providerCallId;
      await callLog.save();
      await startConversationRelay({ callControlId, callLogId, greeting: opening });
      return;
    }

    if (eventType === "call.hangup" || eventType === "call.failed") {
      callLog.outcome = eventType === "call.failed" ? "failed" : (callLog.outcome === "in_progress" ? "completed" : callLog.outcome);
      callLog.durationSeconds = Number(payload?.call_duration_secs || payload?.duration_secs || 0);
      await callLog.save();
      return;
    }
  } catch (err) {
    console.error("[calls/telnyx-webhook]", err);
  }
});

// Conversation Relay websocket events are POSTed by Telnyx to the public webhook URL when configured.
router.post("/conversation-relay", async (req, res) => {
  try {
    const { callLogId, text, transcript, event, client_state } = req.body || {};
    const state = decodeClientState(client_state);
    const id = callLogId || state?.callLogId;
    const callLog = await getCallLog(id);
    if (!callLog) return res.status(404).json({ error: "Call not found." });
    const owner = await User.findById(callLog.owner);
    if (!owner) return res.status(404).json({ error: "Owner not found." });

    if (event === "transcript" || event === "user_transcript" || text) {
      const speech = text || transcript;
      const result = await handleLeadTurn(callLog, owner, speech);
      if (["interested", "closed"].includes(result.outcome) && callLog.lead?.phone) {
        await sendSMS({ to: callLog.lead.phone, message: `Here's the link we talked about: ${FUNNEL_LINK}` });
        callLog.smsLinkSent = true;
        await callLog.save();
      }
      return res.json({ reply: result.reply, outcome: result.outcome, endCall: !!result.endCall });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[calls/conversation-relay]", err);
    res.status(500).json({ error: "Conversation processing failed." });
  }
});

router.get("/logs", requireAuth, async (req, res) => {
  const logs = await CallLog.find({ owner: req.user._id }).populate("lead").sort({ createdAt: -1 }).limit(200);
  res.json(logs);
});

module.exports = router;
