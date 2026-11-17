/*! HSW365 Owner Sign In tab. One script, every app.
 *  <script src="https://calltwin.onrender.com/owner-signin.js" defer></script>
 *  Adds an "Owner Sign In" tab (top right). Email code -> 12 hour owner session shared by every HSW365 app.
 *  Pages can read window.HSWOwner.isOwner() / .email() / .token() and listen for the "hswowner" event.
 */
(function () {
  if (window.HSWOwner) return;
  var API = "https://calltwin.onrender.com/api/owner";
  var KEY = "hsw365_owner";
  var APPS = [
    ["CallTwin admin", "https://hsw365.github.io/calltwin/admin.html"],
    ["Klipit", "https://klipit.onrender.com"],
    ["New Ark owner login", "https://www.ark-hvac.com/#owner"],
    ["HSW365 store", "https://hsw365.net"]
  ];

  function read() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); return s && s.exp > Date.now() ? s : null; } catch (e) { return null; } }
  function write(s) { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} }
  var api = {
    isOwner: function () { return !!read(); },
    email: function () { var s = read(); return s ? s.email : null; },
    token: function () { var s = read(); return s ? s.token : null; },
    signOut: function () { write(null); render(); fire(); }
  };
  window.HSWOwner = api;
  function fire() { try { window.dispatchEvent(new CustomEvent("hswowner", { detail: { owner: api.isOwner(), email: api.email() } })); } catch (e) {} }

  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server error. Try again." }; }); })
      .catch(function () { return { ok: false, error: "Can't reach the server. Try again." }; });
  }
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var css = "#hsw-own-tab{position:fixed;top:12px;right:12px;z-index:2147483000;display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(10,10,15,.82);color:#fff;font:700 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.02em;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 18px rgba(0,0,0,.35)}" +
    "#hsw-own-tab:hover{border-color:#22d3ee}#hsw-own-tab.in{border-color:#34d399}" +
    "#hsw-own-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(5,6,10,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:16px}" +
    "#hsw-own-ov.open{display:flex}" +
    "#hsw-own-box{width:100%;max-width:400px;background:#12151d;color:#eef1f6;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:24px;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.55);position:relative}" +
    "#hsw-own-box h3{margin:0 0 4px;font-size:21px}#hsw-own-box p{margin:0 0 16px;color:#8b95a7;font-size:14px}" +
    "#hsw-own-box input{width:100%;height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:#000;color:#fff;padding:0 14px;font:inherit;margin-bottom:10px;box-sizing:border-box}" +
    "#hsw-own-box input:focus{outline:2px solid #22d3ee;outline-offset:1px}" +
    "#hsw-own-box .b{width:100%;height:46px;border-radius:11px;border:0;background:linear-gradient(100deg,#22d3ee,#a855f7);color:#050608;font:800 15px system-ui,sans-serif;cursor:pointer}" +
    "#hsw-own-box .b[disabled]{opacity:.55;cursor:wait}#hsw-own-box .g{background:#1a1f2b;color:#eef1f6;border:1px solid rgba(255,255,255,.12);margin-top:8px}" +
    "#hsw-own-box .m{min-height:20px;font-size:13px;margin:2px 0 10px}#hsw-own-box .m.e{color:#f87171}#hsw-own-box .m.k{color:#34d399}" +
    "#hsw-own-box .x{position:absolute;top:10px;right:12px;background:none;border:0;color:#8b95a7;font-size:26px;cursor:pointer;line-height:1}" +
    "#hsw-own-box a.l{display:block;padding:12px 14px;margin-bottom:8px;border-radius:11px;background:#1a1f2b;border:1px solid rgba(255,255,255,.1);color:#eef1f6;text-decoration:none;font-weight:700}" +
    "#hsw-own-box a.l:hover{border-color:#22d3ee}";

  var tab, ov, box, step = "email", pending = "";
  var LOCK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function open() { ov.classList.add("open"); render(); }
  function close() { ov.classList.remove("open"); }
  function msg(t, ok) { var m = box.querySelector(".m"); if (m) { m.textContent = t || ""; m.className = "m " + (ok ? "k" : "e"); } }

  function render() {
    if (!tab) return;
    var s = read();
    tab.className = s ? "in" : ""; tab.id = "hsw-own-tab";
    tab.innerHTML = LOCK + (s ? "Owner" : "Owner Sign In");
    if (!ov.classList.contains("open") && !box.innerHTML) box.innerHTML = "";
    if (s) {
      box.innerHTML = '<button class="x" aria-label="Close">&times;</button><h3>Owner dashboard</h3><p>Signed in as ' + esc(s.email) + '</p>' +
        APPS.map(function (a) { return '<a class="l" href="' + a[1] + '" target="_blank" rel="noopener">' + esc(a[0]) + '</a>'; }).join("") +
        '<button class="b g" id="hsw-out">Sign out</button>';
      box.querySelector("#hsw-out").onclick = api.signOut;
    } else if (step === "code") {
      box.innerHTML = '<button class="x" aria-label="Close">&times;</button><h3>Enter your code</h3><p>We emailed a 6 digit code to ' + esc(pending) + '.</p>' +
        '<input id="hsw-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"><div class="m"></div>' +
        '<button class="b" id="hsw-go">Sign in</button><button class="b g" id="hsw-back">Use a different email</button>';
      var go = box.querySelector("#hsw-go"), inp = box.querySelector("#hsw-code");
      var submit = function () {
        go.disabled = true; msg("");
        post("/verify", { email: pending, code: inp.value }).then(function (r) {
          go.disabled = false;
          if (r.ok) { write({ email: r.email, token: r.token, exp: Date.now() + 12 * 3600e3 }); step = "email"; render(); fire(); }
          else msg(r.error || "That code isn't right.");
        });
      };
      go.onclick = submit; inp.onkeydown = function (e) { if (e.key === "Enter") submit(); };
      box.querySelector("#hsw-back").onclick = function () { step = "email"; render(); };
      setTimeout(function () { inp.focus(); }, 50);
    } else {
      box.innerHTML = '<button class="x" aria-label="Close">&times;</button><h3>Owner Sign In</h3><p>Enter your owner email. We send a code.</p>' +
        '<input id="hsw-em" type="email" autocomplete="email" placeholder="you@email.com"><div class="m"></div><button class="b" id="hsw-send">Email me a code</button>';
      var send = box.querySelector("#hsw-send"), em = box.querySelector("#hsw-em");
      var ask = function () {
        var v = em.value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(v)) return msg("Enter a valid email.");
        send.disabled = true; msg("");
        post("/code", { email: v }).then(function (r) {
          send.disabled = false;
          if (r.ok) { pending = v; step = "code"; render(); } else msg(r.error || "Try again.");
        });
      };
      send.onclick = ask; em.onkeydown = function (e) { if (e.key === "Enter") ask(); };
      setTimeout(function () { em.focus(); }, 50);
    }
    var x = box.querySelector(".x"); if (x) x.onclick = close;
  }

  function init() {
    if (document.getElementById("hsw-own-tab")) return;
    var st = el("style", {}, css); document.head.appendChild(st);
    tab = el("button", { id: "hsw-own-tab", type: "button", "aria-label": "Owner sign in" });
    ov = el("div", { id: "hsw-own-ov", role: "dialog", "aria-modal": "true" });
    box = el("div", { id: "hsw-own-box" });
    ov.appendChild(box); document.body.appendChild(ov); document.body.appendChild(tab);
    tab.onclick = open;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    var hooks = document.querySelectorAll("[data-owner-signin]");
    for (var i = 0; i < hooks.length; i++) hooks[i].addEventListener("click", function (e) { e.preventDefault(); open(); });
    if (location.hash === "#owner-signin") open();
    render(); fire();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
