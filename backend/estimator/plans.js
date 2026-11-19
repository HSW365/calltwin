/**
 * HSW365 AI Estimate: the standalone service's plans, conversion packs and prices. One source of truth:
 * the landing page, the app, Stripe checkout and the sales emails all read these numbers.
 *
 * One "conversion" = one job's photos / video / voice turned into a finished estimate and proposal draft.
 * All money is whole cents.
 */
const PLANS = {
  solo:       { name: "Solo",       jobs: "Jobs under $5K",      monthlyCents: 4900,  included: 30,   overCents: 150, setupCents: 0,      users: 1,  blurb: "One person, small repairs and quick quotes." },
  crew:       { name: "Crew",       jobs: "Jobs $5K to $25K",    monthlyCents: 14700, included: 100,  overCents: 125, setupCents: 25000,  users: 3,  blurb: "Remodels, replacements and install crews." },
  pro:        { name: "Pro",        jobs: "Jobs $25K to $100K",  monthlyCents: 29700, included: 300,  overCents: 100, setupCents: 50000,  users: 10, blurb: "Multi-trade contractors bidding bigger work." },
  commercial: { name: "Commercial", jobs: "Jobs $100K and up",   monthlyCents: 79500, included: 1000, overCents: 75,  setupCents: 150000, users: 99, blurb: "Commercial and compliance work with custom forms." },
};

// Pay per conversion, no subscription. Priced by the size of the job.
const PACKS = {
  small: { name: "Small jobs",  jobs: "Under $5K",       unitCents: 900,  qty: 10 },
  mid:   { name: "Mid jobs",    jobs: "$5K to $25K",     unitCents: 1900, qty: 10 },
  large: { name: "Large jobs",  jobs: "$25K to $100K",   unitCents: 3900, qty: 5 },
  major: { name: "Major jobs",  jobs: "$100K and up",    unitCents: 7900, qty: 5 },
};
for (const p of Object.values(PACKS)) p.priceCents = p.unitCents * p.qty;

// Buy it outright. Tiers follow the State of New Jersey's own size standards (N.J.A.C. 17:13 Small Business Enterprise: no more than 100 full-time
// employees and gross revenue up to $500K, $5M or $12M), plus a top tier for firms over those limits and for state / public-works contractors
// (DPMC-classified or registered under the NJ Public Works Contractor Registration Act). Unlimited estimates, all job sizes, no badge.
// "buyout" = the license is yours for good. "year" = 12 months, priced at 40% of the buyout.
const LICENSES = {
  nj1:   { name: "Small business",     blurb: "NJ small business, up to $500K a year in revenue",          buyoutCents: 250000 },
  nj2:   { name: "Growing business",   blurb: "NJ small business, up to $5M a year in revenue",            buyoutCents: 350000 },
  nj3:   { name: "Established firm",   blurb: "Up to 100 employees and $12M a year in revenue",            buyoutCents: 450000 },
  state: { name: "State contractor",   blurb: "State / public-works contractors and firms over $12M or 100 employees", buyoutCents: 600000 },
};
for (const l of Object.values(LICENSES)) l.yearCents = Math.round(l.buyoutCents * 0.4 / 10000) * 10000;
const licenseCents = (key, term) => { const l = LICENSES[key]; return l ? (term === "year" ? l.yearCents : l.buyoutCents) : null; };

const TOPUP_QTY = 20; // extra conversions for subscribers, at their plan's overage rate
const FREE_TRIAL = 3; // new accounts try it free

const planOf = (key) => PLANS[key] || null;
const topupCents = (planKey) => (PLANS[planKey] ? PLANS[planKey].overCents * TOPUP_QTY : null);

/** What the app and landing page see. */
function publicPlans() {
  return {
    freeTrial: FREE_TRIAL,
    plans: Object.entries(PLANS).map(([key, p]) => ({ key, ...p, effectiveCents: Math.round(p.monthlyCents / p.included) })),
    packs: Object.entries(PACKS).map(([key, p]) => ({ key, ...p })),
    topupQty: TOPUP_QTY,
    licenses: Object.entries(LICENSES).map(([key, l]) => ({ key, ...l })),
  };
}

module.exports = { PLANS, PACKS, LICENSES, licenseCents, TOPUP_QTY, FREE_TRIAL, planOf, topupCents, publicPlans };
