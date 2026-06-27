/**
 * services/voiceEngine.js — ElevenLabs implementation
 * ======================================================
 * Replaces the TODO stubs from the original build. Handles:
 *   - Cloning a user's uploaded voice samples into an ElevenLabs voice
 *   - Synthesizing speech (text -> audio) for each conversation turn,
 *     saved as a static file callEngine.js can hand to Twilio's <Play>
 *
 * REQUIRED .env ADDITIONS
 * ------------------------
 *   ELEVENLABS_API_KEY=
 *   PUBLIC_BASE_URL=https://yourdomain.com   <- same one callEngine.js uses
 *
 * REQUIRED PACKAGES
 * -------------------
 *   npm install axios uuid
 *
 * REQUIRED SERVER CHANGE (add this line in server.js, near the other
 * app.use() calls, if it's not already there):
 *   app.use("/audio", express.static(path.join(__dirname, "public/audio")));
 *
 * This serves the synthesized mp3 files at a public URL so Twilio can
 * fetch and play them during a call.
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = process.env.PUBLIC_BASE_URL;
const AUDIO_DIR = path.join(__dirname, "..", "public", "audio");

// Default voice used if a user hasn't cloned their own yet.
// "Adam" — a standard ElevenLabs premade voice, safe fallback.
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

if (!API_KEY) {
  console.warn(
    "[voiceEngine] WARNING: ELEVENLABS_API_KEY is not set. " +
    "Speech synthesis will fail until it's configured in .env."
  );
}

// Make sure the audio output directory exists.
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * Clones a voice from uploaded audio sample(s).
 * @param {object} opts
 * @param {string} opts.name - display name for the cloned voice
 * @param {Array<{filename: string, buffer: Buffer}>} opts.samples -
 *   audio file buffers uploaded by the user (routes/voice.js already
 *   handles the upload itself — this just sends them to ElevenLabs)
 * @returns {Promise<string>} the new ElevenLabs voice_id — save this
 *   on the user's record so synthesizeSpeech() can use it later
 */
async function cloneVoice({ name, samples }) {
  if (!samples || samples.length === 0) {
    throw new Error("cloneVoice: at least one audio sample is required");
  }

  const FormData = require("form-data");
  const form = new FormData();
  form.append("name", name);
  samples.forEach((sample) => {
    form.append("files", sample.buffer, { filename: sample.filename });
  });

  const response = await axios.post(
    "https://api.elevenlabs.io/v1/voices/add",
    form,
    {
      headers: {
        ...form.getHeaders(),
        "xi-api-key": API_KEY,
      },
    }
  );

  return response.data.voice_id;
}

/**
 * Synthesizes speech for one line of dialogue and saves it as a
 * static mp3 file, returning the public URL Twilio's <Play> can fetch.
 *
 * @param {string} text - what to say
 * @param {string} [voiceId] - ElevenLabs voice_id to use. Defaults to
 *   DEFAULT_VOICE_ID if the user hasn't cloned their own voice yet.
 * @returns {Promise<string>} public https URL to the generated mp3
 */
async function synthesizeSpeech(text, voiceId = DEFAULT_VOICE_ID) {
  if (!text) throw new Error("synthesizeSpeech: text is required");

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: "eleven_turbo_v2_5", // low-latency model, good for live calls
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    }
  );

  const filename = `${uuidv4()}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(filepath, response.data);

  // Clean up the file after 10 minutes — calls finish in well under
  // that, this just prevents the audio folder from growing forever.
  setTimeout(() => {
    fs.unlink(filepath, () => {});
  }, 10 * 60 * 1000);

  return `${BASE_URL}/audio/${filename}`;
}

module.exports = {
  cloneVoice,
  synthesizeSpeech,
  DEFAULT_VOICE_ID,
};
