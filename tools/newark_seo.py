#!/usr/bin/env python3
"""Local SEO pass for the New Ark site (ark-hvac.com, files in newark/).

Edits the hand-built pages in place. Safe to run again: every change checks whether it is already there.
  - clean, keyword-first <title>, og:title and meta description on every service, town and home page
  - New Ark's phone (908-454-4043) back in text, buttons, footer and structured data, so the name,
    address and phone match the Google Business Profile. Chat stays the main button.
  - Service, BreadcrumbList and FAQPage structured data
  - extra town pages for towns New Ark already lists under "Areas served" on its home page
  - a fuller fire protection page
  - sitemap.xml rebuilt from the files on disk
Usage: python3 tools/newark_seo.py
Facts come only from the New Ark site itself (home page, service pages, licenses). Nothing invented.
"""
import html, json, os, re, datetime

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "newark")
SITE = "https://ark-hvac.com"
PHONE, TEL = "908-454-4043", "+19084544043"
NAME = "New Ark Plumbing, Heating & Air Conditioning"
LIC = "NJ Master Plumber License #36BI00464600, HVAC Contractor License #19HC00178300 and Fire Sprinkler Contractor License #P01631"
e = html.escape

# Existing town pages plus new ones. Every new town is on New Ark's own "Areas served" list on the home page.
OLD_TOWNS = [("Phillipsburg", "Warren"), ("Washington", "Warren"), ("Hackettstown", "Warren"), ("Clinton", "Hunterdon"), ("Flemington", "Hunterdon")]
NEW_TOWNS = [("Belvidere", "Warren"), ("Oxford", "Warren"), ("Pohatcong Township", "Warren"), ("Greenwich Township", "Warren"),
             ("Stewartsville", "Warren"), ("Asbury", "Warren"), ("Bloomsbury", "Hunterdon"), ("Milford", "Hunterdon"),
             ("High Bridge", "Hunterdon"), ("Lebanon Township", "Hunterdon"), ("Readington Township", "Hunterdon"),
             ("Tewksbury Township", "Hunterdon")]
TOWNS = OLD_TOWNS + NEW_TOWNS
def tslug(t): return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-") + "-nj.html"

SERVICES = {
  "emergency-plumber.html": ("Emergency Plumber", f"24/7 Emergency Plumber in Phillipsburg & Warren County, NJ | New Ark",
     f"Burst pipe, leaking water heater or sewer backup? New Ark answers 24/7 and emergencies go first. Licensed NJ master plumber. Call {PHONE}."),
  "water-heater-repair-replacement.html": ("Water Heater Repair & Replacement", "Water Heater Repair & Replacement in Phillipsburg, NJ | New Ark",
     f"Leaking water heater or no hot water? New Ark repairs and replaces water heaters for homes and businesses in Warren and Hunterdon County. Call {PHONE}."),
  "drain-sewer.html": ("Drain Cleaning & Sewer Repair", "Drain Cleaning & Sewer Backup Help in Phillipsburg, NJ | New Ark",
     f"Clogged drains, backed-up toilets and sewer backups in the basement, cleared and diagnosed. Answered 24/7 in Warren and Hunterdon County. Call {PHONE}."),
  "plumbing.html": ("Plumbing", "Plumber in Phillipsburg, NJ | Residential & Commercial Plumbing | New Ark",
     f"Licensed NJ master plumber for homes and businesses: repairs, fixtures, pipes and new construction across Warren, Hunterdon and Sussex County. Call {PHONE}."),
  "heating-furnace-boiler.html": ("Heating, Furnace & Boiler Repair", "Furnace & Boiler Repair in Phillipsburg, NJ | 24/7 No Heat | New Ark",
     f"No heat? New Ark repairs and replaces furnaces, boilers and heating systems for homes and businesses. Licensed NJ HVAC contractor, answered 24/7. Call {PHONE}."),
  "air-conditioning.html": ("Air Conditioning Repair & Installation", "AC Repair & Installation in Phillipsburg, NJ | New Ark",
     f"AC not cooling? New Ark repairs and installs central air and ductwork for homes and commercial buildings in Warren and Hunterdon County. Call {PHONE}."),
  "geothermal.html": ("Geothermal Heating & Cooling", "Geothermal Heating & Cooling Installer in NJ | New Ark",
     f"Geothermal for new construction, retrofits of existing homes and auxiliary heat, from a licensed NJ HVAC contractor in Phillipsburg. Call {PHONE}."),
  "fire-sprinklers.html": ("Fire Sprinkler & Fire Protection Systems", "Fire Sprinkler Contractor in NJ | Fire Protection Systems | New Ark",
     f"Licensed NJ fire sprinkler contractor (#P01631): design, installation, repairs and inspections for homes and commercial buildings. Call {PHONE}."),
}
HOME_TITLE = "Plumber, HVAC & Fire Sprinkler Contractor in Phillipsburg, NJ | New Ark"
HOME_DESC = f"New Ark Plumbing, Heating & Air Conditioning: plumbing, heating, AC, geothermal and fire sprinklers for NJ homes and businesses. Answered 24/7. Call {PHONE}."

def town_title(t): return f"Plumber, HVAC & Fire Sprinklers in {t}, NJ | 24/7 | New Ark"
def town_desc(t, c): return f"Plumbing, heating, AC, geothermal and fire sprinklers for homes and businesses in {t}, {c} County, NJ. Answered 24/7. Call {PHONE}."

TEL_BTN = f'<a class="alt" href="tel:{TEL}">Call {PHONE}</a>'

def set_head(s, title, desc):
    s = re.sub(r"<title>.*?</title>", f"<title>{e(title)}</title>", s, count=1, flags=re.S)
    s = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{e(title)}">', s, count=1)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{e(desc)}">', s, count=1)
    s = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{e(desc)}">', s, count=1)
    return s

def fix_ld_business(s):
    """Add telephone, every town and image/logo to the LocalBusiness block."""
    def rep(m):
        try: d = json.loads(m.group(1))
        except Exception: return m.group(0)
        if not (isinstance(d, dict) and "Plumber" in str(d.get("@type"))): return m.group(0)
        d["telephone"] = TEL
        d.setdefault("logo", SITE + "/img/logo.webp"); d.setdefault("image", SITE + "/img/logo.webp")
        if isinstance(d.get("areaServed"), list):
            names = {(a["name"] if isinstance(a, dict) else a) for a in d["areaServed"]}
            for t, _ in TOWNS:
                if f"{t}, NJ" not in names:
                    d["areaServed"].append({"@type": "City", "name": f"{t}, NJ"} if any(isinstance(a, dict) for a in d["areaServed"]) else f"{t}, NJ")
        return f'<script type="application/ld+json">{json.dumps(d)}</script>'
    return re.sub(r'<script type="application/ld+json">(.*?)</script>', rep, s, flags=re.S)

def add_ld(s, key, obj):
    if f'"@type": "{key}"' in s: return s
    return s.replace("</head>", f'<script type="application/ld+json">{json.dumps(obj)}</script></head>', 1)

def crumbs(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}

def phone_text(s, prefix):
    """Phone back into the small pages: header, hero, steps, band, footer."""
    # broken leftovers from the chat-only pass
    s = s.replace("<li>message us here.</li>", f'<li>Call <a href="tel:{TEL}">{PHONE}</a> or message us.</li>')
    s = s.replace("<li>message us here. ", f'<li>Call <a href="tel:{TEL}">{PHONE}</a> or message us. ')
    s = s.replace("<li>message us here and ", f'<li>Call <a href="tel:{TEL}">{PHONE}</a> or message us and ')
    s = s.replace("<li>message us here or ", f'<li>Call <a href="tel:{TEL}">{PHONE}</a>, message us, or ')
    s = s.replace(". message us here.", f". Call {PHONE}.")
    # header: phone next to the chat button
    if 'class="toptel"' not in s:
        s = s.replace('<a class="call sm" href="#chat" data-chat>Message us</a></div>',
                      f'<span style="display:flex;gap:14px;align-items:center"><a class="toptel" href="tel:{TEL}" style="font-weight:700;color:var(--ink);text-decoration:none;white-space:nowrap">{PHONE}</a><a class="call sm" href="#chat" data-chat>Message us</a></span></div>', 1)
    # hero buttons
    if TEL_BTN not in s:
        s = s.replace('<a class="call" href="#chat" data-chat>Message us</a><a class="alt" href="./#estimate">',
                      f'<a class="call" href="#chat" data-chat>Message us</a>{TEL_BTN}<a class="alt" href="./#estimate">', 1)
        s = s.replace('<div style="margin:18px 0"><a class="call" href="#chat" data-chat>Message us</a></div>',
                      f'<div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0"><a class="call" href="#chat" data-chat>Message us</a>{TEL_BTN}</div>', 1)
    # band
    s = s.replace("<div>Answered 24/7. Emergencies first.</div></div>",
                  f'<div>Answered 24/7. Emergencies first. Or call <a href="tel:{TEL}" style="color:#fff">{PHONE}</a>.</div></div>')
    # footer NAP
    s = s.replace('Phillipsburg, NJ 08865 &middot; <a href="#chat" data-chat>Message us</a>',
                  f'Phillipsburg, NJ 08865 &middot; <a href="tel:{TEL}">{PHONE}</a> &middot; <a href="#chat" data-chat>Message us</a>')
    # area links: add new towns before "Articles"
    if f'href="{prefix}{tslug(NEW_TOWNS[0][0])}"' not in s:
        extra = " ".join(f'<a href="{prefix}{tslug(t)}">{e(t)}</a>' for t, _ in NEW_TOWNS)
        s = s.replace(f'<a href="{prefix}blog/">Articles</a></div>', f'{extra} <a href="{prefix}blog/">Articles</a></div>', 1)
    return s

def town_faq(t, c):
    return [(f"Do you serve {t}, NJ?", f"Yes. {t} is in {c} County, part of New Ark's service area from our shop at 412 Firth St in Phillipsburg. Call {PHONE} or message us to confirm a visit."),
            (f"Do you answer emergency calls in {t} at night and on weekends?", "Yes. Calls and messages are answered 24 hours a day, 7 days a week, and emergencies go to the front of the line."),
            (f"Do you work on commercial buildings in {t}?", "Yes. New Ark serves residential and commercial customers for plumbing, heating, air conditioning, geothermal and fire sprinkler systems."),
            ("Is New Ark licensed?", f"Yes. New Ark is licensed and insured in New Jersey: {LIC}."),
            ("How can I pay?", "Pay by Zelle, Cash App or card. Written estimates can be reviewed and approved online.")]

def faq_html(faq):
    return "<section><h2>Questions</h2>" + "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in faq) + "</section>"

def faq_ld(faq):
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}

def make_town(tpl, t, c):
    """New town page from the Phillipsburg page. Only the page's own content changes; header/footer stay."""
    a = tpl.index('<span class="tag"'); b = tpl.index("<section><h3>Services</h3>")
    head, main, foot = tpl[:a], tpl[a:b], tpl[b:]
    main = main.replace("Phillipsburg and Warren County", f"{t} and {c} County").replace("Phillipsburg", t)
    # drop any FAQ section copied from the template; a town FAQ is added below
    main = re.sub(r"<section><h2>Questions</h2>.*?</section>", "", main, flags=re.S)
    same = [x for x, cc in TOWNS if cc == c and x != t]
    local = (f"<section><h2>Plumbing, heating and fire protection in {e(t)}</h2><p>{e(t)} is in {e(c)} County, inside the area New Ark serves from its shop at 412 Firth St in Phillipsburg. "
             f"We also work in nearby {e(c)} County communities including {e(', '.join(same[:6]))}. Close to the edge of the area? Call <a href=\"tel:{TEL}\">{PHONE}</a> or message us and we'll confirm.</p></section>")
    main = main + local + faq_html(town_faq(t, c))
    head = head.replace("phillipsburg-nj.html", tslug(t))
    head = re.sub(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "(FAQPage|BreadcrumbList)".*?</script>', "", head, flags=re.S)
    return head + main + foot

def main():
    today = datetime.date.today().isoformat()
    tpl = open(os.path.join(ROOT, "phillipsburg-nj.html"), encoding="utf-8").read()
    for t, c in NEW_TOWNS:
        p = os.path.join(ROOT, tslug(t))
        if not os.path.exists(p):
            open(p, "w", encoding="utf-8").write(make_town(tpl, t, c))

    for f in sorted(os.listdir(ROOT)):
        if not f.endswith(".html") or f in ("index.html", "forms.html", "proposal.html"): continue
        p = os.path.join(ROOT, f); s = open(p, encoding="utf-8").read()
        if f in SERVICES:
            name, title, desc = SERVICES[f]
            s = set_head(s, title, desc)
            s = add_ld(s, "Service", {"@context": "https://schema.org", "@type": "Service", "name": name, "serviceType": name, "url": f"{SITE}/{f}",
                                      "provider": {"@type": ["Plumber", "HVACBusiness"], "name": NAME, "telephone": TEL, "url": SITE + "/"},
                                      "areaServed": [f"{x} County, NJ" for x in ["Warren", "Hunterdon", "Sussex", "Morris", "Somerset"]]})
            s = add_ld(s, "BreadcrumbList", crumbs([("Home", SITE + "/"), (name, f"{SITE}/{f}")]))
        town = next(((t, c) for t, c in TOWNS if tslug(t) == f), None)
        if town:
            t, c = town
            s = set_head(s, town_title(t), town_desc(t, c))
            if "<h2>Questions</h2>" not in s:
                s = s.replace("<section><h3>Services</h3>", faq_html(town_faq(t, c)) + "<section><h3>Services</h3>", 1)
            s = add_ld(s, "FAQPage", faq_ld(town_faq(t, c)))
            s = add_ld(s, "BreadcrumbList", crumbs([("Home", SITE + "/"), (f"{t}, NJ", f"{SITE}/{f}")]))
        s = fix_ld_business(s)
        s = phone_text(s, "./")
        open(p, "w", encoding="utf-8").write(s)

    bd = os.path.join(ROOT, "blog")
    for f in sorted(os.listdir(bd)):
        if not f.endswith(".html"): continue
        p = os.path.join(bd, f); s = open(p, encoding="utf-8").read()
        s = fix_ld_business(s)
        s = phone_text(s, "../")
        if f != "index.html":
            t = re.search(r"<title>(.*?)</title>", s, re.S).group(1)
            s = add_ld(s, "BreadcrumbList", crumbs([("Home", SITE + "/"), ("Articles", SITE + "/blog/"), (html.unescape(t), f"{SITE}/blog/{f}")]))
        open(p, "w", encoding="utf-8").write(s)

    fire()
    home()
    sitemap(today)

FIRE_FAQ = [
  ("Do you design fire sprinkler systems or only install them?", "New Ark designs and installs fire sprinkler systems for residential and commercial buildings, and provides repairs and regular inspections."),
  ("Is New Ark a licensed fire sprinkler contractor?", "Yes. New Ark holds New Jersey Fire Sprinkler Contractor License #P01631, alongside its Master Plumber and HVAC Contractor licenses."),
  ("Why use one contractor for plumbing, HVAC and fire protection?", "Water, heat, air and fire lines share the same walls, ceilings and schedule. One contractor keeps them coordinated on new construction and renovations."),
  ("Do you work on commercial buildings?", "Yes. New Ark serves commercial and residential customers, including public and private sector clients."),
  ("A sprinkler head is leaking. What should I do?", f"If there is any sign of fire or smoke, get out and call 911. If it is only a leak, shut off the sprinkler supply valve if you know where it is, then call {PHONE}. Calls are answered 24/7."),
  ("How do I get an estimate?", f"Call {PHONE}, message us, or request a free written estimate online. Tell us the building type and whether it is new construction or a renovation."),
]

def fire():
    p = os.path.join(ROOT, "fire-sprinklers.html"); s = open(p, encoding="utf-8").read()
    if "fire-detail" in s: return
    body = (f'<section id="fire-detail"><h2>Fire sprinkler systems designed, installed and inspected</h2>'
            f'<p>New Ark is a New Jersey licensed fire sprinkler contractor (License #P01631). We design and install fire sprinkler systems in homes, offices, shops and other commercial buildings, '
            f'and we handle repairs and regular inspections on the systems we work on. Because New Ark is also a licensed master plumber and HVAC contractor, one company can plan the sprinkler piping around the plumbing, ductwork and heating on the same job.</p>'
            f'<div class="grid"><div class="card"><h3>New construction</h3><p>Sprinkler design and installation coordinated with the plumbing and HVAC rough-in, so trades are not working around each other.</p></div>'
            f'<div class="card"><h3>Renovations and additions</h3><p>Adding or extending sprinkler coverage when a building is remodeled, expanded or changes use.</p></div>'
            f'<div class="card"><h3>Repairs</h3><p>Leaking heads, damaged piping and valves. If a head is leaking, shut off the sprinkler supply valve if you know where it is and call {PHONE}.</p></div>'
            f'<div class="card"><h3>Inspections</h3><p>Regular inspections so building owners and managers know the system is ready when it is needed.</p></div></div>'
            f'<p style="margin-top:14px">Winter tip: sprinkler piping in unheated areas can freeze. See our guide to <a href="blog/fire-sprinkler-pipes-freezing.html">keeping fire sprinkler pipes from freezing</a>. '
            f'For more on New Ark\'s fire protection work, visit <a href="https://arkfps.com/" target="_blank" rel="noopener">New Ark Fire Protection Services</a>.</p>'
            f'<p><b>If there is fire or smoke, get everyone out and call 911 first.</b></p></section>')
    s = s.replace("<section><h2>Serving Western", body + "<section><h2>Serving Western", 1)
    s = re.sub(r"<section><h2>Questions</h2>.*?</section>", faq_html(FIRE_FAQ), s, count=1, flags=re.S)
    s = re.sub(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "FAQPage".*?</script>', "", s, flags=re.S)
    s = add_ld(s, "FAQPage", faq_ld(FIRE_FAQ))
    open(p, "w", encoding="utf-8").write(s)

def home():
    p = os.path.join(ROOT, "index.html"); s = open(p, encoding="utf-8").read()
    s = set_head(s, HOME_TITLE, HOME_DESC)
    s = fix_ld_business(s)
    hb = f'<a class="btn btn-ghost" href="tel:{TEL}">Call {PHONE}</a>'
    if hb not in s:
        s = s.replace('<a class="btn btn-ghost" href="#book">Get a free estimate</a>\n      </div>', f'<a class="btn btn-ghost" href="#book">Get a free estimate</a>\n        {hb}\n      </div>', 1)
    s = s.replace('<div><h5>Contact</h5><a href="#chat" data-chat>message us</a>', f'<div><h5>Contact</h5><a href="tel:{TEL}">{PHONE}</a><a href="#chat" data-chat>Message us</a>')
    s = s.replace("For an emergency, message us here.", f'For an emergency, call <a href="tel:{TEL}">{PHONE}</a> or message us here.')
    for t, _ in NEW_TOWNS:
        s = s.replace(f"<li>{t}</li>", f'<li><a href="{tslug(t)}">{t}</a></li>')
    if tslug(NEW_TOWNS[0][0]) not in s.split('<h5>Service areas</h5>', 1)[-1][:2000]:
        extra = "".join(f'<a href="{tslug(t)}">{e(t)}</a>' for t, _ in NEW_TOWNS)
        s = s.replace('<a href="flemington-nj.html">Flemington</a></div>', f'<a href="flemington-nj.html">Flemington</a>{extra}</div>', 1)
    open(p, "w", encoding="utf-8").write(s)

def sitemap(today):
    old = {}
    sp = os.path.join(ROOT, "sitemap.xml")
    if os.path.exists(sp):
        for u, d in re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", open(sp).read()): old[u] = d
    urls = [SITE + "/"] + [f"{SITE}/{f}" for f in sorted(os.listdir(ROOT)) if f.endswith(".html") and f not in ("index.html", "forms.html", "proposal.html")]
    urls += [SITE + "/blog/"] + [f"{SITE}/blog/{f}" for f in sorted(os.listdir(os.path.join(ROOT, "blog"))) if f.endswith(".html") and f != "index.html"]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
        f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n" for u in sorted(urls)) + "</urlset>\n"
    open(sp, "w").write(sm)

if __name__ == "__main__":
    main()
