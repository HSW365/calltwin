from lib import *

OUT = "/home/claude/repos/KLIPIT/public"

css = """
.cliprow{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line)}
.cliprow:last-child{border-bottom:0}
.cliprow i{width:34px;height:60px;border-radius:3px;background:var(--card2);border:1px solid var(--line2);display:block}
.cliprow b{display:block;font-size:15px;font-weight:600;color:#fff;line-height:1.3}
.cliprow span{font-family:var(--mono);font-size:12.5px;color:var(--mut)}
.cliprow em{font-style:normal;font-family:var(--mono);font-size:12.5px;color:var(--acc)}
#tiers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}
.tier{position:relative;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line2);border-top-width:4px;border-radius:6px;padding:clamp(24px,2.6vw,36px)}
.tier.feature{border-color:var(--acc)}
.tier h3{font-size:clamp(30px,2.6vw,40px)}
.tier .pop{position:absolute;top:18px;right:18px;font-size:12.5px;font-weight:700;color:var(--acc-ink);background:var(--acc);padding:4px 9px;border-radius:99px;text-transform:lowercase}
.tier .pop::first-letter{text-transform:uppercase}
.tier .price{display:block;font-family:var(--disp);font-weight:900;font-size:clamp(64px,6vw,92px);line-height:.9;color:#fff;margin-top:18px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.tier .price small{font-family:var(--body);font-size:15px;font-weight:400;color:var(--mut);margin-left:8px}
.tier ul{list-style:none;display:grid;gap:10px;margin:22px 0 28px;font-size:15.5px}
.tier li{padding-left:18px;position:relative;color:var(--text)}
.tier li::before{content:"";position:absolute;left:0;top:.62em;width:8px;height:2px;background:var(--acc)}
.tier .btn{margin-top:auto;width:100%}
.btn-primary{background:var(--acc);color:var(--acc-ink)}
.btn-primary:hover{background:#fff}
.btn-ghost{border-color:var(--line2);color:#fff;background:transparent}
.btn-ghost:hover{border-color:#fff;background:#fff;color:#0a0a0f}
.loading{color:var(--mut);padding:24px 0}
#status{margin-top:14px;font-family:var(--mono);font-size:14px;color:var(--text2);min-height:1.5em}
#status.err{color:#ff8a8a}
.clips{display:grid;gap:10px;margin-top:14px}
.clip{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px;border:1px solid var(--line2);border-radius:4px;background:var(--bg)}
.clip .meta strong{display:block;color:#fff;font-size:15.5px}
.clip .meta span{font-family:var(--mono);font-size:12.5px;color:var(--mut)}
.clip .btn{height:44px;padding:0 16px;font-size:14.5px}
@media (max-width:980px){#tiers{grid-template-columns:1fr}}
"""

panel = """<div class="panel">
  <div class="panel-top"><span class="avatar" aria-hidden="true">K</span><div><b>What comes back</b><span>Example result from one pasted stream</span></div></div>
  <div class="ticket">
    <div class="ticket-head"><span>Stream scanned</span><b>CLIPS READY</b></div>
    <div class="cliprow"><i></i><div><b>Five stars in under a minute</b><span>412s to 447s</span></div><em>Vertical</em></div>
    <div class="cliprow"><i></i><div><b>The getaway that should not have worked</b><span>1,930s to 1,972s</span></div><em>Vertical</em></div>
    <div class="cliprow"><i></i><div><b>Chat calls it, streamer loses it</b><span>3,204s to 3,231s</span></div><em>Vertical</em></div>
  </div>
  <p class="panel-foot">Titles and times here are an example. Yours come from the stream you paste. Each clip has a download button.</p>
</div>"""

s = dict(
    key="klipit", name="Klipit", name_html="Klipit", mark="K", tagline="GTA 6 stream clipper",
    acc="#22d3ee", acc_ink="#0a0a0f", assets="hsw/", css=css,
    title="Klipit | Paste a GTA 6 stream, get clips ready to post | HSW365",
    og_title="Klipit | Paste the stream. Post the clips.",
    description="Paste a GTA 6 stream link from YouTube, Twitch or Kick. Klipit finds the best moments and cuts them into vertical clips for TikTok, Reels and Shorts.",
    canonical="https://klipit.onrender.com/",
    util="Klipit is a product of HSW365 Media LLC. Billed monthly through Stripe.",
    util_links=[("I already subscribe", "#clip")],
    nav=[("How it works", "#how"), ("Plans", "#pricing"), ("Clip a stream", "#clip"), ("Questions", "#faq")],
    cta=("See plans", "#pricing"),
    foot_links=[("How it works", "#how"), ("Plans", "#pricing"), ("Clip a stream", "#clip")],
    foot_about="Paste a GTA 6 stream link and get the best moments back as vertical clips.",
    legal="Not affiliated with or endorsed by Rockstar Games or Take-Two. GTA and Grand Theft Auto are trademarks of their respective owners. You are responsible for the rights to any stream you submit.",
    scripts='<script src="/app.js"></script>',
)
s["hero"] = dict(
    status="For GTA 6 streams on YouTube, Twitch and Kick.",
    h1=["Paste the stream.", "Post the clips."],
    lede="Drop in a GTA 6 stream link. Klipit reads the stream, finds the funniest, most clutch and most unhinged moments, and cuts them into vertical clips ready to post. No editing and no timeline.",
    ctas=[btn("See plans", "#pricing", "acc"), btn("I already subscribe", "#clip", "line")],
    fine="One stream can cover a week of posts. Cancel anytime.",
    panel=panel, fit=True,
)
s["plate"] = [
    ("3 sources", "YouTube, Twitch and Kick", "Paste the link to the stream or the VOD"),
    ("Vertical", "Cut for the feed", "TikTok, Reels and Shorts"),
    ("Up to 40", "Clips from one stream", "The number goes up with your plan"),
    ("From $20", "A month", "Billed through Stripe. Cancel anytime."),
]

how = steps([
    (None, "Paste the link", "Copy the GTA 6 stream link from the streamer you are watching and drop it in."),
    (None, "Klipit finds the moments", "It scans the stream and picks the parts most likely to get shared: fails, clutch plays, rage and chaos."),
    (None, "Download and post", "Each clip comes back vertical with a title, ready for TikTok, Reels and Shorts."),
])

gets = ('<div class="split"><div>' + '<h2>What changes as you go up.</h2><p class="lede">Every plan clips the same way. Higher plans scan more of the stream, return more clips and sharpen the output.</p></div>'
        '<dl class="deflist" style="margin-top:0">'
        '<div><dt>Clips</dt><dd>3 per stream on Starter, 15 on Pro, 40 on Elite</dd></div>'
        '<div><dt>Stream length</dt><dd>Scans up to 30 minutes on Starter, 2 hours on Pro, 8 hours on Elite</dd></div>'
        '<div><dt>Quality</dt><dd>720p on Starter. 1080p on Pro and Elite</dd></div>'
        '<div><dt>Captions</dt><dd>Burned in on Pro and Elite</dd></div>'
        '<div><dt>Watermark</dt><dd>Klipit watermark on Starter. None on Pro and Elite</dd></div>'
        '</dl></div>')

pricing = (sec_head("Three plans.", "More clips, longer streams and sharper video as you go up. Billed monthly through Stripe.")
           + '<div id="tiers"><div class="loading">Loading plans</div></div>'
           + '<p class="plan-note">Cancel anytime. Trouble checking out? Email <a href="mailto:hsw365media@gmail.com">hsw365media@gmail.com</a>.</p>')

clip = ('<div class="split"><div><h2>Clip a stream.</h2><p class="lede">For active subscribers. Enter the email on your plan and the stream link.</p>'
        + checks(["YouTube, Twitch or Kick link", "Status updates while it works", "A download button on every clip"]) + '</div>'
        '<div class="panel"><label class="field" style="margin-top:0"><span>Subscriber email</span><input id="email" type="email" autocomplete="email" placeholder="you@email.com"></label>'
        '<label class="field"><span>GTA 6 stream link</span><input id="url" type="url" placeholder="https://www.youtube.com/watch?v=" autocapitalize="none"></label>'
        '<button id="go" class="btn btn-acc" type="button" style="width:100%;margin-top:14px">Generate clips</button>'
        '<div id="status" class="status" role="status"></div><div id="clips" class="clips"></div></div></div>')

qa = [
    ("Which streams work?", "GTA 6 streams and VODs from YouTube, Twitch and Kick. Paste the link the same way you would share it."),
    ("How many clips do I get?", "It depends on your plan: 3 per stream on Starter, 15 on Pro and 40 on Elite."),
    ("How do I pay and cancel?", "Plans are billed monthly through Stripe. You can cancel anytime."),
    ("Who owns the clips?", "You are responsible for the rights to any stream you submit. Klipit is not affiliated with Rockstar Games or Take-Two."),
    ("Something is not working. Who do I contact?", 'Email <a class="tlink" href="mailto:hsw365media@gmail.com">hsw365media@gmail.com</a> with the email on your plan and the stream link.'),
]

body = (hero(s)
        + sec("how", sec_head("Three steps. No timeline.", "You never open an editor. You paste a link and download what comes back.") + how)
        + sec("gets", gets, tint=True)
        + sec("pricing", pricing)
        + sec("clip", clip, tint=True)
        + sec("about", about(s, "The HSW365 motto. Hours of stream nobody rewatches become clips people share.",
                             [("Three sources", "YouTube, Twitch and Kick"), ("Made for the feed", "Vertical clips with a title"), ("Monthly", "Billed through Stripe, cancel anytime")]))
        + sec("family", sec_head("More from HSW365.", "Klipit is one of five products HSW365 Media builds and runs.") + family("klipit"), tint=True)
        + sec("faq", faq("Questions.", "Short answers before you subscribe.", qa))
        + band("Turn one stream into a week of posts.", "Pick a plan, paste a link, download the clips.", [btn("See plans", "#pricing", "ink"), btn("I already subscribe", "#clip", "inkline")]))

install(OUT, "hsw/")
open(f"{OUT}/index.html", "w").write(page(s, body))
print("ok")
