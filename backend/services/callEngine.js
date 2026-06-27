/**
 * services/callEngine.js — Twilio implementation
 * =================================================
 * Replaces the TODO stubs from the original build. Handles:
 *   - Placing outbound calls
 *   - Sending the SMS close-link
 *   - Generating the TwiML that drives each turn of the conversation
 *
 * This pairs with conversationEngine.js (already built, Claude-powered)
 * via the existing /api/calls/event webhook described in the README.
 *
 * ARCHITECTURE (TwiML + webhook loop, not raw media streams):
 *   1. placeCall() tells Twilio to dial out and hit /api/calls/twiml
 *      as soon as the lead answers.
 *   2. That route calls buildSpeechTurn() to generate TwiML: play the
 *      AI's line (audio from voiceEngine.js) then <Gather input="speech">
 *      to capture what the lead says next.
 *   3. Twilio POSTs the transcribed speech to /api/calls/event.
 *   4. conversationEngine.js (Claude) decides the next line.
 *   5. Loop repeats via buildSpeechTurn() until the call ends or closes.
 *
 * This uses Twilio's built-in speech recognition (<Gather input="speech">)
 * instead of a separate STT provider or raw Media Streams — simpler to
 * run reliably, slightly higher latency than full duplex streaming.
 * Good enough for a sales pitch call; revisit if you want sub-second
 * barge-in later.
 *
 * REQUIRED .env ADDITIONS
 * ------------------------
 *   TWILIO_ACCOUNT_SID=
 *   TWILIO_AUTH_TOKEN=
 *   TWILIO_PHONE_NUMBER=+1...        <- your Twilio number
 *   PUBLIC_BASE_URL=https://yourdomain.com   <- must be a real public
 *                                                HTTPS URL Twilio can
 *                                                reach (no localhost)
 *
 * REQUIRED PACKAGE
 * -----------------
 *   npm install twilio
 */

const twilio = require("twilio");
const { synthesizeSpeech } = require("./voiceEngine");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const BASE_URL = process.env.PUBLIC_BASE_URL;

if (!FROM_NUMBER || !BASE_URL) {
  console.warn(
    "[callEngine] WARNING: TWILIO_PHONE_NUMBER or PUBLIC_BASE_URL is not set. " +
    "Calls will fail until both are configured in .env."
  );
}

/**
 * Places an outbound call to a lead.
 * @param {object} opts
 * @param {string} opts.to - lead's phone number, E.164 format (+1...)
 * @param {string} opts.callSid - your own internal call/log id, passed
 *   through as a query param so /api/calls/twiml and /api/calls/event
 *   know which campaign/lead/call-log row this belongs to.
 * @returns {Promise<string>} the Twilio Call SID
 */
async function placeCall({ to, callSid }) {
  if (!to) throw new Error("placeCall: 'to' phone number is required");

  const call = await client.calls.create({
    to,
    from: FROM_NUMBER,
    url: `${BASE_URL}/api/calls/twiml?callSid=${encodeURIComponent(callSid)}`,
    statusCallback: `${BASE_URL}/api/calls/status?callSid=${encodeURIComponent(callSid)}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    machineDetection: "DetectMessageEnd", // detect voicemail vs human
  });

  return call.sid;
}

/**
 * Sends the SMS close-link once interest is detected.
 * @param {object} opts
 * @param {string} opts.to - lead's phone number, E.164 format
 * @param {string} opts.message - text body (conversationEngine.js
 *   builds this; typically includes the funnel link)
 */
async function sendSMS({ to, message }) {
  if (!to || !message) throw new Error("sendSMS: 'to' and 'message' are required");

  return client.messages.create({
    to,
    from: FROM_NUMBER,
    body: message,
  });
}

/**
 * Builds the TwiML for a single conversation turn: play the AI's
 * line, then listen for the lead's response.
 *
 * @param {object} opts
 * @param {string} opts.text - what the AI should say this turn
 *   (conversationEngine.js generates this text)
 * @param {string} opts.callSid - internal call id, threaded through so
 *   the next webhook hit knows the context
 * @param {boolean} [opts.endCall=false] - if true, plays the line and
 *   hangs up instead of gathering a response (used for closing lines,
 *   voicemail drops, or do-not-call acknowledgments)
 * @returns {Promise<string>} TwiML XML string
 */
async function buildSpeechTurn({ text, callSid, endCall = false }) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twimlResponse = new VoiceResponse();

  const audioUrl = await synthesizeSpeech(text);
  twimlResponse.play(audioUrl);

  if (endCall) {
    twimlResponse.hangup();
  } else {
    const gather = twimlResponse.gather({
      input: "speech",
      action: `${BASE_URL}/api/calls/event?callSid=${encodeURIComponent(callSid)}`,
      method: "POST",
      speechTimeout: "auto",
      timeout: 5,
    });
    // If the lead says nothing at all, Twilio falls through here —
    // give it one more gentle nudge before the call just ends naturally
    // on the next silence.
    const nudgeAudio = await synthesizeSpeech("You still there? No worries either way.");
    gather.play(nudgeAudio);
  }

  return twimlResponse.toString();
}

/**
 * Validates a Twilio webhook request is actually from Twilio (not
 * spoofed). Call this at the top of /api/calls/twiml and
 * /api/calls/event before trusting the request body.
 */
function validateTwilioRequest(req) {
  const signature = req.headers["x-twilio-signature"];
  const url = `${BASE_URL}${req.originalUrl}`;
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );
}

module.exports = {
  placeCall,
  sendSMS,
  buildSpeechTurn,
  validateTwilioRequest,
};
