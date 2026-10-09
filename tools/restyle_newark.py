"""Brings every New Ark service, town and article page onto the shared look (page.css) and the ark-hvac.com
address. Safe to run again and again: pages already converted are left as they are.

    python3 tools/restyle_newark.py newark-site
"""
import re, sys, pathlib, datetime

root = pathlib.Path(sys.argv[1])
DOMAIN = "https://ark-hvac.com/"
OLD_BASES = ["https://hsw365.github.io/calltwin/newark/", "https://newark-ark.onrender.com/"]
SKIP = {"index.html", "activate.html"}

pages = [p for p in list(root.glob("*.html")) + list(root.glob("blog/*.html")) if not (p.parent == root and p.name in SKIP)]
for p in pages:
    s = p.read_text()
    up = "../" if p.parent.name == "blog" else ""
    for b in OLD_BASES:
        s = s.replace(b, DOMAIN)
    if "page.css" not in s:
        s = re.sub(r"<style>.*?</style>", f'<link rel="stylesheet" href="{up}page.css"><link rel="icon" href="{up}img/logo.webp" type="image/webp">', s, count=1, flags=re.S)
    s = re.sub(r'<link rel="preconnect" href="https://fonts\.g[^>]*>', "", s)
    s = re.sub(r'<link href="https://fonts\.googleapis\.com[^>]*>', "", s)
    s = re.sub(r'(<a class="logo" href="[^"]*">)\s*(?:<svg.*?</svg>|<span class="bars">.*?</span>)\s*New Ark</a>',
               rf'\1<img src="{up}img/logo.webp" alt="" width="54" height="54"><span>New Ark<small>Plumbing, Heating &amp; Air Conditioning</small></span></a>', s, flags=re.S)
    if "askbox.js" not in s:
        s = s.replace("</body>", f'<script src="{up}askbox.js" defer></script></body>')
    p.write_text(s)

# sitemap + robots for the live domain
today = datetime.date.today().isoformat()
urls = [DOMAIN] + sorted(DOMAIN + (("blog/" if p.parent.name == "blog" else "") + ("" if p.name == "index.html" else p.name)) for p in pages)
(root / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
(root / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {DOMAIN}sitemap.xml\n")
print("restyled", len(pages), "pages")
