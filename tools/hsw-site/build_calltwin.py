import os, shutil
from lib import *

OUT = "/home/claude/calltwin"
TEL = "tel:+18562043643"
TEL_TXT = "(856) 204-3643"

panel = """<div class="panel" id="demo">
  <div class="panel-top"><span class="avatar" aria-hidden="true">C</span><div><b>Hear how it answers for you</b><span>Sample call, written out. Put your business in.</span></div></div>
  <form id="demo-form">
    <div class="row2">
      <label class="field"><span>Business name</span><input id="biz" value="ABC Plumbing" maxlength="60" autocomplete="organization"></label>
      <label class="field"><span>Trade</span><select id="industry"><option>Plumbing</option><option>HVAC</option><option>Electrical</option><option>Roofing</option><option>Cleaning</option><option>Landscaping</option><option>Auto repair</option><option>Law firm</option><option>Salon</option></select></label>
    </div>
    <button class="btn btn-white" type="submit" style="width:100%%;margin-top:12px">Run the call</button>
  </form>
  <div id="demo-out" aria-live="polite"></div>
  <p class="panel-foot">This is an example written from your answers, not a recording. To set up the real one, <a href="signup.html">sign up</a> or call <a href="%s">%s</a>.</p>
</div>""" % (TEL, TEL_TXT)

demo_js = r"""<script>
(function(){
  var CASES={
    "Plumbing":["I've got water leaking under my kitchen sink.","Leak under kitchen sink","Today"],
    "HVAC":["My heat stopped working last night.","No heat","Today"],
    "Electrical":["Half the outlets in my kitchen went dead.","Dead outlets, kitchen","This week"],
    "Roofing":["I have a leak in the ceiling after the rain.","Roof leak, ceiling stain","Today"],
    "Cleaning":["I need a move-out cleaning for a two bedroom.","Move-out clean, 2 bedroom","This week"],
    "Landscaping":["I need a fall cleanup and the hedges cut back.","Fall cleanup and hedges","This week"],
    "Auto repair":["My car is grinding when I brake.","Brakes grinding","Tomorrow"],
    "Law firm":["I was in a car accident and need to talk to a lawyer.","New client, car accident","Callback today"],
    "Salon":["Do you have anything open Saturday for a color?","Color appointment","Saturday"]
  };
  function esc(s){return String(s).replace(/[&<>'"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
  var f=document.getElementById('demo-form'),out=document.getElementById('demo-out');
  function run(){
    var biz=esc((document.getElementById('biz').value||'Your business').trim()),ind=document.getElementById('industry').value,c=CASES[ind];
    out.innerHTML='<div class="talk">'
      +'<p><b>CALLTWIN</b>Thanks for calling '+biz+'. How can I help you?</p>'
      +'<p class="me"><b>CALLER</b>'+esc(c[0])+'</p>'
      +'<p><b>CALLTWIN</b>We can help with that. Can I get your name, the best number to reach you, and the address?</p>'
      +'</div>'
      +'<div class="ticket"><div class="ticket-head"><span>Job sent to the owner</span><b>NEW</b></div><dl>'
      +'<dt>Caller</dt><dd>Dana Ruiz</dd><dt>Phone</dt><dd>555-0142</dd><dt>Address</dt><dd>14 Park Avenue</dd>'
      +'<dt>Job</dt><dd>'+esc(c[1])+'</dd><dt>When</dt><dd>'+esc(c[2])+'</dd></dl></div>';
  }
  f.addEventListener('submit',function(e){e.preventDefault();run()});
  run();
})();
</script>"""

s = dict(
    key="calltwin", name="CallTwin", name_html="CallTwin", mark="C", tagline="AI receptionist for local business",
    acc="#22d3ee", acc_ink="#0a0a0f", assets="site/",
    title="CallTwin | AI receptionist that answers your business line 24/7 | HSW365",
    og_title="CallTwin | Every call answered and written down",
    description="CallTwin answers your business line day and night, takes the caller's name, number and the job, and sends it to you. $500 setup, 14 days of service free, then $99 a month.",
    canonical="https://hsw365.github.io/calltwin/",
    util="CallTwin is a product of HSW365 Media LLC. English and Spanish callers.",
    util_links=[("By trade", "for/"), ("Articles", "blog/")],
    nav=[("What it does", "#does"), ("How it works", "#how"), ("Who it's for", "#who"), ("Pricing", "#pricing"), ("Questions", "#faq")],
    phone=dict(label="Sign up by phone", text=TEL_TXT, href=TEL),
    cta=("Get CallTwin", "signup.html"),
    foot_links=[("Get CallTwin", "signup.html"), ("Pricing", "#pricing"), ("By trade", "for/"), ("Articles", "blog/")],
    foot_contact=f'<li><a href="{TEL}">{TEL_TXT}</a></li><li><a href="mailto:book@hoodstar365.com">book@hoodstar365.com</a></li>',
    foot_about="An AI receptionist for the business line. It answers when you can't, takes the job and sends it to you.",
    legal="CallTwin answers calls with an AI voice. Appointment booking needs your calendar connected.",
    ld={"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "CallTwin", "applicationCategory": "BusinessApplication", "operatingSystem": "Web",
        "description": "AI receptionist that answers a business phone line 24/7, takes the job and sends it to the owner.",
        "offers": {"@type": "Offer", "price": "99", "priceCurrency": "USD"},
        "publisher": {"@type": "Organization", "name": "HSW365 Media LLC", "email": "hsw365media@gmail.com"}},
    scripts=demo_js,
)

s["hero"] = dict(
    status="Answering business lines 24 hours a day, in English and Spanish.",
    h1=["Every call.", "Answered.", "Written down."],
    lede="CallTwin is an AI receptionist for your business line. It picks up when you can't, gets the caller's name, number and the job, and sends it straight to you.",
    ctas=[btn("Get CallTwin", "signup.html", "acc"), btn(PHONE_SVG + "Sign up by phone", TEL, "line")],
    fine="$500 one-time setup. Your first 14 days of service are free, then it is $99 a month. Cancel the monthly anytime.",
    panel=panel,
)
s["plate"] = [
    ("24/7", "Picks up every call", "Nights, weekends, holidays and while you are on a job"),
    ("14 days free", "After the one-time setup", "Then $99 a month for the service"),
    ("2 languages", "English and Spanish", "Callers are answered in the one they speak"),
    ("No contract", "Cancel the monthly anytime", "Pay by card, Zelle or Cash App"),
]

does = tabs([
    dict(name="Answers", sub="A professional greeting on every call, day or night",
         shot=talk([("ai", "CALLTWIN", "Thanks for calling Ridge Electric. How can I help you?"),
                    ("me", "CALLER, 11:42 PM", "Are you open tomorrow? Half my kitchen has no power."),
                    ("ai", "CALLTWIN", "We open at 7 AM and can get someone out. Let me take your details so the owner calls you first thing.")]),
         body="<p>CallTwin greets the caller in your business name and answers the questions you approved: services, hours and the area you cover.</p><p>It is built from the business details you enter at sign-up, so it talks about your business and nobody else's.</p>",
         bullets=["Answers in your business name", "Knows your services, hours and service area", "English and Spanish callers", "No hold music and no voicemail"]),
    dict(name="Takes the job", sub="Name, number, address and what they need",
         shot=ticket("Job sent to the owner", "NEW", [("Caller", "Dana Ruiz"), ("Phone", "555-0142"), ("Address", "14 Park Avenue"), ("Job", "No power, half of kitchen"), ("When", "Tomorrow, first call")]),
         body="<p>Before the call ends CallTwin has the details you need to call back and quote: who it is, how to reach them, where the job is and what is wrong.</p><p>The job is texted to your phone and saved in your dashboard, with a button to call the customer back.</p>",
         bullets=["Caller name and callback number", "Job address", "What they need, in their words", "Text to your phone when the call ends"]),
    dict(name="Routes urgent calls", sub="Emergencies and sales go where you say",
         shot=ticket("Routing rules", "YOURS", [("Emergency", "Flag it and send it first"), ("New customer", "Take the job, send to owner"), ("Existing job", "Take a message"), ("After hours", "Same answer, same detail")]),
         body="<p>Not every call is the same. CallTwin sorts sales, service and emergency calls by the rules you set for the business, so the urgent ones reach you first.</p>",
         bullets=["Rules set for your business", "Emergency calls flagged", "After-hours calls handled the same way", "Appointment requests, when your calendar is connected"]),
    dict(name="Sends estimates", sub="Add-on: from the call to a signed proposal",
         shot=ticket("Estimate", "DRAFT", [("Job", "Replace 40 gal water heater"), ("Priced by", "The owner"), ("Sent as", "Proposal with online signature"), ("Deposit", "Collected online"), ("Follow-up", "Automatic")]),
         body="<p>With the AI Estimates add-on, each call becomes a draft estimate. You set the price, CallTwin sends the proposal, the customer signs online and pays the deposit.</p><p>The add-on is $49 a month after a 14 day free trial.</p>",
         bullets=["Draft estimate from each call", "You set every price", "Customer signs online", "Deposit collected, follow-up sent"]),
])

how = steps([
    (None, "Sign up", "Enter your business name, trade, hours and what you do. It takes about two minutes, online or on a phone call with us."),
    (None, "Get your CallTwin number", "Your receptionist is built from what you entered. Your number arrives by text and shows on your dashboard."),
    (None, "Forward your line", "Keep the business number you have. Forward it to your CallTwin number, for every call or only the ones you miss."),
    (None, "Jobs come to you", "Each call ends with a text to your phone and a record in your dashboard, with a button to call the customer back."),
])

TRADES = [("Plumbers", "for/plumbers.html"), ("HVAC", "for/hvac.html"), ("Electricians", "for/electricians.html"), ("Roofers", "for/roofers.html"),
          ("Contractors", "for/contractors.html"), ("Landscapers", "for/landscapers.html"), ("Cleaning services", "for/cleaning-services.html"),
          ("Auto repair", "for/auto-repair.html"), ("Salons", "for/salons.html"), ("Dental offices", "for/dental-offices.html"),
          ("Law firms", "for/law-firms.html"), ("Real estate", "for/real-estate.html")]
ARTICLES = [("What a missed call costs", "blog/missed-call-cost.html"),
            ("Forward calls and keep your number", "blog/plumber-call-forwarding-keep-your-number.html"),
            ("The first cold snap and no-heat calls", "blog/hvac-first-cold-snap-no-heat-calls.html"),
            ("Following up on a roofing estimate", "blog/roofing-estimate-follow-up.html"),
            ("Spanish-speaking callers", "blog/landscaper-spanish-speaking-callers.html"),
            ("Answering service, receptionist or AI", "blog/auto-repair-answering-service-vs-receptionist-vs-ai.html"),
            ("Faster quotes for a cleaning business", "blog/cleaning-business-faster-quotes.html"),
            ("Taking a deposit before a remodel", "blog/contractor-deposit-before-remodel.html")]
for _, h in TRADES + ARTICLES:
    assert os.path.exists(os.path.join(OUT, h)), h

who = (sec_head("Built for the business that can't get to the phone.", "If you are under a sink, on a roof or with a client when the phone rings, that caller dials the next business. CallTwin is set up for the trades and offices where one missed call is one lost job.")
       + '<div class="index" style="margin-top:0"><h3>By trade</h3><ul>' + "".join(f'<li><a href="{h}">{E(t)}</a></li>' for t, h in TRADES) + '</ul></div>'
       + '<div class="index"><h3>From the articles</h3><ul style="columns:2">' + "".join(f'<li><a href="{h}">{E(t)}</a></li>' for t, h in ARTICLES) + '</ul></div>')

pricing = (sec_head("One plan. Everything included.", "A one-time setup, two weeks of service free, then one monthly price. No contract.")
           + '<div class="plans one">'
           + plan("CallTwin Pro", "For every business", "$99", "a month<br>after 14 days free",
                  ["AI receptionist on your line 24 hours a day", "Takes the job: name, number, address and what they need", "Texts you each job when the call ends",
                   "Owner dashboard with every call and a callback button", "English and Spanish callers", "$500 one-time setup, paid at sign-up"],
                  btn("Get CallTwin", "signup.html", "acc"), main=True, small="Pay by card, Zelle or Cash App. Cancel the monthly anytime.")
           + plan("AI Estimates", "Add-on for CallTwin Pro", "$49", "a month<br>after 14 days free",
                  ["Draft estimate from each call", "You set the price", "Proposal the customer signs online", "Deposit collected and follow-up sent", "Turned on from your CallTwin dashboard"],
                  btn("Start with CallTwin Pro", "signup.html", "line"))
           + '</div>')

qa = [
    ("Can I keep my business number?", "Yes. You keep the number your customers already have and forward it to your CallTwin number. You can forward every call, or only the ones you don't answer."),
    ("What happens after I sign up?", "Your receptionist is built from the business details you enter. You get a CallTwin number by text and on your dashboard. Forward your business line to it and every call is answered."),
    ("What does it cost?", "Setup is a one-time $500, paid at sign-up. Your first 14 days of service are free, then it is $99 a month. Cancel the monthly anytime."),
    ("How do I pay?", "By card, Zelle or Cash App."),
    ("Can it book appointments?", "Yes, once your calendar or scheduling tool is connected and you have given it your booking rules. Until then it takes the request and sends it to you."),
    ("Can I sign up without filling in a form?", f'Yes. Call <a class="tlink" href="{TEL}">{TEL_TXT}</a> and we will sign you up on the call.'),
]

body = (hero(s)
        + sec("does", sec_head("One receptionist. Four jobs.", "CallTwin does the front desk work that gets dropped when you are busy: it answers, writes the job down, sorts what is urgent and gets the estimate out.") + does)
        + sec("how", sec_head("Live the day you sign up.", "There is nothing to install and no new number to hand out. You forward the line you already have.") + how, tint=True)
        + sec("who", who)
        + sec("pricing", pricing, tint=True)
        + sec("about", motto(s, "Turn negative into positive.", "The HSW365 motto. A missed call is the negative. A booked job is the positive.",
                             "Who is behind CallTwin", "CallTwin is built and run by HSW365 Media LLC in New Jersey.", ABOUT_PS,
                             [("Set up for you", "Built from your business details at sign-up"), ("You keep your number", "Forward the line you already have"),
                              ("Sign up by phone", "A person takes your details on a call"), ("No contract", "Cancel the monthly anytime"),
                              ("Three ways to pay", "Card, Zelle or Cash App")]))
        + sec("family", sec_head("More from HSW365.", "CallTwin is one of five products HSW365 Media builds and runs.") + family("calltwin"), tint=True)
        + sec("faq", faq("Questions owners ask.", "Straight answers before you sign up.", qa))
        + band("Give every caller a next step.", "Sign up online in about two minutes, or do it on a call with us.",
               [btn("Get CallTwin", "signup.html", "ink"), btn(PHONE_SVG + TEL_TXT, TEL, "inkline")]))

os.makedirs(f"{OUT}/site/fonts", exist_ok=True)
for f in os.listdir("fonts"):
    shutil.copy(f"fonts/{f}", f"{OUT}/site/fonts/{f}")
shutil.copy("hsw.css", f"{OUT}/site/hsw.css"); shutil.copy("hsw.js", f"{OUT}/site/hsw.js")
open(f"{OUT}/index.html", "w").write(page(s, body))
print("ok", len(page(s, body)))
