"""Builds newark/index.html from _src/top.html plus the working forms, owner portal and script
carried over from newark-preview.html, and restyles the service/area/blog pages to match."""
import re, pathlib, glob

root = pathlib.Path(__file__).resolve().parents[2]
old = (root / "newark-preview.html").read_text().split("\n")
L = lambda a, b: "\n".join(old[a - 1:b])

css = L(181, 264) + "\n" + L(283, 347)
est_form, lead_form, pay_form = L(550, 572), L(589, 614), L(632, 645)
portal, script = L(699, 831), L(833, 1101)

plan_new = '''<div class="pane" data-dpane="plan">
          <div class="plan">
            <div><b>Website, phone line and estimates</b><span class="amt">$1,500</span><p>Your New Ark website with the CallTwin front desk and AI Estimates built in.</p></div>
            <div><b>CallTwin 24/7 front desk</b><span class="amt">$99 a month</span><p>Marcus answers every call and texts you each job.</p></div>
            <div><b>AI Estimates</b><span class="amt">Included</span><p>Estimate requests, proposals and online signatures. No separate monthly fee.</p></div>
          </div>
          <div class="ledger">
            <div><span>Package price</span><span>$1,500</span></div>
            <div><span>Paid so far</span><span>$500</span></div>
            <div><span>Balance, paid $500 a month</span><span>$1,000</span></div>
          </div>
          <p class="small" style="margin-top:14px">Pay HSW365 Media by Zelle to (856) 796-8081 or Cash App $hsw365. Questions about your plan: text (856) 796-8081.</p>
        </div>'''
a = portal.index('<div class="pane" data-dpane="plan">')
b = portal.index("</div>\n      </div>\n    </div>\n  </div>", a)  # end of plan pane -> dash -> p-body -> portal
b = portal.index('<p class="small" style="margin-top:14px">Questions about your plan', a)
b = portal.index("</div>", b) + len("</div>")
portal = portal[:a] + plan_new + portal[b:]
portal = portal.replace("<b>AI Estimates is on for New Ark, free.</b>", "<b>AI Estimates is included in your package.</b>")
assert "mk water" not in portal and "$1,500" in portal

extra_js = r'''
// primary nav: mark the section being read
const navLinks = $$(".nav-links a"), navSecs = navLinks.map((a) => $(a.getAttribute("href")));
const spy = () => {
  const y = scrollY + 150; let cur = -1;
  navSecs.forEach((s, i) => { if (s && s.getBoundingClientRect().top + scrollY <= y) cur = i; });
  navLinks.forEach((a, i) => a.classList.toggle("active", i === cur));
};
addEventListener("scroll", spy, { passive: true }); addEventListener("resize", spy); spy();
document.addEventListener("click", (e) => { if (mnav.classList.contains("open") && !e.target.closest("#nav")) { mnav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", false); } });
'''
script = script.replace("</script>", extra_js + "</script>")
script = script.replace('menuBtn.setAttribute("aria-expanded", o); });', 'menuBtn.setAttribute("aria-expanded", o); menuBtn.setAttribute("aria-label", o ? "Close menu" : "Open menu"); });')

top = (root / "newark/_src/top.html").read_text()
for k, v in {"/*OLD_COMPONENTS*/": css, "<!--EST_FORM-->": est_form, "<!--LEAD_FORM-->": lead_form,
             "<!--PAY_FORM-->": pay_form, "<!--PORTAL-->": portal, "<!--SCRIPT-->": script}.items():
    assert k in top, k
    top = top.replace(k, v)
(root / "newark/index.html").write_text(top)
print("index.html", len(top))

# ---- service, area and blog pages: same brand, same links ----
ROOT_NEW = ':root{--steel:#f3f6fa;--white:#fff;--ink:#0b2a4a;--ink2:#3d4b5c;--mut:#5f6d7e;--rule:#d9e0e8;--g:#0b2a4a;--y:#0b2a4a;--b:#1c5fb8;--r:#c4161c}'
MARK = '<svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="6" fill="#0b2a4a"/><path d="M11 30V19a9 9 0 0 1 18 0v11" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="square"/></svg>'
FONT = '<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700;800;900&display=swap" rel="stylesheet">'
pages = [p for p in glob.glob(str(root / "newark/*.html")) + glob.glob(str(root / "newark/blog/*.html")) if not p.endswith("newark/index.html")]
for p in pages:
    s = pathlib.Path(p).read_text()
    up = "../" if "/blog/" in p else "./"
    s = re.sub(r":root\{[^}]*\}", ROOT_NEW, s, count=1)
    s = re.sub(r'<link href="https://fonts\.googleapis\.com/css2\?family=Archivo[^>]*>', FONT, s)
    s = s.replace('"IBM Plex Sans"', '"Libre Franklin"').replace("Archivo,", '"Libre Franklin",').replace("Archivo ", '"Libre Franklin" ')
    s = re.sub(r"font-stretch:\d+%;?", "", s)
    s = s.replace("html,body{background:var(--steel)}", "html,body{background:#fff}")
    s = re.sub(r'<span class="bars">.*?</span>', MARK, s, flags=re.S)
    s = re.sub(r'(<span class="tag" style="background:)#[0-9A-Fa-f]{6}', r"\g<1>#0b2a4a", s)
    s = s.replace(".tag{display:inline-block;padding:4px 10px;border-radius:4px;color:#fff;font:700 12px \"Libre Franklin\";letter-spacing:.08em;text-transform:uppercase",
                  ".tag{display:inline-block;padding:5px 11px;border-radius:4px;color:#fff;font:700 13px \"Libre Franklin\"")
    s = s.replace("border-radius:8px", "border-radius:4px").replace("border-radius:10px", "border-radius:6px").replace("border-radius:12px", "border-radius:6px")
    s = s.replace("rgba(22,25,28,.96)", "rgba(7,29,52,.97)")
    # navigation between pages works on any host
    s = s.replace("https://hsw365.github.io/calltwin/newark-preview.html#", up + "#")
    s = re.sub(r'(<a [^>]*?)href="https://hsw365\.github\.io/calltwin/newark/([^"]*)"', lambda m: f'{m.group(1)}href="{up}{m.group(2)}"', s)
    pathlib.Path(p).write_text(s)
print("restyled", len(pages), "pages")
