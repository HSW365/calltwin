#!/usr/bin/env python3
"""
calltwin_lead_hunter.py
Finds local businesses with NO website using Google Places API,
scores them by how badly they need one, and pushes them directly
into the CallTwin lead database via the API.

Run manually:   python calltwin_lead_hunter.py
Run on cron:    */30 * * * * python /path/to/calltwin_lead_hunter.py

Requirements: pip install requests python-dotenv
"""

import os, requests, time, json, csv
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY    = os.getenv('GOOGLE_PLACES_API_KEY')
CALLTWIN_API_URL  = os.getenv('CALLTWIN_API_URL', 'https://calltwin.onrender.com')
CALLTWIN_TOKEN    = os.getenv('CALLTWIN_USER_TOKEN')  # JWT from /api/auth/login
CALLTWIN_CAMPAIGN = os.getenv('CALLTWIN_CAMPAIGN_ID') # campaign to add leads to

# ── TARGET MARKETS ──────────────────────────────────────────────────────────
# Every city + business type combo gets scraped. Add more to expand reach.
MARKETS = [
    # South Jersey — home turf
    {"city": "Vineland, NJ",       "state": "NJ"},
    {"city": "Millville, NJ",      "state": "NJ"},
    {"city": "Bridgeton, NJ",      "state": "NJ"},
    {"city": "Hammonton, NJ",      "state": "NJ"},
    {"city": "Pleasantville, NJ",  "state": "NJ"},
    {"city": "Egg Harbor City, NJ","state": "NJ"},
    {"city": "Camden, NJ",         "state": "NJ"},
    {"city": "Woodbury, NJ",       "state": "NJ"},
    # Philly suburbs
    {"city": "Pennsauken, NJ",     "state": "NJ"},
    {"city": "Cherry Hill, NJ",    "state": "NJ"},
    {"city": "Lindenwold, NJ",     "state": "NJ"},
]

# These business types are most likely to have no website and need one
BUSINESS_TYPES = [
    "auto repair shop",
    "hair salon",
    "barbershop",
    "nail salon",
    "restaurant",
    "plumber",
    "electrician",
    "landscaping",
    "cleaning service",
    "daycare center",
    "tax preparer",
    "insurance agency",
    "real estate agent",
    "law office",
    "dentist",
    "chiropractor",
    "gym",
    "towing service",
    "moving company",
    "catering",
    "bakery",
    "florist",
    "photographer",
    "wedding venue",
    "funeral home",
    "printing shop",
    "alterations tailor",
    "pest control",
    "roofing contractor",
    "fence company",
]

# ── GOOGLE PLACES SEARCH ─────────────────────────────────────────────────────

def search_places(query, city):
    """Returns list of places from Google Places Text Search."""
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    results = []
    params = {"query": f"{query} in {city}", "key": GOOGLE_API_KEY}

    while True:
        r = requests.get(url, params=params, timeout=10)
        data = r.json()
        results.extend(data.get("results", []))
        token = data.get("next_page_token")
        if not token:
            break
        time.sleep(2)  # Google requires a short delay before using next_page_token
        params = {"pagetoken": token, "key": GOOGLE_API_KEY}

    return results

def get_place_details(place_id):
    """Gets phone number and website for a place."""
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "name,formatted_phone_number,website,formatted_address",
        "key": GOOGLE_API_KEY,
    }
    r = requests.get(url, params=params, timeout=10)
    return r.json().get("result", {})

# ── LEAD SCORING ─────────────────────────────────────────────────────────────

def score_lead(detail, business_type):
    """
    Returns a score 0-100. Higher = more likely to buy a website.
    - No website = +60 (the whole point)
    - Has phone = +20
    - Rating < 4.0 = +10 (low reviews = needs help)
    - Type weight = up to 10
    """
    score = 0
    if not detail.get("website"):
        score += 60
    if detail.get("formatted_phone_number"):
        score += 20
    high_value = ["dentist","law office","real estate","insurance","chiropractor","gym"]
    if any(h in business_type for h in high_value):
        score += 10
    return score

# ── PUSH TO CALLTWIN ─────────────────────────────────────────────────────────

def push_lead_to_calltwin(lead):
    """Posts a single lead to the CallTwin API."""
    if not CALLTWIN_TOKEN:
        return False
    headers = {"Authorization": f"Bearer {CALLTWIN_TOKEN}", "Content-Type": "application/json"}
    r = requests.post(f"{CALLTWIN_API_URL}/api/leads", json=lead, headers=headers, timeout=10)
    return r.status_code == 200

def add_lead_to_campaign(lead_id):
    if not CALLTWIN_TOKEN or not CALLTWIN_CAMPAIGN:
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
    """Strip formatting from Google phone numbers."""
    if not raw:
        return None
    digits = ''.join(c for c in raw if c.isdigit())
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    return None

def run():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    csv_path = f"leads_{timestamp}.csv"
    total_found = 0
    total_no_website = 0
    total_pushed = 0

    all_leads = []
    seen_phones = set()

    print(f"\n{'='*60}")
    print(f"  CALLTWIN LEAD HUNTER — {timestamp}")
    print(f"  {len(MARKETS)} markets × {len(BUSINESS_TYPES)} business types")
    print(f"{'='*60}\n")

    for market in MARKETS:
        city = market["city"]
        state = market["state"]

        for biz_type in BUSINESS_TYPES:
            print(f"  Searching: {biz_type} in {city}...", end=" ", flush=True)

            try:
                places = search_places(biz_type, city)
                total_found += len(places)
                count = 0

                for place in places:
                    detail = get_place_details(place["place_id"])
                    if detail.get("website"):
                        continue  # Already has a website — skip

                    phone = clean_phone(detail.get("formatted_phone_number"))
                    if not phone or phone in seen_phones:
                        continue
                    seen_phones.add(phone)

                    score = score_lead(detail, biz_type)
                    if score < 60:
                        continue  # Must have no website minimum

                    lead = {
                        "businessName": detail.get("name", place.get("name", "")),
                        "contactName": "",  # Google doesn't give owner names
                        "phone": phone,
                        "city": city.split(",")[0],
                        "state": state,
                        "businessType": biz_type,
                        "score": score,
                        "address": detail.get("formatted_address", ""),
                    }
                    all_leads.append(lead)
                    total_no_website += 1
                    count += 1

                print(f"{count} no-website leads")
                time.sleep(0.5)  # Rate limit courtesy

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
            if push_lead_to_calltwin(payload):
                total_pushed += 1
        except Exception as e:
            print(f"    Push failed for {lead['businessName']}: {e}")

    # Also save CSV backup
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["businessName","contactName","phone","city","state","businessType","score","address"])
        writer.writeheader()
        writer.writerows(all_leads)

    print(f"\n{'='*60}")
    print(f"  DONE")
    print(f"  Total places found:       {total_found}")
    print(f"  No-website leads found:   {total_no_website}")
    print(f"  Unique leads:             {len(all_leads)}")
    print(f"  Pushed to CallTwin:       {total_pushed}")
    print(f"  CSV backup saved:         {csv_path}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    run()
