require("dotenv").config();
// Accept common alternate names for secrets so a key saved under a different name still works.
(function envAliases() {
  const pick = (target, names) => {
    if (process.env[target]) return;
    for (const n of names) if (process.env[n]) { process.env[target] = String(process.env[n]).trim(); console.log(`[env] ${target} <- ${n}`); return; }
  };
  pick("SIGNALWIRE_API_TOKEN", ["SIGNALWIRE_API", "SIGNALWIRE_TOKEN", "SIGNALWIRE_AUTH_TOKEN", "SIGNALWIRE_API_KEY", "SIGNALWIRE_REST_API_TOKEN", "SW_API_TOKEN", "SW_TOKEN"]);
  pick("SIGNALWIRE_PROJECT_ID", ["SIGNALWIRE_PROJECT", "SIGNALWIRE_PROJECT_KEY", "SW_PROJECT_ID"]);
  pick("SIGNALWIRE_SPACE", ["SIGNALWIRE_SPACE_URL", "SIGNALWIRE_SPACE_NAME", "SIGNALWIRE_API_HOSTNAME", "SW_SPACE"]);
  pick("STRIPE_SECRET_KEY", ["STRIPE_SECRET", "STRIPE_API_KEY", "STRIPE_KEY", "STRIPE_SK"]);
  const sp = process.env.SIGNALWIRE_SPACE;
  if (sp && !sp.includes(".")) process.env.SIGNALWIRE_SPACE = sp + ".signalwire.com";
})();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const authRoutes = require("./routes/auth");
const leadsRoutes = require("./routes/leads");
const campaignsRoutes = require("./routes/campaigns");
const callsRoutes = require("./routes/calls");
const voiceRoutes = require("./routes/voice");
const billingRoutes = require("./routes/billing");
const webhooksRoutes = require("./routes/webhooks");
const legalRoutes = require("./routes/legal");
const { router: inboundRoutes, ensureInboundRouting } = require("./routes/inbound");
const { router: newarkRoutes } = require("./routes/newark");
const { router: clientRoutes } = require("./routes/clients");
const { startScheduler } = require("./services/scheduler");
const { router: estimateRoutes } = require("./estimate/routes");
const { startEstimateScheduler } = require("./estimate/service");
const app = express();
const PORT = process.env.PORT || 3000;

// Stripe requires the raw request body for webhook signature verification.
app.use("/api/webhooks", webhooksRoutes);
// Inbound calls (SignalWire posts form-encoded) -> ElevenLabs AI receptionist.
app.use("/api/inbound", inboundRoutes);
// New Ark client: owner SMS alerts + voicemail capture.
app.use("/api/newark", newarkRoutes);
// Self-serve CallTwin clients (signup, AI lead tool, owner portal, admin).
app.use("/api/clients", clientRoutes);
// HSW365 AI Estimate add-on (estimates, proposals, e-sign, deposits, follow-ups).
app.use("/api/estimates", estimateRoutes);
app.use(express.json());
app.use("/audio", express.static(path.join(__dirname, "public/audio")));
app.use("/", legalRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/billing", billingRoutes);

app.get("/health", (req, res) => res.json({ status: "ok", service: "CallTwin", time: new Date().toISOString() }));
app.get("/", (req, res) => res.redirect(302, "/health"));

function getCleanMongoUri() {
  let uri = process.env.MONGO_URI;
  if (!uri) return null;
  uri = uri.trim().replace(/^['\"]+|['\"]+$/g, "").replace(/^mongodb/i, "mongodb");
  const preview = uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
  console.log("[server] MONGO_URI preview:", preview.slice(0, 60));
  return uri;
}

async function start() {
  const mongoUri = getCleanMongoUri();
  if (!mongoUri) { console.error("FATAL: MONGO_URI is not set."); process.exit(1); }
  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) { console.error("FATAL: invalid MONGO_URI."); process.exit(1); }
  await mongoose.connect(mongoUri);
  console.log("[server] Connected to MongoDB.");
  startScheduler();
  startEstimateScheduler();
  app.listen(PORT, () => {
    console.log(`[server] CallTwin listening on ${PORT}`);
    ensureInboundRouting().catch((e) => console.error("[inbound] routing error:", e.message));
  });
}
start().catch((err) => { console.error("[server] Failed to start:", err); process.exit(1); });