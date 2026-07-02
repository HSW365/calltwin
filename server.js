require('dotenv').config();
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { connectDB, CallLog, EmailLog } = require('./services/db');
const voiceRoutes = require('./routes/voice');
const emailRoutes = require('./routes/email');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

connectDB();

app.use('/voice', voiceRoutes);
app.use('/email', emailRoutes);

// Serves public/index.html as the dashboard when you visit the root URL
app.use(express.static(path.join(__dirname, 'public')));

// Health check for Render + the dashboard's status indicator
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', service: 'queenee-assistant', time: new Date().toISOString() });
});

// Quick read-only lead viewer — the dashboard calls this, or hit it directly for raw JSON
app.get('/leads', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ leads: [], count: 0, totalCalls: 0, note: 'No database connected' });
  const leads = await CallLog.find({ status: 'lead_qualified' }).sort({ startedAt: -1 }).limit(100);
  const totalCalls = await CallLog.countDocuments();
  res.json({ count: leads.length, totalCalls, leads });
});

// Same idea but for email activity — see what the AI handled vs escalated to you
app.get('/emails', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ emails: [], count: 0, note: 'No database connected' });
  const emails = await EmailLog.find().sort({ receivedAt: -1 }).limit(100);
  res.json({ count: emails.length, emails });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`[server] QUEENEE virtual assistant listening on port ${PORT}`));
const smsRoutes = require('./routes/sms');
  app.use('/sms', smsRoutes);
