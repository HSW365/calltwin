#!/usr/bin/env python3
"""
calltwin_lead_hunter.py
Finds local businesses with NO website using OpenStreetMap's Overpass API
(completely free, no key, no billing account), scores them by how badly
they need one, and pushes them directly into the CallTwin lead database
via the API.

Originally used Google Places API — switched because Places requires an
active Google Cloud billing account even for free-tier usage, which isn't
available right now. Overpass needs nothing at all.

Tradeoff vs Google Places: OSM's "no website" signal is weaker than
Google's — a business missing the `website` tag on OpenStreetMap might
still have a real site that just was never tagged. Score accordingly and
treat this as "likely no website," not a guarantee. Still a strong,
genuinely free signal at this ICP (small local service businesses).

Run manually:   python calltwin_lead_hunter.py
Run on cron:    see .github/workflows/lead-hunter.yml

Requirements: pip install -r requirements.txt
"""

import os, requests, time, json, csv
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

CALLTWIN_API_URL  = os.getenv('CALLTWIN_API_URL', 'https://calltwin.onrender.com')
CALLTWIN_TOKEN    = os.getenv('CALLTWIN_USER_TOKEN')  # JWT from /api/auth/login
CALLTWIN_CAMPAIGN = os.getenv('CALLTWIN_CAMPAIGN_ID') # campaign to add leads to

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "CallTwin-LeadHunter/1.0 (hsw365media@gmail.com)"

# ── TARGET MARKET ────────────────────────────────────────────────────────────
# One region covering South Jersey + the Philly suburbs, searched as a single
# radius around a central point rather than city-by-city — simpler and more
# reliable than geocoding each town, and each lead's city comes straight off
# its OSM address tags.
SEARCH_LAT = 39.4864       # Vineland, NJ
SEARCH_LNG = -75.0257
SEARCH_RADIUS_METERS = 80000  # ~50 miles, covers South Jersey + Philly metro

# Business type -> OSM tag(s). Only categories with a solid, reliable OSM
# tag are included — types with no good OSM equivalent (towing, moving,
# catering, pest control, fence company, wedding venue) are left out rather
# than guessing with an unreliable tag.
CATEGORY_TAGS = {
    "auto repair shop":     [("shop", "car_repair")],
    "hair salon":           [("shop", "hairdresser")],
    "nail salon":           [("shop", "beauty")],
    "restaurant":           [("amenity", "restaurant")],
    "plumber":              [("craft", "plumber")],
    "electrician":          [("craft", "electrician")],
    "landscaping":          [("craft", "gardener")],
    "daycare center":       [("amenity", "childcare")],
    "tax preparer":         [("office", "tax_advisor")],
    "insurance agency":     [("office", "insurance")],
    "real estate agent":    [("office", "estate_agent")],
    "law office":           [("office", "lawyer")],
    "dentist":              [("amenity", "dentist")],
    "gym":                  [("leisure", "fitness_centre")],
    "bakery":               [("shop", "bakery")],
    "florist":              [("shop", "florist")],
    "photographer":         [("craft", "photographer")],
    "funeral home":         [("shop", "funeral_directors")],
    "printing shop":        [("shop", "copyshop")],
    "alterations tailor":   [("shop", "tailor")],
    "roofing contractor":   [("craft", "roofer")],
}

MAX_RESULTS_PER_CATEGORY = 25  # keep runs fast; the Philly metro can return hundreds

DEBUG_FILE = os.path.join(os.path.dirname(__file__), "lead_hunter_debug.json")
_debug_entries = []


def _log_debug(query, status_code, body_snippet):
    _debug_entries.append({
        "query": query,
        "status_code": status_code,
        "response_snippet": body_snippet[:300],
        "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })


def _flush_debug():
    with open(DEBUG_FILE, "w") as f:
        json.dump(_debug_entries, f, indent=2)


# ── OVERPASS SEARCH ──────────────────────────────────────────────────────────

def search_overpass(category, tag_pairs):
    """One Overpass QL call for a category. Returns list of element dicts."""
    clauses = []
    for key, value in tag_pairs:
        for kind in ("node", "way"):
            clauses.append(
                f'{kind}["{key}"="{value}"](around:{SEARCH_RADIUS_METERS},'
                f'{SEARCH_LAT},{SEARCH_LNG});'
            )
    ql = f"[out:json][timeout:30];\n(\n  " + "\n  ".join(clauses) + "\n);\nout center tags;"

    resp = requests.post(
        OVERPASS_URL, data={"data": ql}, headers={"User-Agent": USER_AGENT}, timeout=45
    )
    _log_debug(category, resp.status_code, resp.text)
    if resp.status_code != 200:
        print(f"    Overpass error {resp.status_code}: {resp.text[:200]}")
        return []
    return resp.json().get("elements", [])


# ── LEAD SCORING ─────────────────────────────────────────────────────────────

def score_lead(tags, business_type):
    """
    Returns a score 0-100. Higher = more likely to buy a website.
    - No website tag = +60 (the whole point — treated as "likely no site")
    - Has phone = +20
    - High-value business type = +10
    """
    score = 0
    if not (tags.get("website") or tags.get("contact:website")):
        score += 60
    if tags.get("phone") or tags.get("contact:phone"):
        score += 20
    high_value = ["dentist", "law office", "real estate", "insurance"]
    if any(h in business_type for h in high_value):
        score += 10
    return score


# ── PUSH TO CALLTWIN ─────────────────────────────────────────────────────────

def push_lead_to_calltwin(lead):
    """Posts a single lead to the CallTwin API. Returns the created lead's id, or None."""
    if not CALLTWIN_TOKEN:
        return None
    headers = {"Authorization": f"Bearer {CALLTWIN_TOKEN}", "Content-Type": "application/json"}
    r = requests.post(f"{CALLTWIN_API_URL}/api/leads", json=lead, headers=headers, timeout=10)
    if r.status_code == 200:
        try:
            return r.json().get("_id") or r.json().get("id")
        except Exception:
            return True
    return None


def add_lead_to_campaign(lead_id):
    if not CALLTWIN_TOKEN or not CALLTWIN_CAMPAIGN or not lead_id:
        return
    headers = {"Authorization": f"Bearer {CALLTWIN_TOKEN}", "Content-Type": "application/json"}
    requests.patch(
        f"{CALLTWIN_API_URL}/api/campaigns/{CALLTWIN_CAMPAIGN}",
        json={"$push": {"leadIds": lead_id}},
        headers=headers,
        timeout=10
    )


# ── MAIN ──────────────────────────────────────────────────────────────────────

def clean_phone(raw):
    """Strip formatting from OSM phone tags."""
    if not raw:
        return None
    digits = ''.join(c for c in raw if c.isdigit())
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    return None


def address_parts(tags):
    city = tags.get("addr:city", "")
    state = tags.get("addr:state", "NJ")
    full = ", ".join(p for p in (
        " ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p),
        city, state,
    ) if p)
    return city, state, full


def run():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    csv_path = f"leads_{timestamp}.csv"
    total_found = 0
    total_no_website = 0
    total_pushed = 0

    all_leads = []
    seen_phones = set()
    seen_names = set()

    print(f"\n{'='*60}")
    print(f"  CALLTWIN LEAD HUNTER (free/OSM) — {timestamp}")
    print(f"  {len(CATEGORY_TAGS)} business types, ~50mi radius around Vineland NJ")
    print(f"{'='*60}\n")

    for biz_type, tag_pairs in CATEGORY_TAGS.items():
        print(f"  Searching: {biz_type}...", end=" ", flush=True)
        try:
            elements = search_overpass(biz_type, tag_pairs)
            total_found += len(elements)
            count = 0

            for el in elements[:MAX_RESULTS_PER_CATEGORY]:
                tags = el.get("tags", {})
                name = tags.get("name")
                if not name or name in seen_names:
                    continue

                if tags.get("website") or tags.get("contact:website"):
                    continue  # already has a site — skip

                phone = clean_phone(tags.get("phone") or tags.get("contact:phone"))
                if not phone or phone in seen_phones:
                    continue
                seen_phones.add(phone)
                seen_names.add(name)

                score = score_lead(tags, biz_type)
                if score < 60:
                    continue  # must clear the no-website minimum

                city, state, full_address = address_parts(tags)

                lead = {
                    "businessName": name,
                    "contactName": "",  # OSM doesn't give owner names
                    "phone": phone,
                    "city": city,
                    "state": state,
                    "businessType": biz_type,
                    "score": score,
                    "address": full_address,
                }
                all_leads.append(lead)
                total_no_website += 1
                count += 1

            print(f"{count} no-website leads")
            time.sleep(1)  # be polite to the free public Overpass instance

        except Exception as e:
            print(f"ERROR: {e}")
            continue

    # Sort by score — highest first = best leads dialed first
    all_leads.sort(key=lambda x: x["score"], reverse=True)

    # Push to CallTwin API
    print(f"\n  Pushing {len(all_leads)} leads to CallTwin...")
    for lead in all_leads:
        payload = {
            "businessName": lead["businessName"],
            "contactName":  lead["contactName"],
            "phone":        lead["phone"],
            "city":         lead["city"],
            "state":        lead["state"],
        }
        try:
            lead_id = push_lead_to_calltwin(payload)
            if lead_id:
                total_pushed += 1
                add_lead_to_campaign(lead_id if isinstance(lead_id, str) else None)
        except Exception as e:
            print(f"    Push failed for {lead['businessName']}: {e}")

    # Also save CSV backup
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["businessName","contactName","phone","city","state","businessType","score","address"])
        writer.writeheader()
        writer.writerows(all_leads)

    _flush_debug()

    print(f"\n{'='*60}")
    print(f"  DONE")
    print(f"  Total OSM results:        {total_found}")
    print(f"  No-website leads found:   {total_no_website}")
    print(f"  Unique leads:             {len(all_leads)}")
    print(f"  Pushed to CallTwin:       {total_pushed}")
    print(f"  CSV backup saved:         {csv_path}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    run()
