# City landing pages for CallTwin: for/<industry>/<city-st>.html and for/<industry>/index.html
# Built by build_pages.py. Each page adds content specific to the city's state (season, weather,
# language, time zone) and links to nearby cities, so pages are useful on their own rather than
# copies of the industry page with a city name swapped in.
import json, math, re
from cities import CITY_LIST

N_CITIES = 100  # largest US cities to cover. Raise gradually and watch Search Console before adding more.

HOT = set("AZ FL TX NV LA MS AL GA SC HI OK AR NM".split())
COLD = set("AK CO CT ID IL IN IA ME MA MI MN MT NE NH NY ND OH PA RI SD UT VT WI WY WV".split())
HAIL = set("TX OK KS NE CO SD WY MN IA MO".split())
HURRICANE = set("FL LA TX MS AL GA SC NC".split())
SPANISH = set("CA TX NM AZ NV FL NJ NY IL CO".split())


def climate(st):
    return "hot" if st in HOT else "cold" if st in COLD else "mixed"


def cities():
    return CITY_LIST[:N_CITIES]


def dist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 7918 * math.asin(math.sqrt(h))  # miles


def nearby(city, pool, n=6):
    return sorted((c for c in pool if c["slug"] != city["slug"]), key=lambda c: dist(city, c))[:n]


def season(ind, c):
    """One or two sentences on when this trade gets slammed with calls in this city's climate."""
    s, city, stn, cl = ind["slug"], c["name"], c["state_name"], climate(c["state"])
    lines = {
        "plumbers": {
            "cold": f"When a hard freeze hits {stn}, pipes split across {city} overnight and every plumber's phone rings at once the next morning.",
            "hot": f"{city} plumbers stay busy year-round with slab leaks, water heaters and heavy summer water use, so the phone never really slows down.",
            "mixed": f"{city} gets both winter freeze calls and summer storm backups, so plumbing call volume spikes more than once a year."},
        "hvac": {
            "cold": f"{stn} winters make no-heat calls urgent. The first cold snap in {city} buries HVAC shops in calls in a single afternoon.",
            "hot": f"The {city} cooling season is long, and when AC units quit in a heat wave, homeowners call until someone picks up.",
            "mixed": f"{city} HVAC shops get two rushes a year: no-heat calls on the first cold night and no-AC calls in the first heat wave."},
        "electricians": {
            "cold": f"Winter storms in {stn} knock out power and bring bursts of urgent calls, while panel upgrades and EV chargers fill the rest of the year.",
            "hot": f"Summer storms and heavy AC load in {city} trip breakers and fry panels, and EV charger installs keep quote requests coming.",
            "mixed": f"Storm outages, panel upgrades and EV charger installs keep {city} electricians' phones busy in every season."},
        "roofers": {
            "cold": f"Snow load, ice dams and spring storms in {stn} send {city} homeowners to the phone looking for a roofer who answers.",
            "hot": f"Long sun seasons wear roofs fast in {city}, and every big storm sends homeowners calling three roofers at once.",
            "mixed": f"Every big storm through {city} brings a wave of leak and damage calls, and the roofer who answers first gets the inspection."},
        "cleaning-services": {
            "cold": f"Spring cleaning and move season are the busy months for {city} cleaners, and that's when inquiries pile up fastest.",
            "hot": f"{city} cleaners field move-in, move-out and short-term rental turnover calls all year.",
            "mixed": f"Move season and holiday deep cleans bring {city} cleaning businesses their biggest rushes of calls."},
        "landscapers": {
            "cold": f"The {stn} growing season is short, so {city} landscapers get most of the year's calls in a few spring weeks.",
            "hot": f"{city} landscapers work nearly year-round, and irrigation problems in the heat can't wait for a callback.",
            "mixed": f"Spring cleanups and fall leaf season are the two big call rushes for {city} landscapers."},
        "contractors": {
            "cold": f"{city} homeowners plan remodels over the winter and call in spring, all at once, when the building season opens.",
            "hot": f"{city} contractors can build year-round, so remodel and repair calls come in steadily, and leads go to whoever answers.",
            "mixed": f"Remodel season in {city} runs spring through fall, and each project starts with a phone call someone has to answer."},
        "auto-repair": {
            "cold": f"{stn} winters kill batteries and wreck tires, so {city} shops get slammed on the first cold mornings.",
            "hot": f"Heat is hard on cars in {city}: AC failures, overheating and dead batteries bring steady urgent calls.",
            "mixed": f"{city} shops see AC calls in summer and battery and tire calls in winter, and every one starts with a phone call."},
    }
    out = lines.get(s, {}).get(cl)
    if not out:  # salons, law firms, dental/medical, real estate: calls follow people's schedules, not weather
        out = {
            "salons": f"{city} clients book on their lunch break, after work and on Sundays, which is exactly when you're busy with the chair.",
            "law-firms": f"People in {city} call a lawyer right after something happens, often at night, and they hire the first firm that listens.",
            "dental-offices": f"{city} patients call about pain and appointments before and after work, when your front desk is slammed or closed.",
            "real-estate": f"{city} buyers call about listings nights and weekends, often while you're in a showing.",
        }.get(s, f"{city} customers call when it suits them, not when your office is open.")
    return out


def weather(ind, c):
    s, st, city = ind["slug"], c["state"], c["name"]
    if s in ("roofers", "contractors") and st in HAIL and st in HURRICANE:
        return f"{city} sits in both hail and hurricane country. After a storm, CallTwin can answer many calls at the same time, so no one gets a busy signal."
    if s in ("roofers", "contractors") and st in HAIL:
        return f"{city} is in hail country. After a hailstorm, CallTwin answers many calls at the same time, so no homeowner hits voicemail."
    if s in ("roofers", "contractors", "landscapers", "electricians") and st in HURRICANE:
        return f"Hurricane season brings surges of calls in {city}. CallTwin answers many calls at the same time and flags active leaks and outages as urgent."
    if s == "plumbers" and st in COLD:
        return "Frozen-pipe calls are flagged urgent, and callers are told how to shut off their water while they wait for you."
    return ""


def local_faq(ind, c):
    name, city, st = ind["name"].lower(), c["name"], c["state"]
    faq = [
        (f"Does CallTwin work for {name} in {city}, {st}?",
         f"Yes. CallTwin works with any US business phone line. You forward your {city} number to CallTwin with *72 and calls go straight to it. There's nothing to install and you keep your number."),
        ("What if someone calls at night or on a weekend?",
         f"CallTwin answers 24 hours a day, 7 days a week. The job details are texted to you the moment the call ends, whether that's 2pm or 2am {c['tz']} time."),
    ]
    if st in SPANISH:
        faq.append(("Can it answer callers who speak Spanish?",
                    f"Yes. If a caller speaks Spanish, CallTwin answers in Spanish and still texts you the details in English. That matters in {city}, where many customers prefer Spanish."))
    return faq + ind["faq"][:2]


def city_page(ind, c, pool, H):
    """H holds the shared pieces from build_pages: SITE, PHONE, PHONE_TEL, CSS, HEAD, foot, e."""
    e, SITE = H["e"], H["SITE"]
    iname, city, st = ind["name"], c["name"], c["state"]
    url = f"{SITE}/for/{ind['slug']}/{c['slug']}.html"
    title = f"AI Receptionist for {iname} in {city}, {st} | CallTwin"
    desc = f"CallTwin answers every call to your {city} {ind['trade']} business 24/7, takes the job details and texts them to you. $500 setup, 14 days free, $99/mo."
    faq = local_faq(ind, c)
    ld = [{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
          {"@context": "https://schema.org", "@type": "Service", "name": f"AI receptionist for {iname.lower()} in {city}, {st}", "serviceType": "AI phone answering service",
           "provider": {"@type": "Organization", "name": "HSW365 Media LLC", "url": SITE, "telephone": H["PHONE_TEL"]},
           "areaServed": {"@type": "City", "name": city, "containedInPlace": {"@type": "State", "name": c["state_name"]}},
           "offers": {"@type": "Offer", "price": "99", "priceCurrency": "USD", "description": "$500 one-time setup, first 14 days free, then $99/month"}},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "Industries", "item": f"{SITE}/for/"},
              {"@type": "ListItem", "position": 2, "name": iname, "item": f"{SITE}/for/{ind['slug']}.html"},
              {"@type": "ListItem", "position": 3, "name": f"{city}, {st}", "item": url}]}]
    ldtag = "".join(f'<script type="application/ld+json">{json.dumps(x)}</script>' for x in ld)

    wx = weather(ind, c)
    lang = (f'<div class="card"><h3>English and Spanish</h3><p>Many {e(city)} callers prefer Spanish. CallTwin answers them in Spanish and texts you the job in English.</p></div>'
            if st in SPANISH else
            f'<div class="card"><h3>Keep your {e(city)} number</h3><p>Forward your existing line with *72. Turn it off with *73. Your customers never see a new number.</p></div>')
    local = f"""<section><h2>Built for {e(iname.lower())} in {e(city)}</h2><p class="lede">{e(season(ind, c))}{(' ' + e(wx)) if wx else ''}</p>
<div class="grid"><div class="card"><h3>Answers 24/7, {e(c['tz'])} time</h3><p>Nights, weekends and holidays in {e(city)} are covered. The job lands on your phone as a text the moment the call ends.</p></div>
{lang}<div class="card"><h3>No contract</h3><p>$500 setup, the first 14 days free, then $99 a month. Cancel anytime.</p></div></div></section>"""
    fix = (lambda t: t.replace("basement", "garage")) if climate(st) == "hot" else (lambda t: t)  # few basements in warm-climate cities
    call = "".join(f'<div class="msg {"a" if who == "CallTwin" else "c"}"><b>{e(who)}</b>{e(fix(t))}</div>' for who, t in ind["call"])
    caps = "".join(f"<li>{e(x)}</li>" for x in ind["captures"])
    faqh = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in faq)
    near = " ".join(f'<a href="{SITE}/for/{ind["slug"]}/{n["slug"]}.html">{e(n["name"])}, {n["state"]}</a>' for n in nearby(c, pool))
    trades = " ".join(f'<a href="{SITE}/for/{o["slug"]}/{c["slug"]}.html">{e(o["name"])}</a>' for o in H["INDUSTRIES"] if o["slug"] != ind["slug"])
    est = (f'<section><h2>Turn {e(city)} calls into signed estimates</h2><p class="lede">Add AI Estimates ($49/mo, free trial) and every call becomes a draft estimate priced from <b>your</b> price book. '
           f'You approve it, the customer signs on their phone and pays a deposit by card.</p></section>') if ind["estimate"] else ""
    crumbs = f'<p style="font-size:13px;color:var(--muted);margin-top:18px"><a href="{SITE}/for/">Industries</a> / <a href="{SITE}/for/{ind["slug"]}.html">{e(iname)}</a> / <a href="{SITE}/for/{ind["slug"]}/">Cities</a> / {e(city)}, {st}</p>'
    body = f"""{crumbs}<div class="ey">CallTwin for {e(iname)} &middot; {e(city)}, {st}</div>
<h1>The AI receptionist for {e(city)} {e(iname.lower())}.</h1><p class="lede">{e(ind['lede'])}</p>
<div class="btns"><a class="btn" href="{SITE}/signup.html">Get CallTwin</a><a class="btn gh" href="tel:{H['PHONE_TEL']}">Sign up by phone {H['PHONE']}</a></div>
{local}<section><h2>What a call sounds like</h2><div class="call">{call}</div></section>
<section><h2>What you get in every text</h2><ul class="check">{caps}</ul></section>
{est}<section><h2>Questions from {e(city)} {e(iname.lower())}</h2>{faqh}</section>"""
    extra = (f'<section><h3>{e(iname)} near {e(city)}</h3><div class="links">{near}</div>'
             f'<h3 style="margin-top:18px">Other businesses in {e(city)}</h3><div class="links">{trades}</div></section>')
    head = H["HEAD"].format(title=e(title), desc=e(desc), url=url, css=H["CSS"], ld=ldtag, site=SITE)
    return head + body + H["foot"](extra, serving="businesses across the United States")


def city_hub(ind, pool, H):
    e, SITE = H["e"], H["SITE"]
    by_state = {}
    for c in sorted(pool, key=lambda c: (c["state_name"], c["name"])):
        by_state.setdefault(c["state_name"], []).append(c)
    groups = "".join(f'<div class="card"><h3>{e(stn)}</h3><div class="links">' + " ".join(
        f'<a href="{SITE}/for/{ind["slug"]}/{c["slug"]}.html">{e(c["name"])}</a>' for c in cs) + "</div></div>" for stn, cs in by_state.items())
    body = f"""<div class="ey">CallTwin for {e(ind['name'])}</div><h1>AI receptionist for {e(ind['name'].lower())}, city by city.</h1>
<p class="lede">CallTwin works on any US phone line. Pick your city to see how it handles calls for {e(ind['trade'])} businesses there.</p>
<div class="grid">{groups}</div>"""
    title = f"AI Receptionist for {ind['name']} by City | CallTwin"
    desc = f"CallTwin answers every call to {ind['trade']} businesses 24/7 and texts you each job. Find your city."
    return H["HEAD"].format(title=e(title), desc=e(desc), url=f"{SITE}/for/{ind['slug']}/", css=H["CSS"], ld="", site=SITE) + body + H["foot"](serving="businesses across the United States")
