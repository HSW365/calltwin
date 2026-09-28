#!/usr/bin/env python3
"""Local SEO pages for New Ark Plumbing, Heating & Air Conditioning (Phillipsburg, NJ).
Builds newark/*.html, newark/blog/index.html and newark/sitemap.xml. Every page drives one action: call 908-454-4043.
Run from repo root: python marketing/newark_pages.py
Facts used only from New Ark's own sites (arkhvac.com and the New Ark site on this repo); nothing invented.
"""
import html, json, os, re, datetime
e = html.escape
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://hsw365.github.io/calltwin/newark"
PHONE, TEL = "908-454-4043", "+19084544043"
NAME = "New Ark Plumbing, Heating & Air Conditioning"
ADDR = {"street": "412 Firth St", "city": "Phillipsburg", "state": "NJ", "zip": "08865"}
ESTIMATE = "https://hsw365.github.io/calltwin/newark-preview.html#estimate"
COUNTIES = ["Warren", "Hunterdon", "Sussex", "Morris", "Somerset"]
TOWNS = ["Phillipsburg", "Washington", "Hackettstown", "Clinton", "Flemington"]

SERVICES = [
  {"slug": "emergency-plumber", "name": "Emergency Plumber", "color": "#00843D",
   "title": f"Emergency Plumber Phillipsburg NJ | 24/7 | Call {PHONE} | New Ark",
   "h1": "Emergency plumber in Phillipsburg and Warren County. Answered 24/7.",
   "lede": "Burst pipe, water heater leaking, sewer backing up, no water at all. Call New Ark any hour. Every call is answered, emergencies go to the front of the line, and a licensed plumber calls you back.",
   "do": ["Shut off the main water valve if water is spreading. It's usually where the water line enters the house, often in the basement.", "If water is near outlets, electrical panels or appliances, stay clear and turn off power at the breaker only if you can do it safely and dry.", "If you smell gas, leave the house and call your gas utility or 911 first, then call us.", "Call " + PHONE + ". Tell us what's leaking, where, and your address."],
   "list": ["Burst and frozen pipes", "Leaking or failed water heaters", "Sewer and main drain backups", "No water or low pressure", "Overflowing toilets and clogged mains", "Leaks inside walls and ceilings"],
   "faq": [("Do you answer at night and on weekends?", f"Yes. Calls to {PHONE} are answered 24 hours a day, 7 days a week, and emergencies are passed to a plumber right away."), ("What should I do before you get here?", "Shut off the main water valve if you can, stay away from water near electricity, and move valuables out of the way."), ("Do you give prices over the phone?", "We confirm pricing once we know what's wrong, so you're never locked into a guess.")]},
  {"slug": "water-heater-repair-replacement", "name": "Water Heater Repair & Replacement", "color": "#F2C200",
   "title": f"Water Heater Repair & Replacement Phillipsburg NJ | New Ark {PHONE}",
   "h1": "Water heater leaking or no hot water? New Ark repairs and replaces them.",
   "lede": "Water heater repairs and full replacements for homes and businesses around Phillipsburg and Warren County. Call and tell us what you're seeing.",
   "do": ["If the tank is leaking, turn off the cold water supply valve on top of the heater.", "For a gas heater, turn the gas control to OFF or PILOT. For electric, switch off its breaker.", "Note the brand and age from the label on the tank if you can. It helps us bring the right parts.", "Call " + PHONE + "."],
   "list": ["No hot water or not enough hot water", "Leaks from the tank, valves or fittings", "Pilot or burner problems", "Rumbling, popping or rusty water", "Full replacement and haul-away", "Expansion tanks and code updates"],
   "faq": [("Repair or replace?", "It depends on the age and condition of the tank and what failed. We'll tell you straight after we look."), ("Can you install the same day?", "Call and we'll tell you the soonest time we can get there."), ("Do you do commercial water heaters?", "Yes. New Ark serves both residential and commercial customers.")]},
  {"slug": "drain-sewer", "name": "Drain & Sewer", "color": "#00843D",
   "title": f"Drain Cleaning & Sewer Backup Phillipsburg NJ | New Ark {PHONE}",
   "h1": "Clogged drains and sewer backups, handled.",
   "lede": "Slow drains, backed-up toilets, water coming up in the basement floor drain. New Ark clears it and finds out why it happened.",
   "do": ["Stop running water in the house if drains are backing up.", "Don't pour chemical drain cleaners into a fully blocked line.", "Call " + PHONE + " and tell us which fixtures are backing up."],
   "list": ["Kitchen, bath and laundry clogs", "Main sewer line backups", "Basement floor drain backups", "Recurring clogs", "Toilets that won't clear"],
   "faq": [("Is it an emergency?", "If sewage is coming up into the house, yes. Call any time."), ("Why does it keep clogging?", "Recurring clogs usually point to a problem further down the line. We look for the cause, not just the clog.")]},
  {"slug": "plumbing", "name": "Plumbing", "color": "#00843D",
   "title": f"Plumber Phillipsburg NJ | Residential & Commercial Plumbing | New Ark {PHONE}",
   "h1": "Plumbing for homes and businesses across Western New Jersey.",
   "lede": "Kitchens, bathrooms, common areas and exteriors: New Ark handles plumbing installations and repairs for residential and commercial customers, with four decades of industry experience.",
   "do": ["Tell us what you need: repair, replacement or a new installation.", "Have your address and a good callback number ready.", "Call " + PHONE + " or request a written estimate online."],
   "list": ["Kitchen and bathroom plumbing", "Fixture installation and repair", "Pipe repair and replacement", "Exterior plumbing", "Commercial plumbing and common areas", "New construction plumbing"],
   "faq": [("Do you do commercial work?", "Yes, New Ark serves commercial and residential clients."), ("Can I get a written estimate?", "Yes. Request one online and we'll send it for you to review and approve.")]},
  {"slug": "heating-furnace-boiler", "name": "Heating", "color": "#F2C200",
   "title": f"Heating Repair Phillipsburg NJ | No Heat? Call {PHONE} | New Ark",
   "h1": "No heat? New Ark answers the call, day or night.",
   "lede": "Furnaces, boilers and heating systems for homes and businesses around Phillipsburg. When the heat goes out, call and every call is answered.",
   "do": ["Check that the thermostat is set to heat and its batteries aren't dead.", "Check the breaker or service switch for the system.", "If you smell gas, leave and call your gas utility or 911 first.", "Call " + PHONE + " and tell us the system type and what it's doing."],
   "list": ["No heat calls", "Furnace and boiler repair", "Heating system replacement", "Duct systems installation and retrofitting", "Seasonal tune-ups"],
   "faq": [("Do you answer no-heat calls at night?", f"Yes. {PHONE} is answered 24/7."), ("Do you replace old systems?", "Yes. We'll go over repair versus replacement once we see the system.")]},
  {"slug": "air-conditioning", "name": "Air Conditioning", "color": "#0057B8",
   "title": f"AC Repair & Installation Phillipsburg NJ | New Ark {PHONE}",
   "h1": "Air conditioning repair and installation.",
   "lede": "When the AC quits on a hot day, New Ark picks up. Repairs, new systems and ductwork for homes and commercial buildings.",
   "do": ["Check the thermostat is on cool and set below room temperature.", "Check the breaker and the outdoor unit's disconnect.", "Change a clogged filter if you can get to it.", "Call " + PHONE + "."],
   "list": ["AC not cooling", "AC repair", "New central air systems", "Ductwork installation and retrofits", "Commercial cooling"],
   "faq": [("Can you retrofit ducts in an older home?", "Duct systems installation and retrofitting is one of our services. Call and we'll talk through your house."), ("Commercial buildings?", "Yes.")]},
  {"slug": "geothermal", "name": "Geothermal", "color": "#F2C200",
   "title": f"Geothermal Heating & Cooling NJ | Installation & Retrofit | New Ark {PHONE}",
   "h1": "Geothermal heating and cooling in New Jersey.",
   "lede": "Geothermal systems are efficient, environmentally friendly and don't burn fossil fuels. New Ark installs them in new construction, retrofits existing homes, and adds auxiliary heating.",
   "do": ["Tell us whether it's new construction or an existing home.", "Have the approximate square footage and your current heating system handy.", "Call " + PHONE + " or request an estimate online."],
   "list": ["Geothermal for new construction", "Retrofitting existing homes", "Auxiliary heating", "Service on existing geothermal systems"],
   "faq": [("Is geothermal right for my house?", "It depends on the property and the current system. Call and we'll talk it through."), ("Do you service geothermal systems you didn't install?", "Call and tell us what you have.")]},
  {"slug": "fire-sprinklers", "name": "Fire Protection & Sprinklers", "color": "#C8102E",
   "title": f"Fire Sprinkler Contractor NJ | Residential & Commercial | New Ark {PHONE}",
   "h1": "Fire protection and sprinkler systems, residential and commercial.",
   "lede": "New Ark designs and installs fire protection systems for homes and commercial buildings, alongside plumbing and HVAC, so one contractor coordinates the whole job.",
   "do": ["Tell us the building type and whether it's new construction or a renovation.", "If a sprinkler head is leaking or activated, shut off the sprinkler supply valve if you know where it is and call right away.", "Call " + PHONE + "."],
   "list": ["Residential fire sprinklers", "Commercial fire protection systems", "New construction", "Renovations and additions", "Sprinkler repairs"],
   "faq": [("Why use one contractor for plumbing and fire?", "Water, heat, air and fire lines share the same walls and the same schedule. One contractor keeps them coordinated."), ("Commercial projects?", "Yes.")]},
]

CSS = """:root{--steel:#e9ecee;--white:#fff;--ink:#16191c;--ink2:#3a4148;--mut:#5d666e;--rule:#cfd5da;--g:#00843D;--y:#F2C200;--b:#0057B8;--r:#C8102E}
*{box-sizing:border-box}html,body{background:var(--steel)}body{margin:0;color:var(--ink);font:17px/1.6 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--b)}.wrap{max-width:1000px;margin:auto;padding:0 16px}
h1,h2,h3{font-family:Archivo,system-ui,sans-serif;font-stretch:112%;line-height:1.05;margin:0;letter-spacing:-.01em}
h1{font-size:clamp(34px,6vw,58px);margin:12px 0 14px}h2{font-size:28px;margin:0 0 12px}h3{font-size:19px;margin:0 0 6px}
.top{display:flex;justify-content:space-between;align-items:center;height:64px;border-bottom:1px solid var(--rule)}
.logo{font:800 20px Archivo,sans-serif;font-stretch:118%;color:var(--ink);text-decoration:none;display:flex;gap:8px;align-items:center}
.bars{display:flex}.bars i{width:7px;height:20px;display:block}
.call{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:54px;padding:0 22px;border-radius:8px;background:var(--r);color:#fff;font:800 18px Archivo,sans-serif;text-decoration:none}
.call.sm{height:42px;font-size:15px;padding:0 14px}
.alt{display:inline-flex;align-items:center;height:54px;padding:0 18px;border-radius:8px;border:2px solid var(--ink);color:var(--ink);font-weight:700;text-decoration:none}
.tag{display:inline-block;padding:4px 10px;border-radius:4px;color:#fff;font:700 12px "IBM Plex Sans";letter-spacing:.08em;text-transform:uppercase;margin-top:32px}
.lede{font-size:19px;color:var(--ink2);max-width:760px}
section{padding:36px 0;border-top:1px solid var(--rule)}
.card{background:var(--white);border:1px solid var(--rule);border-radius:10px;padding:18px 20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
ol,ul{padding-left:22px}li{margin:6px 0}
details{background:var(--white);border:1px solid var(--rule);border-radius:10px;padding:14px 16px;margin:8px 0}summary{font-weight:700;cursor:pointer}details p{color:var(--ink2);margin:8px 0 0}
.band{background:var(--ink);color:#fff;border-radius:12px;padding:26px;margin:30px 0;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.band h2{color:#fff}.links a{display:inline-block;margin:4px 12px 4px 0}
.sticky{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:rgba(22,25,28,.96);display:none;z-index:9}
.sticky .call{width:100%}
footer{padding:26px 0 90px;color:var(--mut);font-size:14px;border-top:1px solid var(--rule)}
@media(max-width:720px){.grid{grid-template-columns:1fr}.sticky{display:block}}"""

def head(title, desc, url, ld=""):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,700..900&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>{CSS}</style>{ld}</head><body><div class="wrap">
<div class="top"><a class="logo" href="{SITE}/"><span class="bars"><i style="background:var(--g)"></i><i style="background:var(--y)"></i><i style="background:var(--b)"></i><i style="background:var(--r)"></i></span>New Ark</a><a class="call sm" href="tel:{TEL}">Call {PHONE}</a></div>"""

def business_ld(extra=None):
    d = {"@context": "https://schema.org", "@type": ["Plumber", "HVACBusiness"], "name": NAME, "telephone": TEL, "url": SITE + "/",
         "address": {"@type": "PostalAddress", "streetAddress": ADDR["street"], "addressLocality": ADDR["city"], "addressRegion": ADDR["state"], "postalCode": ADDR["zip"], "addressCountry": "US"},
         "areaServed": [{"@type": "AdministrativeArea", "name": f"{c} County, NJ"} for c in COUNTIES] + [{"@type": "City", "name": f"{t}, NJ"} for t in TOWNS],
         "openingHours": "Mo-Su 00:00-23:59", "sameAs": ["https://arkhvac.com/"]}
    if extra: d.update(extra)
    return f'<script type="application/ld+json">{json.dumps(d)}</script>'

def faq_ld(faq):
    return f'<script type="application/ld+json">{json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})}</script>'

def cta_band():
    return f'<div class="band"><div><h2>Call New Ark now</h2><div>Answered 24/7. Emergencies first.</div></div><a class="call" href="tel:{TEL}">Call {PHONE}</a></div>'

def foot():
    svc = " ".join(f'<a href="{SITE}/{s["slug"]}.html">{e(s["name"])}</a>' for s in SERVICES)
    towns = " ".join(f'<a href="{SITE}/{t.lower()}-nj.html">{e(t)}</a>' for t in TOWNS)
    return f"""<section><h3>Services</h3><div class="links">{svc}</div><h3 style="margin-top:14px">Areas</h3><div class="links">{towns} <a href="{SITE}/blog/">Articles</a></div></section>
<footer>{e(NAME)} &middot; {ADDR['street']}, {ADDR['city']}, {ADDR['state']} {ADDR['zip']} &middot; <a href="tel:{TEL}">{PHONE}</a> &middot; Licensed and insured in New Jersey &middot; Serving {", ".join(COUNTIES)} counties</footer></div>
<div class="sticky"><a class="call" href="tel:{TEL}">Call {PHONE}</a></div></body></html>"""

def service_page(s):
    url = f"{SITE}/{s['slug']}.html"
    ld = business_ld() + faq_ld(s["faq"])
    body = f"""<span class="tag" style="background:{s['color']}">{e(s['name'])}</span><h1>{e(s['h1'])}</h1><p class="lede">{e(s['lede'])}</p>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0"><a class="call" href="tel:{TEL}">Call {PHONE}</a><a class="alt" href="{ESTIMATE}">Request a written estimate</a></div>
<section class="grid"><div class="card"><h2>What we handle</h2><ul>{"".join(f"<li>{e(x)}</li>" for x in s["list"])}</ul></div>
<div class="card"><h2>What to do right now</h2><ol>{"".join(f"<li>{e(x)}</li>" for x in s["do"])}</ol></div></section>
{cta_band()}<section><h2>Questions</h2>{"".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in s["faq"])}</section>
<section><h2>Serving Western and Northern New Jersey</h2><p>From our shop at {ADDR['street']} in Phillipsburg we serve {", ".join(COUNTIES[:-1])} and {COUNTIES[-1]} counties, including {", ".join(TOWNS)}. Close to the edge of that area? Call and we'll confirm.</p></section>"""
    return head(s["title"], s["lede"][:155], url, ld) + body + foot()

def town_page(t):
    url = f"{SITE}/{t.lower()}-nj.html"
    title = f"Plumber & HVAC in {t}, NJ | 24/7 | Call {PHONE} | New Ark"
    lede = f"Plumbing, heating, air conditioning, geothermal and fire protection for homes and businesses in {t}, New Jersey. Every call to {PHONE} is answered, day or night."
    cards = "".join(f'<a class="card" style="text-decoration:none;color:inherit;border-left:6px solid {s["color"]}" href="{SITE}/{s["slug"]}.html"><h3>{e(s["name"])} in {e(t)}</h3><div style="color:var(--ink2)">{e(s["lede"][:120])}...</div></a>' for s in SERVICES)
    body = f"""<span class="tag" style="background:var(--ink)">{e(t)}, NJ</span><h1>Plumber and HVAC contractor serving {e(t)}, NJ.</h1><p class="lede">{e(lede)}</p>
<div style="margin:18px 0"><a class="call" href="tel:{TEL}">Call {PHONE}</a></div>
<section><h2>Services in {e(t)}</h2><div class="grid">{cards}</div></section>{cta_band()}
<section><h2>Why {e(t)} calls New Ark</h2><ul><li>Plumbing, heating, cooling, geothermal and fire protection from one contractor.</li><li>Every call answered 24/7, emergencies first.</li><li>Written estimates you can review and approve online.</li><li>Pay by Zelle, Cash App or card.</li><li>Licensed and insured in New Jersey, with four decades of industry experience.</li></ul></section>"""
    return head(title, lede[:155], url, business_ld()) + body + foot()

def home_page():
    url = SITE + "/"
    title = f"New Ark Plumbing, Heating & Air | Phillipsburg NJ | 24/7 {PHONE}"
    lede = "Plumbing, heating and cooling, geothermal and fire protection for homes and businesses across Warren, Hunterdon, Sussex, Morris and Somerset counties. Every call answered, day or night."
    cards = "".join(f'<a class="card" style="text-decoration:none;color:inherit;border-left:6px solid {s["color"]}" href="{SITE}/{s["slug"]}.html"><h3>{e(s["name"])}</h3><div style="color:var(--ink2)">{e(s["lede"][:110])}...</div></a>' for s in SERVICES)
    body = f"""<span class="tag" style="background:var(--g)">Phillipsburg, NJ</span><h1>Water, heat, air and fire. One contractor. Answered 24/7.</h1><p class="lede">{e(lede)}</p>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0"><a class="call" href="tel:{TEL}">Call {PHONE}</a><a class="alt" href="{ESTIMATE}">Request a written estimate</a></div>
<section><h2>Services</h2><div class="grid">{cards}</div></section>{cta_band()}"""
    return head(title, lede[:155], url, business_ld()) + body + foot()

def blog_index():
    d = os.path.join(ROOT, "newark", "blog"); os.makedirs(d, exist_ok=True)
    posts = []
    for f in sorted(os.listdir(d)):
        if f.endswith(".html") and f != "index.html":
            s = open(os.path.join(d, f), encoding="utf-8").read()
            t = re.search(r"<title>(.*?)</title>", s, re.S); dt = re.search(r'<meta name="date" content="([^"]+)"', s); ds = re.search(r'<meta name="description" content="([^"]*)"', s)
            posts.append((dt.group(1) if dt else "2026-01-01", f, html.unescape(t.group(1)) if t else f, html.unescape(ds.group(1)) if ds else ""))
    posts.sort(reverse=True)
    items = "".join(f'<a class="card" style="display:block;text-decoration:none;color:inherit;margin-bottom:10px" href="{SITE}/blog/{f}"><h3>{e(t.split(" | ")[0])}</h3><div style="color:var(--ink2)">{e(ds)}</div><small>{dt}</small></a>' for dt, f, t, ds in posts) or "<p>Articles coming soon.</p>"
    page = head("Plumbing & HVAC Tips | New Ark, Phillipsburg NJ", "Practical plumbing, heating, cooling and fire protection advice for New Jersey homeowners and businesses from New Ark.", SITE + "/blog/", business_ld()) + f'<span class="tag" style="background:var(--b)">Articles</span><h1>Plumbing and HVAC advice from New Ark.</h1>{items}{cta_band()}' + foot()
    return page, posts

def main():
    out = os.path.join(ROOT, "newark"); os.makedirs(out, exist_ok=True)
    today = datetime.date.today().isoformat()
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(home_page())
    for s in SERVICES: open(os.path.join(out, f"{s['slug']}.html"), "w", encoding="utf-8").write(service_page(s))
    for t in TOWNS: open(os.path.join(out, f"{t.lower()}-nj.html"), "w", encoding="utf-8").write(town_page(t))
    page, posts = blog_index()
    open(os.path.join(out, "blog", "index.html"), "w", encoding="utf-8").write(page)
    urls = [(SITE + "/", today)] + [(f"{SITE}/{s['slug']}.html", today) for s in SERVICES] + [(f"{SITE}/{t.lower()}-nj.html", today) for t in TOWNS] + [(SITE + "/blog/", today)] + [(f"{SITE}/blog/{f}", d) for d, f, _, _ in posts]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"  <url><loc>{u}</loc><lastmod>{d}</lastmod></url>\n" for u, d in urls) + "</urlset>\n"
    open(os.path.join(out, "sitemap.xml"), "w", encoding="utf-8").write(sm)
    print(f"New Ark: {len(SERVICES)} service pages, {len(TOWNS)} town pages, {len(posts)} articles, {len(urls)} urls")

if __name__ == "__main__":
    main()
