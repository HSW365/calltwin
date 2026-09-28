/**
 * Custom deals for specific businesses. One place, used by CallTwin billing and the AI Estimate add-on.
 *
 *   calltwinTrialDays  CallTwin receptionist free for N days, then the normal $99/mo.
 *   estimate: "comp"   AI Estimate add-on free (no trial clock, no monthly).
 *   licenseCents       optional one-time price to own the Estimate add-on outright.
 *
 * Matching is by owner email, or by exact business name ("New Ark", "New Ark Plumbing", not "Newark ...").
 */
const PROMOS = [
  {
    id: "newark",
    emails: ["joehernandez555@msn.com"],
    names: [/^\s*new ark(\s+plumbing)?(,?\s+(heating|hvac|llc|inc)\b.*)?\s*$/i, /^\s*ark plumbing\b/i],
    calltwinTrialDays: 30,
    estimate: "comp",
  },
];

function promoFor(client) {
  if (!client) return null;
  const email = String(client.ownerEmail || "").toLowerCase().trim();
  const name = String(client.businessName || "");
  return PROMOS.find((p) => (email && p.emails.includes(email)) || p.names.some((r) => r.test(name))) || null;
}

/** CallTwin side: give the promo trial once (only while the business hasn't paid or been comped). Returns true if changed. */
function applyClientPromo(c) {
  const p = promoFor(c);
  if (!p || !p.calltwinTrialDays || !c || c.promo === p.id) return false;
  c.promo = p.id;
  if (c.status === "trial" || c.status === "canceled") {
    c.trialEndsAt = new Date(Date.now() + p.calltwinTrialDays * 864e5); // 30 days from when the deal lands
    if (c.status === "canceled") c.status = "trial";
  }
  return true;
}

module.exports = { PROMOS, promoFor, applyClientPromo };
