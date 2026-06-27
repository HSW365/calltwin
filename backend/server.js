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
const { startScheduler } = require("./services/scheduler");

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Stripe webhooks need the raw body, so this route is
// mounted BEFORE express.json() — do not move it below.
app.use("/api/webhooks", webhooksRoutes);

app.use(express.json());

// Serves synthesized speech audio so Twilio's <Play> can fetch it.
app.use("/audio", express.static(path.join(__dirname, "public/audio")));

app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/billing", billingRoutes);

// Health check — also what Render pings to confirm the service is alive.
app.get("/", (req, res) => {
  res.json({ status: "CallTwin backend is running.", time: new Date().toISOString() });
});

async function start() {
  if (!process.env.MONGO_URI) {
    console.error("FATAL: MONGO_URI is not set. Add it to your .env / Render env vars.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("[server] Connected to MongoDB.");

  startScheduler(); // this is what makes it run 24/7 with no human trigger

  app.listen(PORT, () => {
    console.log(`[server] CallTwin backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
