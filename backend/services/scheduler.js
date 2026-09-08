/**
 * services/scheduler.js
 * ========================
 * Runs active campaigns on a five-minute schedule and sends queued leads
 * through the configured telephony adapter.
 */

const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const Lead = require("../models/Lead");
const User = require("../models/User");
const CallLog = require("../models/CallLog");
const { placeCall } = require("./callEngine");

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function isWithinCallWindow(campaign) {
  const now = new Date();
  const hour = now.getHours();
  const dayKey = DAY_KEYS[now.getDay()];
  return campaign.daysActive.includes(dayKey) && hour >= campaign.startHour && hour < campaign.endHour;
}

async function runTick() {
  const activeCampaigns = await Campaign.find({ active: true });

  for (const campaign of activeCampaigns) {
    if (!isWithinCallWindow(campaign)) continue;

    const owner = await User.findById(campaign.owner);
    if (!owner || (owner.subscriptionStatus !== "active" && !owner.isLifetime && !owner.calltwinPurchased)) continue;
    if (owner.minutesUsed >= owner.minutesIncluded) continue;

    const queuedLeads = await Lead.find({ campaign: campaign._id, status: "queued" }).limit(campaign.callsPerTick);

    for (const lead of queuedLeads) {
      try {
        lead.status = "calling";
        await lead.save();

        const callLog = await CallLog.create({ owner: owner._id, lead: lead._id, outcome: "in_progress" });
        const providerCallId = await placeCall({ to: lead.phone, callSid: callLog._id.toString() });

        callLog.providerCallId = providerCallId;
        await callLog.save();
        console.log(`[scheduler] Dialed ${lead.businessName} (${lead.phone}) for campaign "${campaign.name}"`);
      } catch (err) {
        console.error(`[scheduler] Failed to call ${lead.businessName}:`, err.message);
        lead.status = "failed";
        await lead.save();
      }
    }
  }
}

function startScheduler() {
  cron.schedule("*/5 * * * *", () => {
    runTick().catch((err) => console.error("[scheduler] tick error:", err));
  });
  console.log("[scheduler] Started — checking for queued calls every 5 minutes.");
}

module.exports = { startScheduler, runTick };
