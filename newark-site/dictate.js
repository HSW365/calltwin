/*
 * New Ark owner pages: talk instead of type.
 * Puts a big red "Talk" button on every writing box (job notes, scope of work, line descriptions, terms,
 * email message, inspection notes). Tap it, say it, tap again — the words are typed into the box.
 * Uses the phone's own speech-to-text (live, as he talks). If the phone can't, it records a short clip and
 * the server types it (same transcriber the photo/voice estimate uses). Never fills a number, price or PIN field.
 */
(function () {
  "use strict";
  var API = "https://calltwin.onrender.com/api/newark/proposal";
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var CAN_REC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  if (!SR && !CAN_REC) return;

  var TEXT_INPUTS = { jobsite: 1, title: 1, cCompany: 1, cContact: 1, cAddress: 1, cCity: 1 };
  var css = document.createElement("style");
  css.textContent =
    ".dm-wrap{position:relative;display:block;width:100%}" +
    ".dm-wrap>textarea,.dm-wrap>input{padding-right:64px}" +
    ".dm-btn{position:absolute;top:5px;right:5px;width:46px;height:46px;border-radius:50%;border:0;background:#0b2a4a;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.25);padding:0;z-index:2;-webkit-tap-highlight-color:transparent}" +
    ".dm-btn svg{width:24px;height:24px;fill:currentColor;pointer-events:none}" +
    ".dm-btn.on{background:#c4161c;animation:dmPulse 1.1s ease-in-out infinite}" +
    ".dm-btn.wait{background:#6b7480;animation:none}" +
    "@keyframes dmPulse{0%,100%{box-shadow:0 0 0 0 rgba(196,22,28,.55)}50%{box-shadow:0 0 0 10px rgba(196,22,28,0)}}" +
    ".dm-tip{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:92vw;background:#111;color:#fff;font:600 18px/1.3 system-ui,sans-serif;padding:14px 20px;border-radius:12px;z-index:99999;box-shadow:0 6px 24px rgba(0,0,0,.35);text-align:center}" +
    ".dm-tip.err{background:#8a1015}" +
    ".dm-tip button{margin-left:14px;background:#fff;color:#111;border:0;border-radius:8px;padding:8px 14px;font:700 16px system-ui,sans-serif;cursor:pointer}";
  document.head.appendChild(css);

  var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
  var STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  var tip = null, tipTimer = null;
  function say(msg, err, stopFn, hold) {
    if (!tip) { tip = document.createElement("div"); tip.className = "dm-tip"; tip.setAttribute("role", "status"); document.body.appendChild(tip); }
    tip.className = "dm-tip" + (err ? " err" : "");
    tip.textContent = msg;
    if (stopFn) { var b = document.createElement("button"); b.type = "button"; b.textContent = "Done"; b.onclick = stopFn; tip.appendChild(b); }
    tip.style.display = "block";
    clearTimeout(tipTimer);
    if (!hold) tipTimer = setTimeout(hide, err ? 6000 : 2500);
  }
  function hide() { if (tip) tip.style.display = "none"; }

  var active = null; // { stop() }

  function setValue(el, v) {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function join(base, add) {
    add = (add || "").trim();
    if (!add) return base;
    if (!base) return add;
    return /\s$/.test(base) ? base + add : base + " " + add;
  }
  // Light clean-up so spoken text reads like typing: capital letter at the start of a sentence.
  function tidy(base, add) {
    add = (add || "").replace(/\s+/g, " ").trim();
    if (!add) return "";
    var atStart = !base.trim() || /[.!?]\s*$/.test(base.trim());
    return atStart ? add.charAt(0).toUpperCase() + add.slice(1) : add;
  }

  // ---- live dictation (phone / Chrome / Safari) ----
  function liveDictate(el, btn, done, fallback) {
    var rec = new SR(), base = el.value, finalText = "", wantStop = false, gotAny = false, errored = false;
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var interim = "";
      finalText = "";
      for (var i = 0; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " "; else interim += r[0].transcript;
      }
      var spoken = (finalText + interim).trim();
      if (spoken) gotAny = true;
      setValue(el, join(base, tidy(base, spoken)));
    };
    rec.onerror = function (e) {
      errored = true;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { say("Tap Allow when your phone asks to use the microphone, then tap the mic again.", true); wantStop = true; }
      else if (e.error === "network" || e.error === "audio-capture") { wantStop = true; if (fallback) { done(true); fallback(); return; } say("Couldn't hear you. Try again.", true); }
      else if (e.error === "no-speech") { errored = false; }
    };
    rec.onend = function () {
      if (!wantStop && !errored) { // phones end the session on a pause; keep listening until he taps Done
        base = el.value; finalText = "";
        try { rec.start(); return; } catch (x) { /* fall through */ }
      }
      done(false, gotAny);
    };
    try { rec.start(); } catch (x) { return false; }
    active = { stop: function () { wantStop = true; try { rec.stop(); } catch (x) { done(false, gotAny); } } };
    return true;
  }

  // ---- recorded clip -> server types it (older phones / other browsers) ----
  function clipDictate(el, btn, done) {
    var pin = null;
    try { pin = sessionStorage.getItem("na_pin"); } catch (x) { /* ignore */ }
    if (!pin) { say("Sign in first, then tap the mic.", true); done(false); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || "";
      var chunks = [], r = new MediaRecorder(stream, type ? { mimeType: type } : undefined), timer = null;
      r.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      r.onstop = function () {
        clearTimeout(timer);
        stream.getTracks().forEach(function (t) { t.stop(); });
        active = null;
        var mime = (r.mimeType || type || "audio/webm").split(";")[0];
        var blob = new Blob(chunks, { type: mime });
        btn.classList.remove("on"); btn.classList.add("wait"); btn.innerHTML = MIC;
        say("Typing what you said…", false, null, true);
        var fd = new FormData();
        fd.append("pin", pin);
        fd.append("audio", blob, "talk." + (mime.indexOf("mp4") > -1 ? "m4a" : mime.indexOf("ogg") > -1 ? "ogg" : "webm"));
        fetch(API + "/transcribe", { method: "POST", body: fd }).then(function (res) { return res.json().catch(function () { return { ok: false }; }); })
          .then(function (j) {
            btn.classList.remove("wait");
            if (j && j.ok && j.text) { setValue(el, join(el.value, tidy(el.value, j.text))); hide(); }
            else say((j && j.error) || "Didn't catch that. Tap the mic and try again.", true);
            done(false, true);
          })
          .catch(function () { btn.classList.remove("wait"); say("No connection. Try again.", true); done(false, true); });
      };
      r.start(1000);
      timer = setTimeout(function () { try { r.stop(); } catch (x) { /* ignore */ } }, 120000);
      active = { stop: function () { try { r.stop(); } catch (x) { /* ignore */ } } };
      btn.classList.add("on"); btn.innerHTML = STOP;
      say("Listening… tap Done when you finish.", false, function () { active && active.stop(); }, true);
    }).catch(function () { say("Tap Allow when your phone asks to use the microphone, then tap the mic again.", true); done(false); });
  }

  function toggle(el, btn) {
    if (active) { var was = btn.classList.contains("on"); active.stop(); if (was) return; }
    var finish = function (useFallback, got) {
      active = null;
      btn.classList.remove("on", "wait"); btn.innerHTML = MIC; btn.setAttribute("aria-label", "Talk to type");
      if (!useFallback) { if (got === false) say("Didn't hear anything. Tap the mic and try again.", true); else hide(); }
    };
    var fallback = CAN_REC ? function () { clipDictate(el, btn, finish); } : null;
    btn.classList.add("on"); btn.innerHTML = STOP; btn.setAttribute("aria-label", "Stop and type");
    if (SR && liveDictate(el, btn, finish, fallback)) {
      say("Listening… tap Done when you finish.", false, function () { active && active.stop(); }, true);
      return;
    }
    if (CAN_REC) { clipDictate(el, btn, finish); return; }
    finish(false, true);
  }

  // ---- attach to the boxes ----
  function eligible(el) {
    if (el.dataset.dm || el.readOnly || el.disabled || el.closest(".dm-wrap")) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      var t = (el.getAttribute("type") || "text").toLowerCase();
      return t === "text" && !!TEXT_INPUTS[el.id || el.name];
    }
    return false;
  }
  function attach(el) {
    if (!eligible(el)) return;
    el.dataset.dm = "1";
    var wrap = document.createElement("div");
    wrap.className = "dm-wrap";
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "dm-btn"; btn.innerHTML = MIC;
    btn.setAttribute("aria-label", "Talk to type"); btn.title = "Tap and talk — it types for you";
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggle(el, btn); });
    wrap.appendChild(btn);
  }
  function scan(root) {
    (root || document).querySelectorAll("textarea,input").forEach(attach);
  }
  scan();
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches("textarea,input")) attach(n);
        if (n.querySelectorAll) scan(n);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
