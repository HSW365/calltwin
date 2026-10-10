from lib import *

OUT = "/home/claude/repos/STUDIO365"

# The plan sheet (pro.css / pro.js) and the live demo (landing.js) are the studio's own and stay as they are.
css = """
:root{--ink:#0a0a0f;--ink-2:#101018;--panel:#14141d;--panel-2:#1a1a25;--line-2:#33334a;--text-2:#b4b4c3;--muted:#8f8f9f;--cyan:#22d3ee;--cyan-dim:rgba(34,211,238,.14);--violet:#a855f7;--violet-dim:rgba(168,85,247,.16);--red:#ef4444;--yellow:#fbbf24;--display:var(--disp);--r-s:3px;--r-m:4px;--r-l:6px}
.console{margin:0;padding:18px}
.console-top{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.demo-play{width:52px;height:52px;border-radius:50%;border:0;background:var(--acc);color:var(--acc-ink);display:grid;place-items:center;cursor:pointer;flex:none}
.demo-play svg{width:20px;height:20px;fill:currentColor}
.demo-play .i-stop{display:none}
.demo-play.playing .i-play{display:none}
.demo-play.playing .i-stop{display:block}
.ab{display:inline-flex;padding:4px;border-radius:3px;background:var(--bg);border:1px solid var(--line2)}
.ab button{border:0;background:none;padding:9px 16px;border-radius:2px;cursor:pointer;font-weight:600;font-size:14.5px;color:var(--text2)}
.ab button[aria-checked="true"][data-mode="tuned"]{background:var(--acc);color:var(--acc-ink)}
.ab button[aria-checked="true"][data-mode="raw"]{background:#3a3a4d;color:#fff}
.console-readout{margin-left:auto;font:700 14px var(--mono);color:var(--text2)}
#demoCanvas{width:100%;height:clamp(240px,26vw,340px);border-radius:4px;background:var(--bg);border:1px solid var(--line)}
.console figcaption{font-size:13.5px;color:var(--mut);margin-top:14px;padding-top:14px;border-top:1px solid var(--line);line-height:1.5}
.console figcaption b{color:#fff;font-weight:600}
.btn.primary{background:var(--acc);color:var(--acc-ink)}
.btn.primary:hover{background:#fff}
.btn.ghost{border-color:var(--line2);color:#fff}
.btn.ghost:hover{border-color:#fff}
.pro-sheet{border-radius:6px}
.pro-sheet .btn{height:auto;min-height:46px;font-size:15px;padding:0 18px}
.pro-sheet h2,.pro-sheet h3{letter-spacing:.01em}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);max-width:min(560px,calc(100vw - 32px));background:var(--card2);border:1px solid var(--line2);color:#fff;padding:12px 18px;border-radius:4px;font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:60;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast.error{border-color:var(--bad)}
"""

panel = """<figure class="panel console" aria-labelledby="demoCaption">
  <div class="console-top">
    <button class="demo-play" id="demoPlay" type="button" aria-label="Play demo">
      <svg viewBox="0 0 24 24" class="i-play" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>
      <svg viewBox="0 0 24 24" class="i-stop" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>
    </button>
    <div class="ab" role="radiogroup" aria-label="What you hear">
      <button type="button" role="radio" aria-checked="false" data-mode="raw" id="abRaw">As sung</button>
      <button type="button" role="radio" aria-checked="true" data-mode="tuned" id="abTuned">Tuned</button>
    </div>
    <span class="console-readout" id="demoNote" aria-live="off">A minor</span>
  </div>
  <canvas id="demoCanvas" aria-hidden="true"></canvas>
  <figcaption id="demoCaption">Press play, then flip between <b>As sung</b> and <b>Tuned</b>. The grey line is the singer drifting. The line on top is where HSW365studio puts every note.</figcaption>
</figure>"""

MARK = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="6" width="4" height="20" rx="1"/><rect x="17" y="9" width="4" height="14" rx="1"/><rect x="24" y="3" width="4" height="26" rx="1"/></svg>'

s = dict(
    key="studio", name="HSW365studio", name_html="HSW365studio", mark="S", mark_html=MARK, tagline="Vocal studio in your browser",
    acc="#a855f7", acc_ink="#0a0a0f", assets="assets/hsw/", css=css,
    head_extra='<link rel="stylesheet" href="assets/css/pro.css">',
    title="HSW365studio | Record, tune, mix and master in your browser",
    og_title="HSW365studio | Record it tonight. Release it tonight.",
    description="A full vocal studio in your browser. Record over your beat, snap the vocal to key, mix it, master it to streaming loudness and export the file. First 3 projects free.",
    canonical="https://hsw365.github.io/STUDIO365/",
    og_image="https://hsw365.github.io/STUDIO365/assets/img/og.png",
    util="HSW365studio is a product of HSW365 Media LLC. Runs in Chrome, Edge, Safari and Firefox.",
    util_links=[("Open the studio", "studio.html")],
    nav=[("What it does", "#does"), ("How it works", "#chain"), ("Your session", "#session"), ("Pricing", "#pricing"), ("Questions", "#faq")],
    cta=("Open the studio", "studio.html"),
    sticky=("Start your 3 free projects", "studio.html"),
    foot_links=[("Open the studio", "studio.html"), ("Pricing", "#pricing"), ("Questions", "#faq")],
    foot_about="A full vocal studio in your browser: record, tune, mix, master and export.",
    legal='Your music is yours. HSW365studio claims no rights to anything you record. <span hidden>&copy; <span id="year">2026</span></span>',
    scripts='<div class="toast" id="toast" role="status" aria-live="polite"></div>\n<script src="config.js"></script>\n<script type="module" src="assets/js/landing.js"></script>',
)
s["hero"] = dict(
    status="No download. No card to start.",
    h1=["Record it tonight.", "Release it tonight."],
    lede="HSW365studio is a full vocal studio in your browser. Record over your beat, snap the vocal to key, mix it, master it to streaming loudness, and walk away with a finished file.",
    ctas=[btn("Start your 3 free projects", "studio.html", "acc"), btn("See pricing", "#pricing", "line")],
    fine="Your first 3 projects are free. Plans from $15 a month after that.",
    panel=panel, wide=True, fit=True,
)
s["plate"] = [
    ("3 free", "Projects to start", "No card and nothing to download"),
    ("24-bit WAV", "What distributors ask for", "Plus MP3 320, MP3 128 and a vocal stem"),
    ("-14 LUFS", "Mastered for streaming", "Or -9 for the club, peaks under -1 dB"),
    ("From $15", "A month, when you want one", "Nothing bills on its own"),
]

does = tabs([
    dict(name="Record", sub="Your beat, a count-in, as many vocal tracks as the song needs",
         shot=ticket("Session", "REC", [("Beat", "Dropped in, key detected"), ("Count-in", "On, with click"), ("Lead", "Take 3 kept"), ("Ad-libs", "2 tracks"), ("Shortcut", "R to record, Space to play")]),
         body="<p>Drop in your beat and press Record. A count-in and click keep you on time, and every take lines up to the beat automatically.</p><p>Lay the lead, then stack ad-libs on their own tracks. Take as many as you want and keep the best one.</p>",
         bullets=["As many vocal tracks as the song needs", "Takes line up to the beat", "Count-in and click", "Editing tools: split, cut, copy, paste, fades, undo"]),
    dict(name="Tune", sub="Reads the key of your beat and pulls each note to it",
         shot=ticket("Tune", "A MINOR", [("Key", "Read from your beat"), ("Retune speed", "Hard and stepped, or light"), ("Strength", "How obvious it is"), ("Vibrato", "Kept intact"), ("Tune Pro", "Place notes by hand (Plus)")]),
         body="<p>HSW365studio tracks the pitch of your take, finds the nearest note in your key and shifts the audio to it.</p><p>Go hard and robotic, or keep it natural with your vibrato intact. The demo at the top of this page is the same correction.</p>",
         bullets=["Key detection", "Real pitch correction, not an effect", "Retune speed and strength controls", "Pitch display while you sing"]),
    dict(name="Mix", sub="A real console with faders, pan and live meters",
         shot=ticket("Console", "LIVE", [("Every channel", "Fader, pan, mute, solo, meter"), ("EQ", "Drag the curve"), ("Compressor", "Set it and hear it"), ("De-esser", "Tames the S sounds"), ("Space", "Reverb and echo")]),
         body="<p>A real console: faders, pan, mute, solo and live meters on every channel. Drag the EQ, set the compressor, tame the S sounds, and hear every move while it plays.</p>",
         bullets=["Faders, pan, mute and solo", "Live meters on every channel", "EQ, compressor and de-esser", "Reverb and echo"]),
    dict(name="Master and export", sub="Hit a loudness target and download the file",
         shot=ticket("Export", "READY", [("Loudness", "-14 LUFS streaming, -9 club"), ("Peaks", "Held under -1 dB"), ("WAV", "24-bit, for your distributor"), ("MP3", "320 and 128, for sharing"), ("Stem", "Processed vocal alone")]),
         body="<p>Hit a real loudness target, -14 LUFS for streaming or -9 for the club, with peaks held safely under -1 dB.</p><p>Download a 24-bit WAV for your distributor, MP3s for sharing, or your processed vocal alone for a producer.</p>",
         bullets=["Streaming and club loudness targets", "24-bit WAV master", "MP3 320 and MP3 128", "Processed vocal stem"]),
])

chain = steps([
    (None, "Record", "Drop in your beat and press Record."),
    (None, "Tune", "The vocal is pulled to the key of your beat."),
    (None, "Mix", "Balance it on the console while it plays."),
    (None, "Master", "Bring it to streaming loudness."),
    (None, "Export", "Download the WAV and the MP3s."),
])

session = ('<div class="split"><div><h2>Your session never leaves your machine.</h2><p class="lede">Takes, beats and settings save inside your browser as you work. Close the tab, come back next week, and the session opens where you left it. Nothing uploads unless you choose to share it.</p></div>'
           '<dl class="deflist" style="margin-top:0">'
           '<div><dt>Runs in</dt><dd>Chrome, Edge, Safari and Firefox on desktop, laptop and tablet</dd></div>'
           '<div><dt>Takes</dt><dd>As many as you want per session. Pick the best one and keep the rest</dd></div>'
           '<div><dt>Exports</dt><dd>WAV 24-bit, MP3 320, MP3 128, processed vocal stem</dd></div>'
           '<div><dt>Shortcuts</dt><dd>Space to play and stop, R to record</dd></div></dl></div>')

def buy(label, key, url, kind):
    return f'<a class="btn btn-{kind}" data-buy="{key}" href="{url}" target="_blank" rel="noopener">{label}</a>'

pricing = (sec_head("Your first 3 projects are free. Then pick a plan.", "Each purchase is one month. Nothing bills on its own. Add a month whenever you want.")
           + '<div class="plans">'
           + plan("Starter", "The full studio", "$15", "a month",
                  ["Unlimited projects", "Record over your beat with as many vocal tracks as the song needs", "Key detection and pitch correction",
                   "Mixing console with live meters, EQ, compressor, de-esser, reverb and echo", "Editing tools: arrow, range, split, eraser, cut, copy, paste, fades, undo",
                   "Mastering to streaming loudness, WAV and MP3 export"], buy("Get Starter", "starter", "https://hsw365.co/cart/47998395744417:1", "line"))
           + plan("Plus", "For stacked, tuned vocals", "$20", "a month",
                  ["Everything in Starter", "Tune Pro: place notes by hand in the pitch editor, plus humanize, flex, transpose and voice character",
                   "Vocal stacks: wide doubles and in-key harmonies built from your own take", "Six more vocal presets, from R&amp;B silk to drill"],
                  buy("Get Plus", "plus", "https://hsw365.co/cart/47998395777185:1", "acc"), main=True)
           + plan("Pro", "For records you are releasing", "$25", "a month",
                  ["Everything in Plus", "A&amp;R365 record check: a score and plain fixes before you release",
                   "Release pack: masters, tagged MP3, 3000 px cover and a release sheet in one ZIP", "Session backup files, so a song can move to another computer"],
                  buy("Get Pro", "pro", "https://hsw365.co/cart/47998395809953:1", "line"))
           + '</div>'
           + '<p class="plan-note"><a href="studio.html" id="btnGoPro">Start your 3 free projects</a> &nbsp; <button type="button" id="btnHaveKey">I have a key</button></p>'
           + '<p class="plan-note" id="proNote" style="margin-top:10px">Checkout is on hsw365.co. Your key is emailed to the address on your order. Tap the link in that email and your plan turns on.</p>')

qa = [
    ("What do I need to start?", "A computer, a browser, and a microphone. A USB mic or an interface is best, but a headset mic works for writing sessions. Wear headphones while you record so the beat doesn't bleed into your vocal."),
    ("Is the tuning real pitch correction?", "Yes. HSW365studio tracks the pitch of your take, finds the nearest note in your key, and shifts the audio to it. Retune speed and strength control how obvious it is, from a hard, stepped effect to light, invisible correction."),
    ("Where are my sessions stored?", "In your browser's storage on the device you used. They stay there until you delete them or clear site data. Export anything you want to keep forever. Pro adds session backup files, so you can save a whole session and open it on another computer."),
    ("Can I release what I make?", "Yes. The master WAV is 24-bit and loudness-matched for streaming, which is what distributors ask for. Your music is yours. HSW365studio claims no rights to anything you record."),
    ("What does it cost?", "Your first 3 projects are free. After that, buy a month of Starter, Plus or Pro at hsw365.co. Your key is emailed to the address on your order. Tap the link in that email and your plan turns on. Nothing is billed automatically. When your month ends your sessions stay on your device, and you can add another month whenever you like."),
    ("Does it work on my phone?", "It opens and plays back on phones, but recording on a phone depends on the browser's mic handling. For sessions you plan to release, use a laptop or tablet with headphones."),
    ("My recording is out of time with the beat.", "Bluetooth headphones add delay the browser can't always measure. Use wired headphones, or drag the take with the Move tool, or nudge it with the Vocal timing fader on the Vocal channel, until it sits on the grid."),
]

body = (hero(s)
        + sec("does", sec_head("One room. Every stage of the record.", "Everything between the idea and the upload happens in one browser tab.") + does)
        + sec("chain", sec_head("Five stops from idea to finished record.") + chain, tint=True)
        + sec("session", session)
        + sec("pricing", pricing, tint=True)
        + sec("about", about(s, "The HSW365 motto. No studio budget becomes a finished record tonight.",
                             [("Your music is yours", "No rights claimed on anything you record"), ("Stays on your device", "Nothing uploads unless you share it"),
                              ("No auto-billing", "Each purchase is one month"), ("Built by an artist", "The founder records under the HOODSTAR365 label")]))
        + sec("family", sec_head("More from HSW365.", "HSW365studio is one of five products HSW365 Media builds and runs.") + family("studio"), tint=True)
        + sec("faq", faq("Questions.", "What artists ask before the first session.", qa))
        + band("The beat is ready. So are you.", "Three projects free. No card and nothing to download.", [btn("Start your 3 free projects", "studio.html", "ink")]))

install(OUT, "assets/hsw/")
open(f"{OUT}/index.html", "w").write(page(s, body))
print("ok")
