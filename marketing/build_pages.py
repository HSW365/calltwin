#!/usr/bin/env python3
"""Builds CallTwin SEO pages for GitHub Pages:
   for/<industry>.html, for/index.html, blog/index.html (lists blog/*.html), sitemap.xml
Run from the repo root:  python marketing/build_pages.py
"""
import html, json, os, re, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
from industries import INDUSTRIES, CITIES
import city_pages

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://hsw365.github.io/calltwin"
PHONE, PHONE_TEL = "(856) 204-3643", "+18562043643"
e = html.escape

CSS = """:root{--bg:#0a0a0f;--panel:#111119;--line:#262633;--ink:#ececf2;--muted:#9a9aae;--cyan:#22d3ee;--violet:#a855f7;--yellow:#fbbf24}
*{box-sizing:border-box}html,body{background:var(--bg)}body{margin:0;color:var(--ink);font:16px/1.65 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--cyan)}.wrap{max-width:1040px;margin:auto;padding:0 16px}
h1,h2,h3{font-family:"Barlow Condensed",Inter,sans-serif;text-transform:uppercase;letter-spacing:.01em;line-height:1.05;margin:0}
h1{font-size:clamp(36px,6vw,62px);margin:14px 0}h2{font-size:30px;margin:0 0 14px}h3{font-size:20px;margin:0 0 6px}
nav{display:flex;justify-content:space-between;align-items:center;height:64px;border-bottom:1px solid var(--line)}
.brand{font:800 22px "Barlow Condensed",sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--ink);text-decoration:none}.brand b{color:var(--cyan)}
.ey{color:var(--cyan);font:700 12px Inter;letter-spacing:.14em;text-transform:uppercase;margin-top:40px}
.lede{color:var(--muted);font-size:18px;max-width:760px}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}
.btn{display:inline-flex;align-items:center;height:50px;padding:0 20px;border-radius:10px;background:linear-gradient(100deg,var(--cyan),var(--violet));color:#07070b;font:800 14px Inter;text-transform:uppercase;letter-spacing:.05em;text-decoration:none}
.btn.gh{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
section{padding:44px 0;border-top:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px}
.card p{color:var(--muted);margin:0}
.call{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;max-width:640px}
.msg{margin:8px 0;padding:10px 14px;border-radius:12px;max-width:85%}.msg.c{background:#1b1b26}.msg.a{background:#0f2a31;margin-left:auto}
.msg b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
ul.check{padding-left:20px}ul.check li{margin:6px 0}
.price{font:800 44px "Barlow Condensed";color:var(--cyan)}
details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:8px 0}summary{font-weight:700;cursor:pointer}details p{color:var(--muted);margin:8px 0 0}
.links a{display:inline-block;margin:4px 10px 4px 0}
footer{padding:30px 0;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
@media(max-width:760px){.grid{grid-template-columns:1fr}}"""

HEAD = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}"><link rel="canonical" href="{url}">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}"><meta property="og:url" content="{url}"><meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>{css}</style>{ld}</head><body><div class="wrap">
<nav><a class="brand" href="{site}/">CallTwin <b>AI</b></a><a href="{site}/signup.html" style="font-weight:700">Get started</a></nav>"""

def foot(extra="", serving=None):
    serving = serving or CITIES
    return f"""<section><h2>Get CallTwin</h2><div class="price">$500 setup &middot; 14 days free &middot; $99/mo</div>
<p class="lede">No contract. Pay by card, Zelle or Cash App. Not a computer person? Call and we'll sign you up on the phone.</p>
<div class="btns"><a class="btn" href="{SITE}/signup.html">Sign up online</a><a class="btn gh" href="tel:{PHONE_TEL}">Call {PHONE}</a></div></section>
{extra}<footer>CallTwin by HSW365 Media LLC &middot; Serving {e(serving)} &middot; <a href="{SITE}/for/">All industries</a> &middot; <a href="{SITE}/blog/">Articles</a> &middot; Client: <a href="{SITE}/newark/">New Ark Plumbing, Heating &amp; Air</a> &middot; hsw365media@gmail.com</footer></div></body></html>"""

def industry_page(ind):
    url = f"{SITE}/for/{ind['slug']}.html"
    desc = re.sub(r"\s+", " ", ind["lede"])[:155]
    ld = [{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in ind["faq"]]},
          {"@context": "https://schema.org", "@type": "Service", "name": f"AI receptionist for {ind['name'].lower()}", "serviceType": "AI phone answering service",
           "provider": {"@type": "Organization", "name": "HSW365 Media LLC", "url": SITE, "telephone": PHONE_TEL},
           "areaServed": "United States", "offers": {"@type": "Offer", "price": "99", "priceCurrency": "USD", "description": "$500 one-time setup, first 14 days free, then $99/month"}}]
    ldtag = "".join(f'<script type="application/ld+json">{json.dumps(x)}</script>' for x in ld)
    pains = "".join(f'<div class="card"><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in ind["pains"])
    call = "".join(f'<div class="msg {"a" if who == "CallTwin" else "c"}"><b>{e(who)}</b>{e(t)}</div>' for who, t in ind["call"])
    caps = "".join(f"<li>{e(c)}</li>" for c in ind["captures"])
    faq = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in ind["faq"])
    est = (f'<section><h2>Turn calls into signed estimates</h2><p class="lede">Add AI Estimates ($49/mo, free trial) and every {e(ind["trade"])} call becomes a draft estimate priced from <b>your</b> price book. '
           f'You approve it, the customer signs on their phone and pays a deposit by card, and follow-ups go out automatically.</p></section>') if ind["estimate"] else ""
    others = " ".join(f'<a href="{SITE}/for/{o["slug"]}.html">{e(o["name"])}</a>' for o in INDUSTRIES if o["slug"] != ind["slug"])
    body = f"""<div class="ey">CallTwin for {e(ind['name'])}</div><h1>{e(ind['h1'])}</h1><p class="lede">{e(ind['lede'])}</p>
<div class="btns"><a class="btn" href="{SITE}/signup.html">Get CallTwin</a><a class="btn gh" href="tel:{PHONE_TEL}">Sign up by phone {PHONE}</a></div>
<section><h2>Why {e(ind['name'].lower())} miss money on the phone</h2><div class="grid">{pains}</div></section>
<section><h2>What a call sounds like</h2><div class="call">{call}</div></section>
<section><h2>What you get in every text</h2><ul class="check">{caps}</ul><p class="lede">English and Spanish, 24 hours a day. You keep your number: forward it with *72, turn it off with *73.</p></section>
{est}<section><h2>Questions {e(ind['name'].lower())} ask</h2>{faq}</section>"""
    extra = (f'<section><h3>CallTwin for {e(ind["name"].lower())} in your city</h3><p><a href="{SITE}/for/{ind["slug"]}/">See all cities</a></p>'
             f'<h3>CallTwin for other businesses</h3><div class="links">{others}</div></section>')
    return HEAD.format(title=e(ind["title"]), desc=e(desc), url=url, css=CSS, ld=ldtag, site=SITE) + body + foot(extra)

def hub_page():
    url = f"{SITE}/for/"
    cards = "".join(f'<a class="card" style="text-decoration:none;color:inherit" href="{SITE}/for/{i["slug"]}.html"><h3>{e(i["name"])}</h3><p>{e(i["lede"][:130])}...</p></a>' for i in INDUSTRIES)
    body = f"""<div class="ey">Industries</div><h1>An AI receptionist built for how your business gets calls.</h1>
<p class="lede">CallTwin answers every call 24/7, takes the details your trade needs, and texts you the job. Pick your business:</p><div class="grid">{cards}</div>"""
    return HEAD.format(title="CallTwin AI Receptionist by Industry | HSW365", desc="AI receptionist for plumbers, HVAC, electricians, roofers, cleaners, salons, law firms and more. Answers every call 24/7 and texts you each job.", url=url, css=CSS, ld="", site=SITE) + body + foot()

def blog_index():
    posts = []
    bdir = os.path.join(ROOT, "blog")
    os.makedirs(bdir, exist_ok=True)
    for f in sorted(os.listdir(bdir)):
        if not f.endswith(".html") or f == "index.html":
            continue
        s = open(os.path.join(bdir, f), encoding="utf-8").read()
        t = re.search(r"<title>(.*?)</title>", s, re.S)
        d = re.search(r'<meta name="date" content="([^"]+)"', s)
        ds = re.search(r'<meta name="description" content="([^"]*)"', s)
        posts.append((d.group(1) if d else "2026-01-01", f, html.unescape(t.group(1)) if t else f, html.unescape(ds.group(1)) if ds else ""))
    posts.sort(reverse=True)
    items = "".join(f'<a class="card" style="display:block;text-decoration:none;color:inherit;margin-bottom:12px" href="{SITE}/blog/{f}"><h3>{e(t.split(" | ")[0])}</h3><p>{e(ds)}</p><p style="font-size:12px;margin-top:6px">{d}</p></a>' for d, f, t, ds in posts) or '<p class="lede">Articles coming soon.</p>'
    body = f'<div class="ey">Articles</div><h1>Answer more calls. Win more jobs.</h1><p class="lede">Practical tips for small businesses that live on the phone.</p>{items}'
    return HEAD.format(title="CallTwin Articles | Missed Calls, Small Business Growth", desc="Practical articles for small business owners on missed calls, faster estimates and winning more jobs.", url=f"{SITE}/blog/", css=CSS, ld="", site=SITE) + body + foot(), [p[1] for p in posts], {p[1]: p[0] for p in posts}

def main():
    today = datetime.date.today().isoformat()
    fdir = os.path.join(ROOT, "for"); os.makedirs(fdir, exist_ok=True)
    for ind in INDUSTRIES:
        open(os.path.join(fdir, f"{ind['slug']}.html"), "w", encoding="utf-8").write(industry_page(ind))
    open(os.path.join(fdir, "index.html"), "w", encoding="utf-8").write(hub_page())
    H = dict(e=e, SITE=SITE, PHONE=PHONE, PHONE_TEL=PHONE_TEL, CSS=CSS, HEAD=HEAD, foot=foot, INDUSTRIES=INDUSTRIES)
    pool = city_pages.cities()
    city_urls = []
    for ind in INDUSTRIES:
        d = os.path.join(fdir, ind["slug"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(city_pages.city_hub(ind, pool, H))
        city_urls.append((f"{SITE}/for/{ind['slug']}/", today, "0.7"))
        for c in pool:
            open(os.path.join(d, f"{c['slug']}.html"), "w", encoding="utf-8").write(city_pages.city_page(ind, c, pool, H))
            city_urls.append((f"{SITE}/for/{ind['slug']}/{c['slug']}.html", today, "0.6"))
    page, posts, dates = blog_index()
    open(os.path.join(ROOT, "blog", "index.html"), "w", encoding="utf-8").write(page)
    urls = [(f"{SITE}/", today, "1.0"), (f"{SITE}/signup.html", today, "0.9"), (f"{SITE}/for/", today, "0.8"), (f"{SITE}/blog/", today, "0.7")]
    urls += [(f"{SITE}/for/{i['slug']}.html", today, "0.8") for i in INDUSTRIES]
    urls += [(f"{SITE}/blog/{p}", dates.get(p, today), "0.6") for p in posts]
    urls += city_urls
    nk = os.path.join(ROOT, "newark", "sitemap.xml")  # include client sites hosted here (New Ark)
    if os.path.exists(nk):
        for loc, mod in re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", open(nk, encoding="utf-8").read()):
            urls.append((loc, mod, "0.7"))
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"  <url><loc>{u}</loc><lastmod>{d}</lastmod><priority>{p}</priority></url>\n" for u, d, p in urls) + "</urlset>\n"
    open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write(sm)
    print(f"built {len(INDUSTRIES)} industry pages, {len(city_urls)} city pages/hubs, {len(posts)} articles, sitemap with {len(urls)} urls")

if __name__ == "__main__":
    main()
