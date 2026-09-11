/** SignalWire call engine for CallTwin. */
const { RestClient } = require("@signalwire/compatibility-api");
const { synthesizeSpeech } = require("./voiceEngine");

const SIGNALWIRE_SPACE = (process.env.SIGNALWIRE_SPACE || process.env.SIGNALWIRE_SPACE_URL || "")
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const FROM_NUMBER = process.env.SIGNALWIRE_PHONE_NUMBER;
const BASE_URL = process.env.PUBLIC_BASE_URL;

let client;
function getClient() {
  if (client) return client;

  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const apiToken = process.env.SIGNALWIRE_API_TOKEN;

  if (!projectId || !apiToken || !SIGNALWIRE_SPACE) {
    throw new Error(
      "SignalWire is not configured. Set SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, and SIGNALWIRE_SPACE in Render Environment."
    );
  }

  client = RestClient(projectId, apiToken, { signalwireSpaceUrl: SIGNALWIRE_SPACE });
  return client;
}

function assertRuntimeConfig() {
  if (!FROM_NUMBER) throw new Error("SIGNALWIRE_PHONE_NUMBER is not configured.");
  if (!BASE_URL) throw new Error("PUBLIC_BASE_URL is not configured.");
}

async function placeCall({ to, callSid }) {
  if (!to) throw new Error("placeCall: 'to' phone number is required");
  assertRuntimeConfig();
  const call = await getClient().calls.create({
    to,
    from: FROM_NUMBER,
    url: `${BASE_URL}/api/calls/twiml?callSid=${encodeURIComponent(callSid)}`,
    statusCallback: `${BASE_URL}/api/calls/status?callSid=${encodeURIComponent(callSid)}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]
  });
  return call.sid;
}

async function sendSMS({ to, message }) {
  if (!to || !message) throw new Error("sendSMS: 'to' and 'message' are required");
  assertRuntimeConfig();
  return getClient().messages.create({ to, from: FROM_NUMBER, body: message });
}

async function buildSpeechTurn({ text, callSid, endCall = false, voiceId = null }) {
  assertRuntimeConfig();
  const VoiceResponse = RestClient.LaML.VoiceResponse;
  const response = new VoiceResponse();
  const audioUrl = await synthesizeSpeech(text, voiceId || undefined);
  response.play(audioUrl);
  if (endCall) {
    response.hangup();
  } else {
    response.gather({
      input: "speech",
      action: `${BASE_URL}/api/calls/event?callSid=${encodeURIComponent(callSid)}`,
      method: "POST",
      speechTimeout: "auto",
      timeout: 5
    });
  }
  return response.toString();
}

module.exports = { placeCall, sendSMS, buildSpeechTurn };
