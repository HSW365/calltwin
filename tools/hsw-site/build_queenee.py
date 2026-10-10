import re, os
from lib import *

OUT = "/home/claude/repos/queenee"
SAVE = "/home/claude/hswsite/queenee_old.html"
cur = open(f"{OUT}/index.html").read()
if "hsw.css" not in cur:
    open(SAVE, "w").write(cur)
old = open(SAVE).read()

# The sign-up popup and its script are QUEENEE's own working flow. They are carried over untouched.
modal = old[old.index("<!-- Sign-up popup -->"):old.rindex("<script>")]
script = old[old.rindex("<script>"):old.rindex("</script>") + 9]
old_css = re.sub(r"/\*.*?\*/", "", re.search(r"<style>(.*?)</style>", old, re.S).group(1), flags=re.S)


def scope(css, root="#modal"):
    """Prefix every rule of the old stylesheet so it only styles the popup."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        sel = css[i:j].strip()
        # find matching close
        depth, k = 1, j + 1
        while depth and k < n:
            depth += css[k] == "{"
            depth -= css[k] == "}"
            k += 1
        block = css[j + 1:k - 1]
        if sel.startswith("@media"):
            out.append(sel + "{" + scope(block, root) + "}")
        elif sel.startswith("@"):
            out.append(sel + "{" + block + "}")
        else:
            sels = []
            for x in sel.split(","):
                x = x.strip()
                if x in ("html", "body") or x.startswith("html"):
                    continue
                if x == ":root":
                    sels.append(root)
                elif x.startswith(".modal") or x.startswith("body.lock"):
                    sels.append(x)
                else:
                    sels.append(root + " " + x)
            if sels:
                out.append(",".join(sels) + "{" + block + "}")
        i = k
    return "".join(out)


css = scope(old_css) + """
.hide{display:none!important}
body.lock{overflow:hidden}
#modal{font-size:16px;line-height:1.6}
#modal .mbox{border-radius:6px}
#modal .btn{height:auto;white-space:normal;border-radius:3px}
#modal .btn-p{background:var(--acc);color:var(--acc-ink)}
#modal .btn-p:hover{background:#fff;box-shadow:none;transform:none}
#modal .eyebrow{color:var(--mut)}
#modal p{max-width:none}
#modal h2,#modal h3{color:#fff}
.site-rows{display:grid}
.site-rows>div{display:grid;grid-template-columns:110px 1fr;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);font-size:15px}
.site-rows>div:last-child{border-bottom:0}
.site-rows span{font-family:var(--mono);font-size:12.5px;color:var(--mut);padding-top:2px}
.site-rows b{font-weight:500;color:#fff}
"""

OPEN = 'data-open=""'

panel = f"""<div class="panel">
  <div class="panel-top"><span class="avatar" aria-hidden="true">Q</span><div><b>What goes on your site</b><span>Built from the details you give us</span></div></div>
  <div class="ticket"><div class="ticket-head"><span>yourname.com</span><b>YOURS</b></div>
    <div class="site-rows">
      <div><span>Music</span><b>Your tracks and videos playing on the page</b></div>
      <div><span>Merch</span><b>Links to your store and tickets</b></div>
      <div><span>Booking</span><b>A contact form for shows and features</b></div>
      <div><span>Business</span><b>Services, hours, tap-to-call</b></div>
      <div><span>Domain</span><b>One you own, connected at launch</b></div>
    </div>
  </div>
  <button class="btn btn-acc" type="button" {OPEN} style="width:100%;margin-top:16px">Get my website</button>
  <p class="panel-foot">New site or a rebuild. Pay by card, Cash App or Zelle. <span id="wave" hidden></span></p>
</div>"""

s = dict(
    key="queenee", name="QUEENEE", name_html="QUEENEE", mark="Q", tagline="Websites by HSW365 Media",
    acc="#fbbf24", acc_ink="#0a0a0f", assets="site/", css=css,
    head_extra='<script src="config.js"></script>',
    title="QUEENEE | Websites for indie artists and businesses | HSW365",
    og_title="QUEENEE | More than a link in bio. Your own website.",
    description="QUEENEE builds real websites for indie artists, business owners and anyone with something to put out. Your music, videos, merch, booking and contact in one place you own.",
    canonical="https://hsw365.github.io/queenee/",
    util="QUEENEE is website building by HSW365 Media LLC. New sites and rebuilds.",
    util_links=[("Custom quote", "mailto:hsw365media@gmail.com?subject=QUEENEE%20custom%20website%20quote")],
    nav=[("Who it's for", "#who"), ("How it works", "#how"), ("CallTwin", "#calltwin"), ("Packages", "#pricing"), ("Questions", "#faq")],
    cta=("Get my website", "#signup"), cta_attrs=OPEN,
    foot_links=[("Packages", "#pricing"), ("Who it's for", "#who"), ("Questions", "#faq")],
    foot_about="Real websites for indie artists, business owners and anyone with something to put out.",
    legal="You see the price when you sign up. The site and its content are yours.",
    scripts=modal + script,
)
s["hero"] = dict(
    status="Building sites for artists and businesses. New or rebuild.",
    h1=["More than a", "link in bio.", "Your own site."],
    lede="QUEENEE builds real websites for indie artists, business owners and anyone with something to put out. Your music, videos, merch, booking and contact in one place you own.",
    ctas=[f'<button class="btn btn-acc" type="button" {OPEN}>Get my website</button>', btn("See packages", "#pricing", "line")],
    fine="We build it. You approve it. It goes live.",
    panel=panel,
)
s["plate"] = [
    ("You own it", "The site and its content", "Nothing a platform can take down or bury"),
    ("Your domain", "Connected at launch", "On a domain you own"),
    ("New or rebuild", "Start from scratch or replace one", "Built from your details, not a template you finish"),
    ("3 ways to pay", "Card, Cash App or Zelle", "You see the price when you sign up"),
]

who = tabs([
    dict(name="Indie artists", sub="Rappers, singers, producers, bands, DJs",
         shot=ticket("Artist site", "LIVE", [("Home", "New single, out now"), ("Listen", "Your tracks on the page"), ("Watch", "Your videos"), ("Shop", "Merch and tickets"), ("Book", "Shows and features")]),
         body="<p>One address for everything you drop, that no platform can take down or bury. Send your streaming, video and social links and we build the site from those.</p>",
         bullets=["Your music and videos playing on the page", "Links to every streaming platform", "Merch and ticket links", "Booking and features contact form", "Press kit: bio, photos, contact", "Show dates and new release announcements"]),
    dict(name="Business owners", sub="Shops, trades, salons, food, services",
         shot=ticket("Business site", "LIVE", [("Home", "What you do and where"), ("Services", "With prices and hours"), ("Work", "Reviews and photos"), ("Call", "Tap-to-call button"), ("Book", "Booking button")]),
         body="<p>A site that gets the customer to call, book or buy. Add CallTwin and the calls it brings in get answered day and night.</p>",
         bullets=["Services, prices and hours", "Tap-to-call and booking buttons", "Reviews and photos of your work", "Set up to show on Google"]),
    dict(name="Anyone else", sub="Authors, podcasters, speakers, creators, events, nonprofits",
         shot=ticket("Your site", "LIVE", [("Home", "Your story"), ("Work", "What you have made"), ("Join", "Sign-up form"), ("Support", "Buy, donate or book"), ("Contact", "A form that reaches you")]),
         body="<p>If people need to find you, you need a site. Tell us what you do and what the site needs to pull off.</p>",
         bullets=["Your story and your work", "Sign-up and contact forms", "Links to buy, donate or book", "Your own domain connected"]),
])

how = steps([
    (None, "Sign up", "Pick a package and tell us about you."),
    (None, "Pay", "Card, Cash App or Zelle. Put your order number in the note."),
    (None, "We build", "Design and copy made from your details."),
    (None, "You launch", "Approve it or ask for changes, then it goes live."),
])

calltwin = ('<div class="split"><div><h2>Your website brings calls. Who answers them?</h2>'
            '<p class="lede">Every missed call is a customer calling someone else next. CallTwin is an AI receptionist trained on your business. It picks up day or night, answers questions and takes the lead down for you.</p>'
            + checks(["Answers 24/7. Nights, weekends, holidays, while you are on a job.", "Knows your business. Services, hours and service area come from your website build.", "Captures every lead. Name, number and what they need."])
            + f'<div class="hero-ctas"><button class="btn btn-acc" type="button" data-open="bundle">Add CallTwin to my website</button><a class="btn btn-line" data-calltwin target="_blank" rel="noopener">See CallTwin</a></div></div>'
            '<div class="panel"><div class="panel-top"><span class="avatar" aria-hidden="true">C</span><div><b>CallTwin</b><span>Example call, 11:42 PM</span></div></div>'
            + talk([("me", "CALLER", "Hi, are you open tomorrow? My AC stopped working."),
                    ("ai", "CALLTWIN", "Sorry to hear that. We open at 7 AM and do same-day AC repair. Can I get your name and address so a tech can call you first thing?"),
                    ("me", "CALLER", "Sure, it's Dana, 14 Park Ave."),
                    ("ai", "CALLTWIN", "Got it, Dana. You are first on the 7 AM list. The owner has your details now.")])
            + '<p class="panel-foot">Lead saved and sent to the owner.</p></div></div>')

pricing = (sec_head("Two ways to start.", "Get the website on its own, or add CallTwin so every call gets answered. You see the price when you sign up.")
           + '<div class="plans" style="--n:2">'
           + plan("Website", "New or rebuild", None, "One-time",
                  ["Custom design for you or your business", "Built for phones first, fast and secure", "Music, video, merch, booking and contact sections as you need them",
                   "Set up to be found on Google", "Your domain connected at launch", "Changes before launch"],
                  '<button class="btn btn-acc" type="button" data-open="website">Choose website</button>', main=True)
           + plan("Website + CallTwin", "For businesses", None, "Website plus a 24/7 AI receptionist",
                  ["Everything in the website", "CallTwin 24/7 AI receptionist", "Trained on your business during the build", "Paid in monthly installments"],
                  '<button class="btn btn-line" type="button" data-open="bundle">Choose website + CallTwin</button>')
           + '</div><p class="plan-note">Pay by card, Cash App ($hsw365) or Zelle. Bigger project with a store, member area or custom features? <a data-mail="custom">Request a custom quote</a>.</p>')

qa = [
    ("I'm an artist with no website. Can I sign up?", 'Yes. Choose "I need a new website" and drop your streaming, video and social links in the form. We build the site from those.'),
    ("How do I pay?", "After you sign up you get an order number and three ways to pay: card through Stripe, Cash App to $hsw365, or Zelle. Put your order number in the payment note so we can match it."),
    ("How long does it take?", "We confirm your build timeline by email after you sign up, based on the size of your site."),
    ("Do I own my website?", "Yes. The site and its content are yours. We connect it to a domain you own."),
    ("Can I add CallTwin later?", "Yes. Adding it at sign-up means it is trained on your business during the build and connected to your site at launch."),
]

body = (hero(s)
        + sec("who", sec_head("Built around what you do.", "A full build from your details, not a template you finish yourself. Tell us what you do and what the site needs to pull off.") + who)
        + sec("how", sec_head("Four steps to live.") + how, tint=True)
        + sec("calltwin", calltwin)
        + sec("pricing", pricing, tint=True)
        + sec("about", about(s, "The HSW365 motto. Rented space on someone else's platform becomes a site you own.",
                             [("You approve it", "Changes before launch"), ("You own it", "Site, content and domain"), ("Built for phones first", "Fast and secure"), ("Three ways to pay", "Card, Cash App or Zelle")]))
        + sec("family", sec_head("More from HSW365.", "QUEENEE is one of five products HSW365 Media builds and runs.") + family("queenee"), tint=True)
        + sec("faq", faq("Straight answers.", 'Something else? Email <a class="tlink" data-mail="contact"></a>.', qa))
        + band("Put your name on your own address.", "Pick a package, tell us about you, and we build it.", [f'<button class="btn btn-ink" type="button" {OPEN}>Get my website</button>']))

install(OUT, "site/")
open(f"{OUT}/index.html", "w").write(page(s, body))
print("ok")
