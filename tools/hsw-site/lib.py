"""HSW365 site system: page builder. One function per section of the template."""
import html, json, urllib.parse

E = html.escape

FAMILY = [
    dict(key="calltwin", name="CallTwin", sub="AI receptionist", who="Local businesses",
         desc="Answers the business line day and night, takes the caller's name, number and the job, and sends it to the owner.",
         url="https://hsw365.github.io/calltwin/"),
    dict(key="queenee", name="QUEENEE", sub="Website building", who="Indie artists and businesses",
         desc="Real websites built from your details. Music, video, merch, booking and contact in one place you own.",
         url="https://hsw365.github.io/queenee/"),
    dict(key="irun", name="iRun", sub="Short video, made and posted", who="Brands that need to post daily",
         desc="Writes the script, records the voiceover, cuts the vertical video and posts it to TikTok and Instagram on a schedule.",
         url="https://hsw365.github.io/iRUN/"),
    dict(key="studio", name="HSW365studio", sub="Vocal studio in the browser", who="Artists and writers",
         desc="Record over your beat, tune the vocal to key, mix it, master it to streaming loudness and export the file.",
         url="https://hsw365.github.io/STUDIO365/"),
    dict(key="klipit", name="Klipit", sub="Stream clipper", who="Streamers and clip pages",
         desc="Paste a stream link and get the best moments back as vertical clips ready to post.",
         url="https://klipit.onrender.com/"),
]

PHONE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>'


def btn(label, href, kind="acc", sm=False, attrs=""):
    cls = "btn btn-%s%s" % (kind, " btn-sm" if sm else "")
    return '<a class="%s" href="%s" %s>%s</a>' % (cls, E(href, quote=True), attrs, label)


def favicon(letter, acc, ink):
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='8' fill='%s'/>"
           "<text x='32' y='47' font-family='Arial Narrow,Arial' font-weight='900' font-size='44' text-anchor='middle' fill='%s'>%s</text></svg>") % (acc, ink, letter)
    return "data:image/svg+xml," + urllib.parse.quote(svg)


def head(s):
    A = s["assets"]
    ld = s.get("ld")
    extra = s.get("head_extra", "")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{E(s['title'])}</title>
<meta name="description" content="{E(s['description'], quote=True)}">
<meta name="theme-color" content="#0a0a0f">
<link rel="canonical" href="{s['canonical']}">
<meta property="og:type" content="website">
<meta property="og:url" content="{s['canonical']}">
<meta property="og:title" content="{E(s['og_title'], quote=True)}">
<meta property="og:description" content="{E(s['description'], quote=True)}">
{('<meta property="og:image" content="%s">' % s['og_image']) if s.get('og_image') else ''}
<link rel="icon" href="{favicon(s['mark'], s['acc'], s['acc_ink'])}">
<link rel="preload" as="font" type="font/woff2" href="{A}fonts/barlow-condensed-latin-900-normal.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="{A}fonts/inter-latin-wght-normal.woff2" crossorigin>
<link rel="stylesheet" href="{A}hsw.css">
<style>:root{{--acc:{s['acc']};--acc-ink:{s['acc_ink']}}}{s.get('css','')}</style>
<script>document.documentElement.classList.add("js")</script>
{('<script type="application/ld+json">%s</script>' % json.dumps(ld, separators=(',',':'))) if ld else ''}
{extra}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
"""


def logo(s, href="#top"):
    return (f'<a class="logo" href="{href}" aria-label="{E(s["name"])} home"><span class="logo-mark" aria-hidden="true">{s.get("mark_html", s["mark"])}</span>'
            f'<span><b>{s["name_html"]}</b><small>{E(s["tagline"])}</small></span></a>')


def header(s):
    links = "".join(f'<a href="{h}">{E(t)}</a>' for t, h in s["nav"])
    cta_label, cta_href = s["cta"]
    phone = ""
    if s.get("phone"):
        p = s["phone"]
        phone = f'<a class="nav-phone" href="{p["href"]}"><span>{E(p["label"])}</span><b>{E(p["text"])}</b></a>'
    util_r = "".join(f'<a href="{E(h, quote=True)}">{E(t)}</a>' for t, h in s["util_links"])
    m_extra = ""
    if s.get("phone"):
        m_extra = f'<a href="{s["phone"]["href"]}">{E(s["phone"]["label"])}: {E(s["phone"]["text"])}</a>'
    return f"""<div class="util"><div class="wrap"><span class="util-l">{s['util']}</span><span class="util-r">{util_r}</span></div></div>
<header class="nav">
  <div class="wrap">
    {logo(s)}
    <nav class="nav-links" aria-label="Page">{links}</nav>
    <div class="nav-cta">
      {phone}
      {btn(E(cta_label), cta_href, 'acc', sm=True, attrs=s.get('cta_attrs',''))}
      <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false"><span></span></button>
    </div>
  </div>
  <nav class="mnav" aria-label="Menu">{links}{m_extra}{btn(E(cta_label), cta_href, 'acc', attrs=s.get('cta_attrs',''))}</nav>
</header>
<main id="main">
"""


def hero(s):
    h = s["hero"]
    lines = "".join(f"<span>{l}</span>" for l in h["h1"])
    ctas = "".join(h["ctas"])
    fine = f'<p class="hero-fine">{h["fine"]}</p>' if h.get("fine") else ""
    wide = " wide-panel" if h.get("wide") else ""
    plate = "".join(f"<div><b>{b}</b><strong>{st}</strong><span>{sp}</span></div>" for b, st, sp in s["plate"])
    return f"""<section class="hero" id="top">
  <div class="wrap hero-grid{wide}">
    <div>
      <p class="status"><i></i>{h['status']}</p>
      <h1{' class="fit"' if h.get('fit') else ''}>{lines}</h1>
      <p class="lede">{h['lede']}</p>
      <div class="hero-ctas">{ctas}</div>
      {fine}
    </div>
    <div>{h['panel']}</div>
  </div>
</section>
<div class="plate"><div class="wrap">{plate}</div></div>
"""


def sec(id_, inner, tint=False, label=None):
    return f'<section class="block{" tint" if tint else ""}" id="{id_}"><div class="wrap">{inner}</div></section>\n'


def sec_head(h2, lede=None):
    l = '<p class="lede">%s</p>' % lede if lede else ""
    return f'<div class="sec-head"><h2>{h2}</h2>{l}</div>'


def checks(items):
    return '<ul class="checks">' + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def chips(items):
    return '<div class="chips">' + "".join(f'<a href="{E(h, quote=True)}">{E(t)}</a>' for t, h in items) + "</div>"


def tabs(items):
    """items: name, sub, shot (html), body (html paragraphs), bullets, links"""
    tl = "".join(
        f'<button class="tab{" on" if i == 0 else ""}" type="button" role="tab" aria-selected="{"true" if i == 0 else "false"}" tabindex="{0 if i == 0 else -1}"><b>{E(t["name"])}</b><span>{E(t["sub"])}</span></button>'
        for i, t in enumerate(items))
    panes = ""
    for i, t in enumerate(items):
        links = chips(t["links"]) if t.get("links") else ""
        panes += (f'<div class="pane{" on" if i == 0 else ""}" role="tabpanel"><h3>{E(t["name"])}</h3>'
                  f'<div class="shot">{t["shot"]}</div>'
                  f'<div class="pane-body"><div>{t["body"]}</div>{checks(t["bullets"])}</div>{links}</div>')
    return f'<div class="tabs"><div class="tab-list" role="tablist" aria-orientation="vertical">{tl}</div><div>{panes}</div></div>'


def ticket(head_l, head_r, rows):
    dl = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in rows)
    return f'<div class="ticket"><div class="ticket-head"><span>{head_l}</span><b>{head_r}</b></div><dl>{dl}</dl></div>'


def talk(lines):
    return '<div class="talk">' + "".join(
        f'<p class="{"me" if who == "me" else ""}"><b>{E(label)}</b>{text}</p>' for who, label, text in lines) + "</div>"


def steps(items, timed=False):
    lis = "".join(
        f'<li>{("<time>%s</time>" % E(t)) if t else ""}<h3>{h}</h3><p>{p}</p></li>' for t, h, p in items)
    return f'<ol class="steps{" timed" if timed else ""}" style="--n:{len(items)}">{lis}</ol>'


def motto(s, quote, cite, about_h, about_lede, about_ps, creds):
    ps = "".join(f"<p>{p}</p>" for p in about_ps)
    cr = "".join(f"<div><b>{b}</b><span>{sp}</span></div>" for b, sp in creds)
    return (f'<p class="motto">{quote}<cite>{cite}</cite></p>'
            f'<div class="about-grid"><div class="about-body"><h2>{about_h}</h2><p class="lede">{about_lede}</p>{ps}</div>'
            f'<div class="creds">{cr}</div></div>')


ABOUT_PS = [
    "HSW365 Media LLC is run by its founder, Elvin Torres Sr., a U.S. Army veteran, author and speaker. He builds each product himself and answers the email himself.",
]


def family(current):
    rows = ""
    for f in FAMILY:
        inner = (f'<div><h3>{E(f["name"])}</h3><span>{E(f["sub"])}</span></div>'
                 f'<div><span class="k">Made for</span><span class="v">{E(f["who"])}</span></div>'
                 f'<p>{E(f["desc"])}</p>')
        if f["key"] == current:
            rows += f'<div class="here">{inner}<span></span></div>'
        else:
            rows += f'<a href="{f["url"]}">{inner}<span class="go">Open {E(f["name"])}</span></a>'
    return f'<div class="ledger">{rows}</div>'


def plan(name, for_, price, per, items, button, main=False, small=None):
    sm = '<p class="small">%s</p>' % small if small else ""
    return (f'<article class="plan{" main" if main else ""}"><h3>{name}</h3><p class="for">{for_}</p>'
            + (f'<p class="price"><b>{price}</b><span>{per}</span></p>' if price else f'<p class="price"><span>{per}</span></p>')
            + f'{checks(items)}{button}{sm}</article>')


def faq(h2, lede, qa, extra=""):
    ds = "".join(f"<details{' open' if i == 0 else ''}><summary>{q}</summary>{''.join('<p>%s</p>' % a for a in (ans if isinstance(ans, list) else [ans]))}</details>"
                 for i, (q, ans) in enumerate(qa))
    return f'<div class="faq"><div><h2>{h2}</h2><p class="lede" style="margin-top:20px">{lede}</p>{extra}</div><div class="faq-list">{ds}</div></div>'


def band(h2, p, ctas):
    return f'<section class="band"><div class="wrap"><div><h2>{h2}</h2><p>{p}</p></div><div class="band-ctas">{"".join(ctas)}</div></div></section>\n'


def footer(s):
    fam = "".join(f'<li><a href="{f["url"]}">{E(f["name"])}</a></li>' for f in FAMILY if f["key"] != s["key"])
    prod = "".join(f'<li><a href="{E(h, quote=True)}">{E(t)}</a></li>' for t, h in s["foot_links"])
    cta_label, cta_href = s.get("sticky", s["cta"])
    return f"""</main>
<footer>
  <div class="wrap">
    <div class="foot">
      <div>{logo(s)}<p>{s['foot_about']}</p></div>
      <div><h4>{E(s['name'])}</h4><ul>{prod}</ul></div>
      <div><h4>More from HSW365</h4><ul>{fam}</ul></div>
      <div><h4>Contact</h4><ul><li><a href="mailto:hsw365media@gmail.com">hsw365media@gmail.com</a></li><li><a href="https://hsw365.co">hsw365.co</a></li>{s.get('foot_contact','')}</ul></div>
    </div>
    <div class="legal"><p>{s.get('legal','')}</p><p>&copy; 2026 HSW365 Media LLC. Turn negative into positive.</p></div>
  </div>
</footer>
<div class="sticky">{btn(E(cta_label), cta_href, 'acc', attrs=s.get('cta_attrs',''))}</div>
<script src="{s['assets']}hsw.js"></script>
{s.get('scripts','')}
</body>
</html>
"""


def page(s, body):
    return head(s) + header(s) + body + footer(s)


def install(out, sub):
    import os, shutil
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(f"{out}/{sub}fonts", exist_ok=True)
    for f in os.listdir(f"{here}/fonts"):
        shutil.copy(f"{here}/fonts/{f}", f"{out}/{sub}fonts/{f}")
    shutil.copy(f"{here}/hsw.css", f"{out}/{sub}hsw.css")
    shutil.copy(f"{here}/hsw.js", f"{out}/{sub}hsw.js")


def about(s, line, creds):
    return motto(s, "Turn negative into positive.", line, "Who is behind " + s["name"],
                 s["name"] + " is built and run by HSW365 Media LLC in New Jersey.", ABOUT_PS, creds)
