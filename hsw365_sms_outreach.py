#!/usr/bin/env python3
"""
hsw365_sms_outreach.py — autonomously texts local business owner leads
(already found by calltwin_lead_hunter.py and pushed into CallTwin) with
the HSW365 Front Desk + Website offer, via CallTwin's own Twilio number.

This is a cold, one-way text — independent of the calling pipeline. It
does NOT require a call to have happened first. The message always
includes a free-demo link and an opt-out line (STOP), and any lead marked
do_not_call is skipped automatically.

Capped per run to keep sending volume reasonable and to respect Twilio/A2P
throughput — same conservative approach as the email campaigns.

Run manually:   python hsw365_sms_outreach.py
Run on cron:    see .github/workflows/sms-outreach.yml

Requirements: pip install -r requirements.txt
"""

import os, json, time, requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

CALLTWIN_API_URL  = os.getenv('CALLTWIN_API_URL', 'https://calltwin.onrender.com')
CALLTWIN_TOKEN    = os.getenv('CALLTWIN_USER_TOKEN')
MAX_TEXTS_PER_RUN = int(os.getenv('SMS_MAX_PER_RUN', '15'))

LOG_FILE = os.path.join(os.path.dirname(__file__) or ".", "sms_outreach_log.json")


def _headers():
    return {"Authorization": f"Bearer {CALLTWIN_TOKEN}", "Content-Type": "application/json"}


def fetch_leads():
    r = requests.get(f"{CALLTWIN_API_URL}/api/leads", headers=_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


def text_lead(lead_id):
    r = requests.post(f"{CALLTWIN_API_URL}/api/calls/sms/{lead_id}", headers=_headers(), timeout=15)
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text[:200]})


def run():
    if not CALLTWIN_TOKEN:
        print("CALLTWIN_USER_TOKEN not set — nothing to do.")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n{'='*60}")
    print(f"  HSW365 SMS OUTREACH — {timestamp}")
    print(f"{'='*60}\n")

    try:
        leads = fetch_leads()
    except Exception as e:
        error_detail = str(e)
        status_code = getattr(getattr(e, "response", None), "status_code", None)
        body_snippet = getattr(getattr(e, "response", None), "text", "")[:300]
        print(f"Failed to fetch leads: {e}")
        with open(LOG_FILE, "w") as f:
            json.dump([{
                "error": "fetch_leads_failed",
                "detail": error_detail,
                "status_code": status_code,
                "response_snippet": body_snippet,
                "checked_at": timestamp,
            }], f, indent=2)
        return

    eligible = [
        l for l in leads
        if l.get("phone")
        and not l.get("smsSentAt")
        and l.get("status") != "do_not_call"
    ]
    print(f"  {len(leads)} total leads, {len(eligible)} eligible for a first-time text")

    log = []
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE) as f:
            log = json.load(f)

    sent = 0
    for lead in eligible:
        if sent >= MAX_TEXTS_PER_RUN:
            break
        lead_id = lead.get("_id") or lead.get("id")
        try:
            status_code, body = text_lead(lead_id)
            ok = status_code == 200 and not body.get("skipped")
            log.append({
                "businessName": lead.get("businessName"),
                "phone": lead.get("phone"),
                "status_code": status_code,
                "result": body,
                "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })
            if ok:
                sent += 1
                print(f"  texted: {lead.get('businessName')} ({lead.get('phone')})")
            else:
                print(f"  skipped/failed: {lead.get('businessName')} -> {body}")
        except Exception as e:
            log.append({
                "businessName": lead.get("businessName"),
                "phone": lead.get("phone"),
                "error": str(e),
                "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })
            print(f"  ERROR texting {lead.get('businessName')}: {e}")
        time.sleep(1)  # gentle pacing on the CallTwin API / Twilio send rate

    with open(LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)

    print(f"\n  Done. {sent} new texts sent this run.")


if __name__ == "__main__":
    run()
