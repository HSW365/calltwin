require('dotenv').config();
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

// Simple health check for Render + for you to confirm it's alive
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'queenee-assistant', time: new Date().toISOString() });
});

// Quick read-only lead viewer — hit this in a browser to see captured leads
app.get('/leads', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ leads: [], note: 'No database connected' });
  const leads = await CallLog.find({ status: 'lead_qualified' }).sort({ startedAt: -1 }).limit(100);
  res.json({ count: leads.length, leads });
});

// Same idea but for email activity — see what the AI handled vs escalated to you
app.get('/emails', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ emails: [], note: 'No database connected' });
  const emails = await EmailLog.find().sort({ receivedAt: -1 }).limit(100);
  res.json({ count: emails.length, emails });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`[server] QUEENEE virtual assistant listening on port ${PORT}`));
