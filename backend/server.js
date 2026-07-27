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

app.use("/api/webhooks", webhooksRoutes);
app.use(express.json());
app.use("/audio", express.static(path.join(__dirname, "public/audio")));
app.use("/", legalRoutes); // serves /privacy and /terms — required for Twilio toll-free verification
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/billing", billingRoutes);

// JSON health check for uptime monitors
app.get("/health", (req, res) => {
  res.json({ status: "CallTwin backend is running.", time: new Date().toISOString() });
});

// Root landing page — real business website for Twilio toll-free verification.
// Programmatic clients that ask for JSON still get the health response.
app.get("/", (req, res) => {
  if (req.accepts(["html", "json"]) === "json") {
    return res.json({ status: "CallTwin backend is running.", time: new Date().toISOString() });
  }
  res.set("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CallTwin — AI Phone Receptionist &amp; SMS Scheduling for Small Business</title>
    <meta name="description" content="CallTwin is an AI-powered phone receptionist and SMS appointment scheduling service for small businesses.">
    <style>
      * { box-sizing:border-box; }
      body { background:#0a0a0f; color:#e5e5e5; font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
             margin:0; line-height:1.65; }
      .wrap { max-width:760px; margin:0 auto; padding:64px 24px 80px; }
      .brand { font-family:'Barlow Condensed',sans-serif; letter-spacing:1px; font-size:14px; color:#22d3ee; text-transform:uppercase; }
      h1 { font-family:'Barlow Condensed',sans-serif; font-size:44px; color:#fff; margin:8px 0 12px; line-height:1.1; }
      .tag { font-size:19px; color:#c9c9c9; margin-bottom:40px; }
      h2 { color:#22d3ee; font-size:20px; margin-top:40px; }
      p, li { color:#c9c9c9; font-size:15px; }
      ul { padding-left:20px; }
      a { color:#22d3ee; text-decoration:none; }
      a:hover { text-decoration:underline; }
      .card { background:#141419; border:1px solid #2a2a33; border-radius:12px; padding:20px 24px; margin-top:28px; }
      .foot { margin-top:48px; padding-top:24px; border-top:1px solid #2a2a33; font-size:14px; color:#888; }
      .foot a { margin-right:20px; }
    </style></head><body>
    <div class="wrap">
      <div class="brand">HSW365 Media</div>
      <h1>CallTwin</h1>
      <div class="tag">An AI-powered phone receptionist and SMS appointment scheduling service for small businesses.</div>

      <h2>What CallTwin Does</h2>
      <p>CallTwin answers calls, books appointments, and sends confirmations and reminders so small
      business owners never miss a customer. It handles the phone and scheduling work automatically,
      by voice and by text message.</p>
      <ul>
        <li>AI receptionist that answers and routes calls</li>
        <li>Automated appointment scheduling and confirmations</li>
        <li>SMS reminders so customers show up on time</li>
      </ul>

      <h2>Text Messaging Program</h2>
      <p>Business customers and the contacts they schedule may receive text messages related to
      appointment scheduling, confirmations, and reminders. <strong>Message frequency varies. Message
      and data rates may apply.</strong> Reply <strong>HELP</strong> for help or <strong>STOP</strong>
      to opt out at any time. No mobile information is shared with third parties or affiliates for
      marketing or promotional purposes.</p>

      <div class="card">
        Get started or ask a question: <a href="mailto:hsw365media@gmail.com">hsw365media@gmail.com</a>
        &nbsp;·&nbsp; (856) 796-8081
      </div>

      <div class="foot">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms &amp; Conditions</a>
        <span>© ${new Date().getFullYear()} HSW365 Media LLC</span>
      </div>
    </div>
  </body></html>`);
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
