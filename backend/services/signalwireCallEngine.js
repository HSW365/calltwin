/** SignalWire call engine for CallTwin. */
const { RestClient } = require("@signalwire/compatibility-api");
const { synthesizeSpeech } = require("./voiceEngine");

const client = RestClient(
  process.env.SIGNALWIRE_PROJECT_ID,
  process.env.SIGNALWIRE_API_TOKEN,
  { signalwireSpaceUrl: process.env.SIGNALWIRE_SPACE }
);

const FROM_NUMBER = process.env.SIGNALWIRE_PHONE_NUMBER;
const BASE_URL = process.env.PUBLIC_BASE_URL;

async function placeCall({ to, callSid }) {
  if (!to) throw new Error("placeCall: 'to' phone number is required");
  const call = await client.calls.create({
    to,
    from: FROM_NUMBER,
    url: `${BASE_URL}/api/calls/twiml?callSid=${encodeURIComponent(callSid)}`,
    statusCallback: `${BASE_URL}/api/calls/status?callSid=${encodeURIComponent(callSid)}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    machineDetection: "DetectMessageEnd"
  });
  return call.sid;
}

async function sendSMS({ to, message }) {
  if (!to || !message) throw new Error("sendSMS: 'to' and 'message' are required");
  return client.messages.create({ to, from: FROM_NUMBER, body: message });
}

async function buildSpeechTurn({ text, callSid, endCall = false }) {
  const VoiceResponse = RestClient.LaML.VoiceResponse;
  const response = new VoiceResponse();
  const audioUrl = await synthesizeSpeech(text);
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
