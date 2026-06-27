/**
 * services/conversationEngine.js
 * =================================
 * The AI brain driving each call. Takes the conversation so far +
 * the user's pitch script/knowledge base, asks Claude what to say
 * next, and detects outcomes (interested / closed / callback /
 * do-not-call) so the rest of the system can react.
 *
 * REQUIRED .env ADDITIONS
 * ------------------------
 *   ANTHROPIC_API_KEY=
 *
 * REQUIRED PACKAGE
 * -----------------
 *   npm install @anthropic-ai/sdk
 */

const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

/**
 * Builds the mandatory AI-disclosure opening line. Always the first
 * thing said on every call — non-negotiable, compliance requirement,
 * and in practice people don't hang up over it.
 * @param {string} businessName - the caller's business name (whoever
 *   is running this CallTwin account, i.e. the user, not the lead)
 */
function buildOpeningLine(businessName) {
  return `Hi, this is an AI assistant calling on behalf of ${businessName}. ` +
    `I'll keep this quick — do you have about a minute?`;
}

/**
 * Asks Claude for the next thing to say, given the conversation so far.
 *
 * @param {object} opts
 * @param {string} opts.pitchScript - the user's knowledge base / script
 *   (e.g. queenee_pitch_script.md content) — this is the system prompt's
 *   product knowledge, NOT changed per call.
 * @param {Array<{speaker:'ai'|'lead', text:string}>} opts.transcript -
 *   conversation so far, oldest first.
 * @param {string} opts.leadSpeechText - what the lead just said (the
 *   newest turn, not yet in transcript).
 * @returns {Promise<{reply:string, outcome:string, endCall:boolean}>}
 *   outcome is one of: 'continue' | 'interested' | 'closed' |
 *   'callback_requested' | 'do_not_call' | 'not_interested'
 */
async function getNextTurn({ pitchScript, transcript, leadSpeechText }) {
  const systemPrompt = `You are a sales calling assistant making a live phone call on behalf of a business. You have ONE job per turn: decide what to say next, and classify the state of the conversation.

KNOWLEDGE BASE / PITCH SCRIPT (use this for all product/pricing facts — never invent details not in here):
${pitchScript}

HARD RULES:
- Keep every reply SHORT — one or two sentences, like a real phone call, never a paragraph.
- If the lead says anything like "don't call me", "remove me", "stop calling", "take me off your list" -> classify outcome as "do_not_call" and end the call politely and immediately.
- If the lead says "send me the link", "I'm interested", "yes", "sounds good", "send it" -> classify outcome as "interested" and say you're texting the link now.
- If the lead explicitly says "I want to buy" / "sign me up" / "let's do it" -> classify outcome as "closed".
- If the lead says "call me back later", "not now", "I'm busy" -> classify outcome as "callback_requested".
- If the lead clearly declines with no interest ("no thanks", "not interested", "we're good") -> classify outcome as "not_interested" and end politely.
- Otherwise -> outcome is "continue".

Respond with ONLY valid JSON, no other text, no markdown fences:
{"reply": "what to say next", "outcome": "continue|interested|closed|callback_requested|do_not_call|not_interested"}`;

  const messages = transcript.map((turn) => ({
    role: turn.speaker === "ai" ? "assistant" : "user",
    content: turn.text,
  }));
  messages.push({ role: "user", content: leadSpeechText });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  let parsed;
  try {
    const cleaned = raw.replace(/^```json\s*|```\s*$/g, "");
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // If Claude didn't return clean JSON, fail safe: just say something
    // reasonable and continue rather than crashing the call.
    parsed = { reply: "Sorry, could you say that again?", outcome: "continue" };
  }

  const endCall = ["closed", "do_not_call", "not_interested"].includes(parsed.outcome);

  return { reply: parsed.reply, outcome: parsed.outcome, endCall };
}

module.exports = {
  buildOpeningLine,
  getNextTurn,
};
