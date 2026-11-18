#!/usr/bin/env python3
"""Builds index.html, sitemap.xml, robots.txt, llms.txt, favicon.svg and og.png from backend/estimator/plans.js.
Usage: python3 build.py [BASE_URL]   (default https://hsw365-ai-estimate.onrender.com)"""
import json, subprocess, sys, html, os, datetime
BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://hsw365-ai-estimate.onrender.com").rstrip("/")
here = os.path.dirname(os.path.abspath(__file__))
P = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('../backend/estimator/plans.js').publicPlans()))"], cwd=here))
usd = lambda c: "$" + (f"{c/100:,.2f}" if c % 100 else f"{c//100:,}")
e = html.escape

plans = ""
for p in P["plans"]:
    hot = p["key"] == "crew"
    plans += f'''<div class="pc{' hot' if hot else ''}">{'<span class="badge">Most picked</span>' if hot else ''}<h3>{e(p["name"])}</h3><div class="for">{e(p["jobs"])}</div>
<div class="pr">{usd(p["monthlyCents"])}<small>/mo</small></div><p>{e(p["blurb"])}</p>
<ul><li>{p["included"]:,} estimates a month</li><li>{usd(p["overCents"])} each after that</li><li>{"Unlimited" if p["users"]==99 else p["users"]} user{"s" if p["users"]>1 else ""}</li><li>{usd(p["setupCents"]) + " one-time setup" if p["setupCents"] else "No setup fee"}</li><li>{"Small footer line on PDFs" if p["key"]=="solo" else "No HSW365 line on your PDFs"}</li></ul>
<a class="btn {'btn-go' if hot else 'btn-line'}" href="app.html?signup=1&amp;plan={p["key"]}">Start {e(p["name"])}</a></div>'''
packs = ""
for k in P["packs"]:
    packs += f'''<div class="pc"><h3>{e(k["name"])}</h3><div class="for">{e(k["jobs"])}</div><div class="pr">{usd(k["unitCents"])}<small>/estimate</small></div>
<p>{k["qty"]} estimates for {usd(k["priceCents"])}. Use them any time.</p><a class="btn btn-line" href="app.html?signup=1&amp;pack={k["key"]}">Get {k["qty"]} for {usd(k["priceCents"])}</a></div>'''

solo, crew = P["plans"][0], P["plans"][1]
FAQS = [
 ("What is a conversion?", "One conversion is one job turned into a finished estimate: your photos, video and voice note go in, and a drafted estimate with heading, scope and line items comes out. Editing it, saving it, making the PDF and emailing it are all free."),
 ("Does the AI set my prices?", "Never. The AI writes the words only. Prices come from your own past lines (your price book) or from you typing them. A new line with no price yet is highlighted yellow so you cannot miss it, and every total is calculated to the penny."),
 ("What trades does it work for?", "Any contractor who prices by the job: plumbing, HVAC, electrical, roofing, remodeling, painting, landscaping, fire protection and more. It reads what is in your photos and what you say, so it adapts to your trade."),
 ("How long does it take?", "About a minute from the photos to a drafted estimate, then as long as you need to set your prices. Most small jobs go from the driveway to the customer's inbox in a few minutes."),
 ("Do I need to be good with computers?", "No. You sign in with an 8 digit PIN, take photos on your phone, and talk instead of typing. If you can send a text message, you can use it."),
 ("What does it cost to try?", f"Nothing. Every new account gets 3 free estimates with no card. After that, plans start at {usd(solo['monthlyCents'])} a month for jobs under $5K, or you can buy a pack of pay-per-estimate credits with no subscription."),
 ("What if the AI cannot read my job?", "If the AI returns an error or cannot make sense of the photos, you are not charged. The credit goes straight back to your account and you can try again with a clearer photo or a few typed words."),
 ("Can I put my own logo and colors on the PDF?", f"You get your business name, address, phone, licenses and brand color on every document. Crew, Pro and Commercial plans remove the small HSW365 AI Estimate line from the footer; Solo and pay-per-estimate documents keep it."),
 ("Can I cancel?", "Yes, any time from the billing page. Your saved estimates stay in your account. Pay-per-estimate packs never expire."),
 ("Who is behind it?", "HSW365 Media LLC, a small New Jersey technology company. The estimate workflow was built and tested on real plumbing, heating and fire sprinkler jobs before it became its own product. Questions go straight to hsw365media@gmail.com."),
]
faq = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in FAQS)

offers = [{"@type": "Offer", "name": f"{p['name']} plan", "price": f"{p['monthlyCents']/100:.2f}", "priceCurrency": "USD", "category": "Subscription", "url": BASE + "/#pricing"} for p in P["plans"]]
ld = {"@context": "https://schema.org", "@graph": [
  {"@type": "SoftwareApplication", "name": "HSW365 AI Estimate", "applicationCategory": "BusinessApplication", "operatingSystem": "Web, iOS, Android (browser)",
   "description": "AI estimate software for contractors. Turn job photos, video and a voice note into a priced PDF estimate, proposal or invoice on your own letterhead. The AI writes the scope; you set every price.",
   "url": BASE + "/", "offers": {"@type": "AggregateOffer", "lowPrice": f"{P['plans'][0]['monthlyCents']/100:.2f}", "highPrice": f"{P['plans'][-1]['monthlyCents']/100:.2f}", "priceCurrency": "USD", "offerCount": len(offers), "offers": offers},
   "publisher": {"@id": BASE + "/#org"}},
  {"@type": "Organization", "@id": BASE + "/#org", "name": "HSW365 Media LLC", "url": "https://hsw365.net", "email": "hsw365media@gmail.com", "brand": {"@type": "Brand", "name": "HSW365"}},
  {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQS]},
]}
t = open(os.path.join(here, "landing.tpl.html")).read()
out = t.replace("{{BASE}}", BASE).replace("{{PLANS}}", plans).replace("{{PACKS}}", packs).replace("{{FAQ}}", faq).replace("{{LD}}", json.dumps(ld, separators=(",", ":")).replace("</", "<\\/"))
open(os.path.join(here, "index.html"), "w").write(out)

today = datetime.date.today().isoformat()
open(os.path.join(here, "sitemap.xml"), "w").write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{BASE}/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>\n')
open(os.path.join(here, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nDisallow: /app.html\n\nSitemap: {BASE}/sitemap.xml\n")
llm = f"""# HSW365 AI Estimate

> AI estimate software for contractors. Take photos or a short video of a job and talk through it; the app drafts the heading, scope and line items and produces a priced PDF estimate, proposal or invoice on the contractor's own letterhead. The AI never writes a price: every price comes from the contractor's own price book or typing.

Made by HSW365 Media LLC (New Jersey). Contact: hsw365media@gmail.com. Brand site: https://hsw365.net

## Pricing (USD)
""" + "\n".join(f"- {p['name']} ({p['jobs']}): {usd(p['monthlyCents'])}/month, {p['included']} estimates included, {usd(p['overCents'])} each after, {usd(p['setupCents']) + ' setup' if p['setupCents'] else 'no setup fee'}" for p in P["plans"]) + "\n" + \
"\n".join(f"- Pay per estimate, {k['name'].lower()} ({k['jobs']}): {usd(k['unitCents'])} each, packs of {k['qty']}" for k in P["packs"]) + f"""
- Free trial: {P['freeTrial']} estimates, no card.

## Pages
- [Home, how it works, pricing, FAQ]({BASE}/)
- [Sign in or start free]({BASE}/app.html)
"""
open(os.path.join(here, "llms.txt"), "w").write(llm)
open(os.path.join(here, "favicon.svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><text x="32" y="47" font-family="Arial Narrow,Arial,sans-serif" font-weight="900" font-size="44" text-anchor="middle" fill="#0a0a0f">E</text></svg>')

# og.png 1200x630
from PIL import Image, ImageDraw, ImageFont
W, H = 1200, 630
im = Image.new("RGB", (W, H), "#0a0a0f"); d = ImageDraw.Draw(im, "RGBA")
for cx, cy, r, col in [(1000, 120, 420, (168, 85, 247, 70)), (120, 80, 380, (34, 211, 238, 55))]:
    for i in range(r, 0, -8): d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(col[0], col[1], col[2], int(col[3] * (1 - i / r) * .5)))
def font(name, size):
    for p in [f"/usr/share/fonts/opentype/inter/{name}", f"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
big, mid, small = font("InterDisplay-Black.otf", 118), font("Inter-Medium.otf", 34), font("Inter-Bold.otf", 24)
d.rounded_rectangle([70, 70, 130, 130], 14, fill="#22d3ee"); d.text((100, 100), "E", font=font("InterDisplay-Black.otf", 44), fill="#0a0a0f", anchor="mm")
d.text((150, 100), "HSW365 AI ESTIMATE", font=small, fill="#eceef6", anchor="lm")
d.text((70, 250), "PHOTOS IN.", font=big, fill="#eceef6", anchor="ls")
d.text((70, 380), "ESTIMATE OUT.", font=big, fill="#22d3ee", anchor="ls")
d.text((72, 455), "AI estimate software for contractors. Your prices, your letterhead.", font=mid, fill="#b4b8cc", anchor="ls")
d.rounded_rectangle([70, 500, 420, 560], 30, fill="#22d3ee"); d.text((245, 530), "3 FREE TO TRY", font=small, fill="#04141a", anchor="mm")
# a little estimate card
d.rounded_rectangle([800, 250, 1130, 560], 18, fill="#f6f7fb"); d.rectangle([826, 300, 1104, 304], fill="#145a32")
d.text((826, 280), "ESTIMATE  2026-014", font=font("Inter-Bold.otf", 18), fill="#145a32", anchor="ls")
for i, (a, b) in enumerate([("Water heater, installed", "$1,850"), ("Connectors and valve", "$185"), ("Haul away", "$75")]):
    y = 345 + i * 44; d.text((826, y), a, font=font("Inter-Medium.otf", 19), fill="#3a4060", anchor="ls"); d.text((1104, y), b, font=font("Inter-Bold.otf", 19), fill="#0f1220", anchor="rs"); d.line([826, y + 14, 1104, y + 14], fill="#e3e5f0", width=2)
d.text((826, 530), "TOTAL", font=font("Inter-Bold.otf", 16), fill="#59607a", anchor="ls"); d.text((1104, 535), "$2,110", font=font("InterDisplay-Black.otf", 52), fill="#145a32", anchor="rs")
im.save(os.path.join(here, "og.png"), optimize=True)
print("built", BASE)
