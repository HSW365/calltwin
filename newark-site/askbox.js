/* New Ark "Ask Marcus" chat box.
 * One script for every page: adds an "ask a question" button to each section of the site and a
 * chat pop-up that answers in text through the New Ark website-chat agent (ElevenLabs, text only).
 * No dependencies. The chat engine is only downloaded when a visitor sends their first question.
 */
(function () {
  "use strict";
  if (window.__nqLoaded) return; window.__nqLoaded = true;

  var AGENT_ID = "agent_5001m4cdabg0etg98t3v928qp45m";
  var SDK = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.7/+esm";
  var PHONE = "908-454-4043", TEL = "tel:+19084544043";

  // Each section of the home page: where the button goes, what it says, and starter questions.
  var SECTIONS = [
    { sel: ".hero", key: "home", label: "New Ark", ask: "", prompt: "the top of the home page",
      hello: "Hi, I'm Marcus at the New Ark front desk. Ask me anything about our services, estimates or paying a bill.",
      chips: ["What services do you offer?", "Do you handle emergencies?", "What areas do you serve?"] },
    { sel: "#services", key: "services", label: "Our services", ask: "Question about a service?", prompt: "the Services section (plumbing, heating and air conditioning, geothermal, fire protection)",
      hello: "Have a question about plumbing, heating and cooling, geothermal or fire sprinklers? Ask away.",
      chips: ["Do you work on water heaters?", "Do you install geothermal systems?", "Do you do commercial jobs?"] },
    { sel: "#about", key: "about", label: "About New Ark", ask: "Want to know more about us?", prompt: "the About section (company background, licenses, certifications)",
      hello: "Want to know more about New Ark, our licenses or how long we've been doing this? Ask me.",
      chips: ["Are you licensed and insured?", "How long have you been in business?", "Do you do public sector work?"] },
    { sel: "#projects", key: "projects", label: "Our work", ask: "Question about our past work?", prompt: "the Our Work section (past projects and project experience)",
      hello: "Curious whether we've done a project like yours? Tell me what you're planning.",
      chips: ["Have you worked on restaurants?", "Do you handle large buildings?", "Can you design and build a system?"] },
    { sel: "#answering", key: "answering", label: "Calling New Ark", ask: "Question about calling us?", prompt: "the section about how New Ark answers every call, 24/7", dark: true,
      hello: "Wondering what happens when you call, day or night? I can walk you through it.",
      chips: ["Who answers at night?", "How fast will someone call me back?", "Do you speak Spanish?"] },
    { sel: "#estimate", key: "estimate", label: "Free estimates", ask: "Question about estimates?", prompt: "the Get a Free Estimate section (online estimate request form)",
      hello: "Have a question before you send an estimate request? I can explain how it works.",
      chips: ["Is the estimate really free?", "What photos should I send?", "How soon will I get my estimate?"] },
    { sel: "#book", key: "book", label: "Contact and booking", ask: "Not sure what to put? Ask first.", prompt: "the Contact section (request a visit form, phone, office address, hours)",
      hello: "Need help booking a visit, or not sure what to choose on the form? Ask me.",
      chips: ["What are your hours?", "Can someone come out today?", "Where is your office?"] },
    { sel: "#pay", key: "pay", label: "Paying a bill", ask: "Question about paying?", prompt: "the Pay a Bill section (Zelle, Cash App or card, and the payment notice form)",
      hello: "Have a question or concern about paying your bill? I can explain each way to pay.",
      chips: ["How do I pay with Zelle?", "I paid. What do I do now?", "I have a question about my invoice"] },
    { sel: "#faq", key: "faq", label: "Areas and questions", ask: "Don't see your town or question?", prompt: "the Areas Served and common questions section",
      hello: "Don't see your town or your question on the list? Ask me directly.",
      chips: ["Do you come to my town?", "Do you charge for estimates?", "Are you open on weekends?"] }
  ];

  var css = [
    ".nq-ask{display:inline-flex;align-items:center;gap:10px;margin-top:22px;height:46px;padding:0 18px 0 7px;border-radius:999px;border:1px solid #d9e0e8;background:#fff;color:#0b2a4a;font:600 15px/1 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif;cursor:pointer;transition:border-color .18s,box-shadow .18s,transform .18s;-webkit-tap-highlight-color:transparent;text-align:left}",
    ".nq-ask:hover{border-color:#0b2a4a;box-shadow:0 10px 24px -14px rgba(11,42,74,.55)}",
    ".nq-ask:focus-visible,.nq-fab:focus-visible,.nq-x:focus-visible,.nq-send:focus-visible,.nq-chip:focus-visible{outline:3px solid #1c5fb8;outline-offset:2px}",
    ".nq-ask b{font-weight:800;color:#1c5fb8;white-space:nowrap}",
    ".nq-ask.nq-dark{background:transparent;border-color:rgba(255,255,255,.34);color:#fff}",
    ".nq-ask.nq-dark:hover{border-color:#fff;box-shadow:none}.nq-ask.nq-dark b{color:#fff;text-decoration:underline;text-underline-offset:3px}",
    ".nq-av{flex:none;width:32px;height:32px;border-radius:50%;background:#0b2a4a;color:#fff;display:grid;place-items:center;font:800 14px/1 'Libre Franklin',system-ui,sans-serif;position:relative}",
    ".nq-av:after{content:'';position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:#2fae6a;border:2px solid #fff}",
    ".nq-dark .nq-av{background:#fff;color:#0b2a4a}.nq-dark .nq-av:after{border-color:#0b2a4a}",
    ".nq-row{display:block}",
    ".nq-fab{position:fixed;right:20px;bottom:20px;z-index:60;display:inline-flex;align-items:center;gap:10px;height:56px;padding:0 22px 0 18px;border:0;border-radius:999px;background:#0b2a4a;color:#fff;font:700 16px/1 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif;cursor:pointer;box-shadow:0 18px 40px -16px rgba(7,29,52,.75),0 2px 6px rgba(7,29,52,.2),0 0 0 1.5px rgba(255,255,255,.28);transition:transform .2s cubic-bezier(.22,.8,.2,1),background .18s,opacity .18s}",
    ".nq-fab:hover{background:#071d34;transform:translateY(-2px)}",
    ".nq-fab svg{width:22px;height:22px;flex:none}",
    ".nq-open .nq-fab{opacity:0;pointer-events:none;transform:scale(.9)}",
    ".nq-panel{position:fixed;right:20px;bottom:20px;z-index:70;width:392px;max-width:calc(100vw - 24px);height:min(600px,calc(100vh - 40px));height:min(600px,calc(100dvh - 40px));display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 40px 90px -30px rgba(7,29,52,.6),0 0 0 1px rgba(11,42,74,.1);opacity:0;visibility:hidden;transform:translateY(14px) scale(.985);transform-origin:100% 100%;transition:opacity .2s,transform .24s cubic-bezier(.22,.8,.2,1),visibility 0s .24s;font:16px/1.5 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif;color:#16212e}",
    ".nq-open .nq-panel{opacity:1;visibility:visible;transform:none;transition:opacity .2s,transform .24s cubic-bezier(.22,.8,.2,1)}",
    ".nq-head{flex:none;display:flex;align-items:center;gap:12px;padding:16px 14px 16px 18px;background:#0b2a4a;color:#fff}",
    ".nq-head .nq-av{width:42px;height:42px;font-size:18px;background:#fff;color:#0b2a4a}.nq-head .nq-av:after{width:12px;height:12px;border-color:#0b2a4a}",
    ".nq-who{flex:1;min-width:0}.nq-who b{display:block;font-size:17px;font-weight:800;letter-spacing:-.01em;line-height:1.2}.nq-who span{display:block;font-size:13.5px;color:rgba(255,255,255,.74);line-height:1.3}",
    ".nq-x{flex:none;width:40px;height:40px;border:0;border-radius:50%;background:transparent;color:#fff;cursor:pointer;display:grid;place-items:center;transition:background .15s}.nq-x:hover{background:rgba(255,255,255,.14)}.nq-x svg{width:20px;height:20px}",
    ".nq-topic{flex:none;padding:9px 18px;background:#f3f6fa;border-bottom:1px solid #d9e0e8;font-size:13px;color:#5f6d7e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nq-topic b{color:#0b2a4a;font-weight:700}",
    ".nq-log{flex:1;min-height:0;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px;background:#fff;scrollbar-width:thin;overscroll-behavior:contain}",
    ".nq-m{max-width:86%;padding:10px 14px;border-radius:14px;font-size:15.5px;line-height:1.48;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".nq-a{align-self:flex-start;background:#f3f6fa;color:#16212e;border-bottom-left-radius:4px}",
    ".nq-u{align-self:flex-end;background:#0b2a4a;color:#fff;border-bottom-right-radius:4px}",
    ".nq-s{align-self:stretch;max-width:100%;padding:10px 14px;border-radius:8px;background:#fff6f6;border:1px solid #f0c9cb;color:#7a1216;font-size:14.5px}.nq-s a{color:#c4161c;font-weight:800;white-space:nowrap}",
    ".nq-dots{align-self:flex-start;display:inline-flex;gap:5px;padding:14px 16px;border-radius:14px;border-bottom-left-radius:4px;background:#f3f6fa}",
    ".nq-dots i{width:7px;height:7px;border-radius:50%;background:#5f6d7e;animation:nqb 1.1s infinite ease-in-out}.nq-dots i:nth-child(2){animation-delay:.15s}.nq-dots i:nth-child(3){animation-delay:.3s}",
    "@keyframes nqb{0%,70%,100%{opacity:.3;transform:translateY(0)}35%{opacity:1;transform:translateY(-3px)}}",
    ".nq-chips{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:4px}",
    ".nq-chip{border:1px solid #d9e0e8;background:#fff;color:#0b2a4a;border-radius:999px;padding:9px 15px;font:600 14.5px/1.25 'Libre Franklin',system-ui,sans-serif;cursor:pointer;text-align:left;transition:border-color .15s,background .15s}.nq-chip:hover{border-color:#0b2a4a;background:#f3f6fa}",
    ".nq-form{flex:none;display:flex;align-items:flex-end;gap:8px;padding:12px 12px 10px 14px;border-top:1px solid #d9e0e8;background:#fff}",
    ".nq-in{flex:1;min-width:0;resize:none;border:1.5px solid #d9e0e8;border-radius:12px;padding:11px 14px;font:16px/1.4 'Libre Franklin',system-ui,-apple-system,'Segoe UI',sans-serif;color:#16212e;background:#fff;max-height:120px;outline:0;transition:border-color .15s}.nq-in:focus{border-color:#0b2a4a}.nq-in::placeholder{color:#8a96a5}",
    ".nq-send{flex:none;width:46px;height:46px;border:0;border-radius:12px;background:#c4161c;color:#fff;cursor:pointer;display:grid;place-items:center;transition:background .15s,opacity .15s}.nq-send:hover{background:#a81217}.nq-send:disabled{opacity:.4;cursor:default}.nq-send svg{width:20px;height:20px}",
    ".nq-foot{flex:none;padding:0 16px 12px;font-size:12.5px;line-height:1.4;color:#5f6d7e;background:#fff}.nq-foot a{color:#0b2a4a;font-weight:700;white-space:nowrap}",
    "@media (max-width:760px){.nq-fab{right:14px;bottom:84px;height:52px;padding:0 18px 0 15px;font-size:15px}.nq-panel{right:0;left:0;bottom:0;width:100%;max-width:100%;height:min(86vh,640px);height:min(86dvh,640px);border-radius:16px 16px 0 0;transform:translateY(24px);transform-origin:50% 100%}.nq-ask{height:auto;min-height:46px;padding:7px 16px 7px 7px;line-height:1.3}}",
    "@media (prefers-reduced-motion:reduce){.nq-panel,.nq-fab,.nq-ask{transition:none}.nq-dots i{animation:none;opacity:.6}}"
  ].join("\n");

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(path) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>"; }
  var ICON_CHAT = svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z"/>');
  var ICON_X = svg('<path d="M6 6l12 12M18 6 6 18"/>');
  var ICON_SEND = svg('<path d="M5 12h13M12 5l7 7-7 7"/>');

  function init() {
    var style = el("style"); style.textContent = css; document.head.appendChild(style);

    // Which sections exist on this page. Service and town pages get one general context.
    var here = SECTIONS.filter(function (s) { s.node = document.querySelector(s.sel); return !!s.node; });
    var h1 = document.querySelector("h1");
    var general = here.filter(function (s) { return s.key === "home"; })[0] || {
      key: "page", label: ((document.querySelector(".tag") || {}).textContent || (h1 && h1.textContent) || "New Ark").trim().slice(0, 48),
      prompt: "the page titled: " + ((h1 && h1.textContent.trim()) || document.title),
      hello: "Hi, I'm Marcus at the New Ark front desk. Have a question about this service? Ask me anything.",
      chips: ["Do you offer free estimates?", "Do you handle emergencies?", "Do you come to my town?"]
    };
    var ctx = general;

    // ---- pop-up ----
    var root = el("div", "nq-root");
    var fab = el("button", "nq-fab"); fab.type = "button"; fab.innerHTML = ICON_CHAT + "<span>Ask a question</span>";
    fab.setAttribute("aria-haspopup", "dialog");
    var panel = el("div", "nq-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Ask the New Ark front desk a question"); panel.setAttribute("aria-hidden", "true");
    var head = el("div", "nq-head");
    var av = el("div", "nq-av", "M"); av.setAttribute("aria-hidden", "true");
    var who = el("div", "nq-who"); who.appendChild(el("b", null, "Marcus")); who.appendChild(el("span", null, "New Ark front desk · AI assistant"));
    var x = el("button", "nq-x"); x.type = "button"; x.innerHTML = ICON_X; x.setAttribute("aria-label", "Close chat");
    head.appendChild(av); head.appendChild(who); head.appendChild(x);
    var topic = el("div", "nq-topic");
    var log = el("div", "nq-log"); log.setAttribute("aria-live", "polite");
    var form = el("form", "nq-form");
    var input = el("textarea", "nq-in"); input.rows = 1; input.placeholder = "Type your question"; input.setAttribute("aria-label", "Type your question"); input.maxLength = 600;
    var send = el("button", "nq-send"); send.type = "submit"; send.innerHTML = ICON_SEND; send.setAttribute("aria-label", "Send"); send.disabled = true;
    form.appendChild(input); form.appendChild(send);
    var foot = el("div", "nq-foot"); foot.appendChild(document.createTextNode("Marcus is an AI assistant. Emergency or rather talk? Call "));
    var fa = el("a", null, PHONE); fa.href = TEL; foot.appendChild(fa); foot.appendChild(document.createTextNode(", answered 24/7."));
    panel.appendChild(head); panel.appendChild(topic); panel.appendChild(log); panel.appendChild(form); panel.appendChild(foot);
    root.appendChild(fab); root.appendChild(panel); document.body.appendChild(root);

    // ---- chat state ----
    var convo = null, connecting = null, history = [], waiting = false, waitTimer = 0, dots = null, chipsBox = null, greeted = {}, lastFocus = null;

    function scroll() { log.scrollTop = log.scrollHeight; }
    function bubble(text, kind) { var p = el("div", "nq-m nq-" + kind, text); log.insertBefore(p, dots && dots.parentNode === log ? dots : null); scroll(); return p; }
    function setWaiting(on) {
      waiting = on; clearTimeout(waitTimer);
      if (on) {
        if (!dots) { dots = el("div", "nq-dots"); dots.setAttribute("aria-label", "Marcus is typing"); dots.appendChild(el("i")); dots.appendChild(el("i")); dots.appendChild(el("i")); }
        log.appendChild(dots); scroll();
        waitTimer = setTimeout(function () { if (waiting) fail(); }, 30000);
      } else if (dots && dots.parentNode) dots.parentNode.removeChild(dots);
      send.disabled = on || !input.value.trim();
    }
    function fail() {
      setWaiting(false);
      var p = el("div", "nq-m nq-s"); p.appendChild(document.createTextNode("I couldn't get an answer through just now. Please try again, or call "));
      var a = el("a", null, PHONE); a.href = TEL; p.appendChild(a); p.appendChild(document.createTextNode(". We answer 24/7."));
      log.appendChild(p); scroll();
    }
    function dropChips() { if (chipsBox && chipsBox.parentNode) chipsBox.parentNode.removeChild(chipsBox); chipsBox = null; }
    function greet(c) {
      topic.textContent = ""; topic.appendChild(document.createTextNode("Asking about: ")); topic.appendChild(el("b", null, c.label));
      if (greeted[c.key]) return; greeted[c.key] = true;
      dropChips();
      bubble(c.hello, "a");
      chipsBox = el("div", "nq-chips");
      c.chips.forEach(function (q) { var b = el("button", "nq-chip", q); b.type = "button"; b.addEventListener("click", function () { ask(q); }); chipsBox.appendChild(b); });
      log.appendChild(chipsBox); scroll();
    }

    function onMessage(m) {
      if (!m || !m.message || m.source !== "ai") return;
      setWaiting(false); history.push("Marcus: " + m.message); bubble(m.message, "a");
    }
    function connect() {
      if (convo) return Promise.resolve(convo);
      if (connecting) return connecting;
      connecting = import(SDK).then(function (mod) {
        return mod.Conversation.startSession({
          agentId: AGENT_ID, connectionType: "websocket", textOnly: true,
          overrides: { conversation: { textOnly: true } },
          dynamicVariables: { section: ctx.prompt },
          onMessage: onMessage,
          onDisconnect: function () { convo = null; if (waiting) fail(); },
          onError: function (e) { console.error("[ask marcus]", e); if (waiting) fail(); }
        });
      }).then(function (c) {
        convo = c; connecting = null;
        // A dropped chat reconnects quietly; hand the agent what was already said.
        if (history.length > 1) { try { c.sendContextualUpdate("Earlier in this same website chat:\n" + history.slice(-12, -1).join("\n")); } catch (e) {} }
        return c;
      }, function (e) { connecting = null; throw e; });
      return connecting;
    }
    function ask(text) {
      text = String(text || "").trim().slice(0, 600);
      if (!text || waiting) return;
      dropChips(); bubble(text, "u"); history.push("Visitor: " + text);
      input.value = ""; grow(); setWaiting(true);
      connect().then(function (c) { c.sendUserMessage(text); }).catch(function (e) { console.error("[ask marcus]", e); fail(); });
    }
    function grow() { input.style.height = "auto"; input.style.height = Math.min(120, input.scrollHeight + 2) + "px"; send.disabled = waiting || !input.value.trim(); }

    function open(c) {
      var changed = c && c.key !== ctx.key;
      if (c) ctx = c;
      if (!root.classList.contains("nq-open")) { lastFocus = document.activeElement; root.classList.add("nq-open"); panel.setAttribute("aria-hidden", "false"); }
      greet(ctx);
      if (changed && convo) { try { convo.sendContextualUpdate("The visitor is now asking from this part of the site: " + ctx.prompt); } catch (e) {} }
      setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 60);
    }
    function close() {
      root.classList.remove("nq-open"); panel.setAttribute("aria-hidden", "true");
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    }

    fab.addEventListener("click", function () { open(nearest() || general); });
    x.addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("nq-open")) close(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
    input.addEventListener("input", grow);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
    window.addEventListener("pagehide", function () { if (convo) { try { convo.endSession(); } catch (e) {} } });

    // The floating button opens on whichever section the visitor is looking at.
    function nearest() {
      var mid = window.innerHeight * 0.45, best = null;
      here.forEach(function (s) { var r = s.node.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) best = s; });
      return best;
    }

    // ---- an "ask" button inside each section ----
    here.forEach(function (s) {
      if (!s.ask) return;
      var b = el("button", "nq-ask" + (s.dark ? " nq-dark" : "")); b.type = "button";
      var a = el("span", "nq-av", "M"); a.setAttribute("aria-hidden", "true");
      var t = el("span"); t.appendChild(document.createTextNode(s.ask + " ")); t.appendChild(el("b", null, "Ask Marcus"));
      b.appendChild(a); b.appendChild(t);
      b.addEventListener("click", function () { open(s); });
      var row = el("div", "nq-row"); row.appendChild(b);
      var lede = s.node.querySelector(".lede"), h2 = s.node.querySelector("h2"), wrap = s.node.querySelector(".wrap");
      var anchor = lede || h2;
      if (s.key === "about" || !anchor) { var col = wrap && wrap.lastElementChild; (col || s.node).appendChild(row); }
      else if (s.key === "faq") { var last = wrap && wrap.lastElementChild; (last || s.node).appendChild(row); }
      else anchor.insertAdjacentElement("afterend", row);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
