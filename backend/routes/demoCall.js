/**
 * /api/demo-call — "Get your AI call FREE".
 *   POST /request   from the website form (CORS open). Body: name, business, website, phone, email, consent
 *   GET  /consent   the consent wording the form must show
 *   POST /answer    SignalWire: call answered
 *   POST /turn      SignalWire: caller spoke (SpeechResult)
 *   POST /status    SignalWire: call status updates
 */
const express = require("express");
const svc = require("../services/demoCall");

const router = express.Router();
router.use(express.json({ limit: "50kb" }));
router.use(express.urlencoded({ extended: false }));
router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "content-type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const ipOf = (req) => String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
const xml = (res, body) => res.type("text/xml").send(body);
const hangup = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

router.get("/consent", (req, res) => res.json({ text: svc.CONSENT_TEXT }));

router.post("/request", async (req, res) => {
  try {
    const out = await svc.requestDemo(req.body || {}, { ip: ipOf(req), ua: req.headers["user-agent"] });
    res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    console.error("[demo-call] request:", e.message);
    res.status(500).json({ ok: false, error: "Something went wrong. Try again in a minute." });
  }
});

router.post("/answer", async (req, res) => {
  try { xml(res, await svc.answer(req.query.id, req.body.AnsweredBy)); }
  catch (e) { console.error("[demo-call] answer:", e.message); xml(res, hangup); }
});

router.post("/turn", async (req, res) => {
  try { xml(res, await svc.turn(req.query.id, req.body.SpeechResult, req.query.silent)); }
  catch (e) { console.error("[demo-call] turn:", e.message); xml(res, hangup); }
});

router.post("/status", async (req, res) => {
  res.sendStatus(204);
  svc.status(req.query.id, req.body || {}).catch((e) => console.error("[demo-call] status:", e.message));
});

module.exports = { router };
