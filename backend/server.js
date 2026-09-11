require("dotenv").config();
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
const { startScheduler } = require("./services/scheduler");
const app = express();
const PORT = process.env.PORT || 3000;

// Stripe requires the raw request body for webhook signature verification.
app.use("/api/webhooks", webhooksRoutes);
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
  app.listen(PORT, () => console.log(`[server] CallTwin listening on ${PORT}`));
}
start().catch((err) => { console.error("[server] Failed to start:", err); process.exit(1); });