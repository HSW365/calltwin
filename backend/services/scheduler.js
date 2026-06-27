/**
 * services/scheduler.js
 * ========================
 * The "runs 365 days a year without a human" piece. Checks every 5
 * minutes for active campaigns currently inside their calling window,
 * and dials the next batch of queued leads automatically.
 *
 * This is started once in server.js and then just runs forever in
 * the background — nothing else needs to trigger it.
 *
 * REQUIRED PACKAGE
 * -----------------
 *   npm install node-cron
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
  // Note: for true multi-timezone accuracy, convert `now` using
  // campaign.timezone via a library like luxon. Kept simple here —
  // assumes the server's local time roughly matches your target
  // calling region, or that you run one timezone for now.
  const hour = now.getHours();
  const dayKey = DAY_KEYS[now.getDay()];

  const dayOk = campaign.daysActive.includes(dayKey);
  const hourOk = hour >= campaign.startHour && hour < campaign.endHour;
  return dayOk && hourOk;
}

async function runTick() {
  const activeCampaigns = await Campaign.find({ active: true });

  for (const campaign of activeCampaigns) {
    if (!isWithinCallWindow(campaign)) continue;

    const owner = await User.findById(campaign.owner);
    if (!owner || owner.subscriptionStatus !== "active") continue; // unpaid/founder-only accounts can call
    if (owner.minutesUsed >= owner.minutesIncluded) continue; // out of minutes this cycle

    const queuedLeads = await Lead.find({
      campaign: campaign._id,
      status: "queued",
    }).limit(campaign.callsPerTick);

    for (const lead of queuedLeads) {
      try {
        lead.status = "calling";
        await lead.save();

        const callLog = await CallLog.create({
          owner: owner._id,
          lead: lead._id,
          outcome: "in_progress",
        });

        const twilioSid = await placeCall({
          to: lead.phone,
          callSid: callLog._id.toString(),
        });

        callLog.twilioCallSid = twilioSid;
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
  // Every 5 minutes, forever, no human trigger required.
  cron.schedule("*/5 * * * *", () => {
    runTick().catch((err) => console.error("[scheduler] tick error:", err));
  });
  console.log("[scheduler] Started — checking for queued calls every 5 minutes.");
}

module.exports = { startScheduler, runTick };
