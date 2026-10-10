import re
from lib import *

OUT = "/home/claude/repos/iRUN"
old = open(f"{OUT}/index.html").read() if "apply-form" in open(f"{OUT}/index.html").read() and "hsw.css" not in open(f"{OUT}/index.html").read() else open("/home/claude/hswsite/irun_old.html").read()
open("/home/claude/hswsite/irun_old.html", "w").write(old)
# keep the working script exactly as it was
script = re.search(r"<script>\s*\(function \(\) \{\s*var TO.*?</script>", old, re.S).group(0)

css = """
.phone-col{display:grid;justify-items:center;gap:18px}
.phone{position:relative;width:min(300px,78vw);aspect-ratio:9/16;border-radius:14px;overflow:hidden;border:1px solid var(--line2);border-top:4px solid var(--acc);background:#000;box-shadow:0 44px 90px -40px #000}
.phone video{width:100%;height:100%;object-fit:cover}
.sound{position:absolute;right:12px;bottom:12px;height:40px;padding:0 14px;border-radius:3px;border:0;background:#fff;color:#0a0a0f;font-weight:700;font-size:14px;cursor:pointer}
.proof{font-size:14.5px;color:var(--mut);max-width:34ch;text-align:center;line-height:1.5}
.proof strong{color:#fff;display:block}
.pick{display:flex;gap:22px;margin-top:4px}
.pick label{display:flex;align-items:center;gap:9px;font-size:16px;color:#fff;font-weight:500}
.pick input{width:20px;height:20px;accent-color:var(--acc)}
.err{display:none;margin-top:14px;font-size:14.5px;color:#ff8a8a}
.err.on{display:block}
.sent{display:none}
.sent.on{display:block}
.sent h3{margin-bottom:12px}
.sent p{color:var(--text2);margin-bottom:12px}
.sent a{color:#fff;font-weight:600;text-decoration:underline;text-decoration-color:var(--acc);text-underline-offset:4px}
.sent .btn{margin:6px 8px 0 0}
"""

panel = """<div class="phone-col">
  <div class="phone">
    <video id="sample" src="assets/video/irun-sample-calltwin.mp4" poster="assets/video/irun-sample-calltwin.jpg" autoplay muted loop playsinline preload="metadata" aria-label="A 15 second video iRun made for CallTwin"></video>
    <button class="sound" id="sound" type="button" aria-pressed="false">Sound on</button>
  </div>
  <p class="proof"><strong>iRun made this on October 7 for CallTwin.</strong>Script, voice and edit, start to finish. Nobody touched it.</p>
</div>"""

s = dict(
    key="irun", name="iRun", name_html="iRun", mark="i", tagline="Short video, made and posted for you",
    acc="#ef4444", acc_ink="#0a0a0f", assets="assets/hsw/", css=css,
    title="iRun | Six short videos a day for your brand, made and posted for you",
    og_title="iRun | Six videos a day. Zero editing.",
    description="iRun writes the script, records the voiceover, cuts a vertical video and posts it to TikTok and Instagram on a fixed schedule. Six posts a day, made and posted for you.",
    canonical="https://hsw365.github.io/iRUN/",
    og_image="https://hsw365.github.io/iRUN/assets/video/irun-sample-calltwin.jpg",
    util="iRun is a product of HSW365 Media LLC. Posting to TikTok and Instagram.",
    util_links=[("Owner sign in", "app.html")],
    nav=[("The day", "#day"), ("What it makes", "#video"), ("Who it runs", "#brands"), ("Setup", "#setup"), ("Apply", "#apply")],
    cta=("Apply for a spot", "#apply"),
    foot_links=[("Apply for a spot", "#apply"), ("A day of posts", "#day"), ("Owner sign in", "app.html")],
    foot_about="Six short videos a day for your brand: written, voiced, cut and posted on a fixed schedule.",
    legal="Instagram posting needs a Business or Creator account.",
    scripts=script,
)
s["hero"] = dict(
    status="Posting four TikToks and two Reels a day for three brands.",
    h1=["Six videos a day.", "Zero editing."],
    lede="iRun writes the script, records the voiceover, cuts a vertical video and posts it to TikTok and Instagram on a fixed schedule. You tell it what you sell once.",
    ctas=[btn("Apply for a spot", "#apply", "acc"), btn("See a day of posts", "#day", "line")],
    fine="Applying is free. You get the price before anything is connected.",
    panel=panel, fit=True,
)
s["plate"] = [
    ("6 a day", "Four TikToks and two Reels", "Every day, at the same times"),
    ("42 a week", "Per brand", "Run more than one account and each gets its own six"),
    ("Never twice", "A new script every post", "Each one about something you actually sell"),
    ("Free to apply", "Nothing to sign", "You hear the monthly price first"),
]

day = (sec_head("One day on one account.", "Four TikToks and two Reels, every day, at the same times. Each one is a new script about something you actually sell.")
       + steps([("8:00 AM ET", "TikTok", "The morning scroll. A hook about a problem your customer has today."),
                ("11:00 AM ET", "TikTok and a Reel", "Two different videos, one per platform. Never the same clip twice."),
                ("2:00 PM ET", "TikTok", "A second product or a second angle on the first."),
                ("6:00 PM ET", "TikTok and a Reel", "The after-work slot, where people have time to tap the link.")], timed=True)
       + '<p class="steps-note">That is 42 videos a week per brand. Run more than one account and each gets its own six.</p>')

video = ('<div class="split"><div><h2>What goes into one video.</h2><p class="lede">This is the script behind the video at the top of the page. iRun wrote it from two sentences about what CallTwin does.</p>'
         '<ul class="points">'
         '<li><h4>A script built to be read on screen</h4><p>Short lines, one idea each, with the hook first and the ask last.</p></li>'
         '<li><h4>A voiceover and captions that match</h4><p>Every line is spoken and shown, so it works with the sound off.</p></li>'
         '<li><h4>A caption, hashtags and one keyword</h4><p>Each video asks viewers to comment or DM a single word. On Instagram, iRun answers with your link and saves who asked.</p></li>'
         '<li><h4>Only what you told it</h4><p>iRun uses the facts you gave it. It does not invent prices, reviews or results for your business.</p></li>'
         '</ul></div>'
         '<div class="ticket" style="margin-top:0" aria-label="Script of the sample video"><div class="ticket-head"><span>CallTwin, TikTok</span><b>15 SECONDS</b></div><ol>'
         '<li>Your phone rang while you were working</li><li>That caller didn\'t leave a voicemail</li><li>They called the next business instead</li>'
         '<li>CallTwin answers every call for you</li><li>Gets their name, number and the job</li><li>Texts it to you the second it ends</li><li>DM CALL to @hsw365media on Instagram</li></ol>'
         '<div class="cap">Every missed call is a customer calling your competitor next. CallTwin picks up when you can\'t.<span>#smallbusiness #contractor #aireceptionist #missedcalls #entrepreneur</span></div></div></div>')

def row(name, sub, who, desc, label, url):
    return (f'<a href="{url}" target="_blank" rel="noopener"><div><h3>{name}</h3><span>{sub}</span></div>'
            f'<div><span class="k">Platform</span><span class="v">{who}</span></div><p>{desc}</p><span class="go">{label}</span></a>')

brands = (sec_head("Three brands it runs every day.", "iRun was built to promote HSW365's own products first. These accounts get a fresh batch of videos from it daily.")
          + '<div class="ledger">'
          + row("Software", "@hsw365media", "TikTok and Instagram", "Apps for business owners and creators: an AI receptionist, a stream clipper, a website builder.", "View @hsw365media", "https://www.tiktok.com/@hsw365media")
          + row("A speaker and author", "@hoodstar365", "TikTok", "Speaking bookings, four books and a podcast from an Army veteran.", "View @hoodstar365", "https://www.tiktok.com/@hoodstar365")
          + row("A streetwear store", "@hsw365.co", "Instagram", "One-of-one hand-bleached tees and prints, each with its own story.", "View @hsw365.co", "https://www.instagram.com/hsw365.co")
          + '</div>')

setup = (sec_head("Getting your brand on it.", "Nothing goes out under your name until you have seen it.")
         + steps([(None, "Tell it what you sell", "Your products or services, who buys them and where the link should go. Plain words are enough."),
                  (None, "Watch the first videos", "iRun makes your first batch as drafts. You see them before anything goes out under your name."),
                  (None, "Connect your accounts", "You approve iRun on TikTok and Instagram and it posts on schedule. Until you do, the videos come to you as files to post yourself.")]))

apply_ = ('<div class="split"><div><h2>Apply for a spot.</h2><p class="lede">iRun is taking a small number of outside brands. Tell us about yours and Elvin Torres Sr., the founder, will reply himself.</p>'
          + checks(["No charge to apply and nothing to sign.", "You hear the monthly price before any account is connected.", "Instagram posting needs a Business or Creator account.", "You can pause or stop whenever you want."])
          + '</div><div class="panel">'
          '<form id="apply-form" novalidate>'
          '<div class="row2"><div class="field" style="margin-top:0"><label for="f-name">Your name</label><input id="f-name" type="text" autocomplete="name" maxlength="80" required></div>'
          '<div class="field" style="margin-top:0"><label for="f-email">Email</label><input id="f-email" type="email" autocomplete="email" inputmode="email" maxlength="254" required></div></div>'
          '<div class="field"><label for="f-brand">Brand or business name</label><input id="f-brand" type="text" autocomplete="organization" maxlength="120" required></div>'
          '<div class="row2"><div class="field"><label for="f-handles">Social handles <small>(optional)</small></label><input id="f-handles" type="text" maxlength="200" placeholder="@yourbrand" autocapitalize="none"></div>'
          '<div class="field"><label for="f-link">Website or shop link <small>(optional)</small></label><input id="f-link" type="url" maxlength="300" placeholder="https://" autocapitalize="none"></div></div>'
          '<div class="field"><label for="f-sells">What do you sell, and to who?</label><textarea id="f-sells" maxlength="1000" required></textarea></div>'
          '<div class="field"><label id="pf-label">Where should iRun post?</label><div class="pick" role="group" aria-labelledby="pf-label">'
          '<label><input type="checkbox" name="pf" value="TikTok" checked> TikTok</label><label><input type="checkbox" name="pf" value="Instagram" checked> Instagram</label></div></div>'
          '<p class="err" id="apply-err" role="alert"></p>'
          '<button class="btn btn-acc" type="submit" id="apply-btn" style="width:100%;margin-top:18px">Send my application</button>'
          '<p class="panel-foot">This opens an email to hsw365media@gmail.com with your answers filled in. Press send in your mail app to finish.</p></form>'
          '<div class="sent" id="apply-sent" role="status"><h3>One more tap</h3><p>Your application is in a new email, addressed to hsw365media@gmail.com. Press send there and it is in.</p>'
          '<p>If no email opened, copy your answers and send them to <a href="mailto:hsw365media@gmail.com">hsw365media@gmail.com</a>.</p>'
          '<button class="btn btn-line btn-sm" type="button" id="apply-copy">Copy my answers</button><button class="btn btn-line btn-sm" type="button" id="apply-back">Edit my answers</button></div>'
          '</div></div>')

body = (hero(s)
        + sec("day", day)
        + sec("video", video, tint=True)
        + sec("brands", brands)
        + sec("setup", setup, tint=True)
        + sec("apply", apply_)
        + sec("about", about(s, "The HSW365 motto. An account nobody sees becomes an account that posts six times a day.",
                             [("Drafts first", "You see the first batch before anything posts"), ("Your facts only", "No invented prices, reviews or results"),
                              ("Founder replies", "Applications are answered by Elvin Torres Sr."), ("Pause or stop", "Whenever you want")]), tint=True)
        + sec("family", sec_head("More from HSW365.", "iRun is one of five products HSW365 Media builds and runs. It makes the videos for the other four.") + family("irun"))
        + band("Put your brand on the schedule.", "Applying is free. You hear the price before anything is connected.", [btn("Apply for a spot", "#apply", "ink")]))

install(OUT, "assets/hsw/")
open(f"{OUT}/index.html", "w").write(page(s, body))
print("ok")
