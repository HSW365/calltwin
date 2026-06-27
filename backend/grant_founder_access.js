#!/usr/bin/env node
/**
 * grant_founder_access.js
 * =========================
 * One-time setup script: grants hsw365media@gmail.com permanent,
 * unlimited, free access to CallTwin — bypasses the $20/mo Stripe
 * subscription gate entirely for this one account, and sets a real
 * password so you can log in immediately (this build has no
 * password-reset flow yet, so it's set directly here instead).
 *
 * USAGE
 * -----
 *   cd backend
 *   node grant_founder_access.js
 *
 * Prints the password to log in with. CHANGE IT after first login —
 * there's no "change password" route yet either; for now that means
 * editing the user document directly in MongoDB or re-running this
 * script with a new password below.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const FOUNDER_EMAIL = "hsw365media@gmail.com";
const FOUNDER_PASSWORD = "ChangeMe" + Math.floor(Math.random() * 1000000); // printed below, change after login

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("ERROR: MONGO_URI not found in .env — same one server.js uses.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  const User = require("./models/User");
  const passwordHash = await bcrypt.hash(FOUNDER_PASSWORD, 10);

  let user = await User.findOne({ email: FOUNDER_EMAIL });

  if (!user) {
    user = new User({
      email: FOUNDER_EMAIL,
      passwordHash,
      subscriptionStatus: "active",
      isFounderAccount: true,
      minutesIncluded: 999999,
      minutesUsed: 0,
    });
    console.log(`No existing account for ${FOUNDER_EMAIL} — creating one.`);
  } else {
    console.log(`Found existing account for ${FOUNDER_EMAIL} — upgrading it.`);
    user.passwordHash = passwordHash;
  }

  user.subscriptionStatus = "active";
  user.isFounderAccount = true;
  user.minutesIncluded = 999999;

  await user.save();

  console.log(`\nDone. ${FOUNDER_EMAIL} now has permanent free full access.`);
  console.log(`Login password: ${FOUNDER_PASSWORD}`);
  console.log("Save that — it's only printed this once.\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
