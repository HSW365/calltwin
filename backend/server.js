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

app.use("/api/webhooks", webhooksRoutes);
app.use(express.json());
app.use("/audio", express.static(path.join(__dirname, "public/audio")));
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/billing", billingRoutes);

app.get("/", (req, res) => {
  res.json({ status: "CallTwin backend is running.", time: new Date().toISOString() });
});

function getCleanMongoUri() {
  let uri = process.env.MONGO_URI;
  if (!uri) return null;

  // Strip accidental wrapping quotes and leading/trailing whitespace —
  // common when a value is typed/pasted on a phone keyboard.
  uri = uri.trim().replace(/^['"]+|['"]+$/g, "");

  // Fix autocapitalize turning "mongodb" into "Mongodb" / "MongoDB" etc.
  uri = uri.replace(/^mongodb/i, "mongodb");

  // Print a SAFE preview (password masked) so we can see what's actually
  // there without ever printing the real password to logs.
  const preview = uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
  console.log("[server] MONGO_URI preview after cleanup:", preview.slice(0, 60));

  return uri;
}

async function start() {
  const mongoUri = getCleanMongoUri();

  if (!mongoUri) {
    console.error("FATAL: MONGO_URI is not set. Add it to your .env / Render env vars.");
    process.exit(1);
  }

  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    console.error(
      "FATAL: MONGO_URI doesn't start with mongodb:// or mongodb+srv:// even after cleanup."
    );
    console.error("First 20 characters seen:", JSON.stringify(mongoUri.slice(0, 20)));
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("[server] Connected to MongoDB.");
  startScheduler();
  app.listen(PORT, () => {
    console.log(`[server] CallTwin backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
