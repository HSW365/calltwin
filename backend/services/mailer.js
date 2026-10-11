/**
 * Email for CallTwin: owner job alerts and estimate emails go through here.
 *
 * Every job alert is sent by email AND by text at the same time, so an owner gets the job the moment it
 * comes in even while the text line is still waiting on carrier approval.
 *
 * Pick ONE sender (first one configured wins):
 *   GMAIL_USER + GMAIL_APP_PASSWORD             a Gmail address and its 16-character app password
 *   SMTP_HOST + SMTP_USER + SMTP_PASS (+ SMTP_PORT, default 465)   any other mailbox
 *   SENDGRID_API_KEY                            SendGrid
 * Optional: ALERT_FROM_EMAIL (defaults to the mailbox / ESTIMATE_FROM_EMAIL), ALERT_FROM_NAME (default "CallTwin").
 *
 * sendEmail never throws: it returns true when the provider accepted the message, false otherwise.
 */
const axios = require("axios");

const env = (k) => String(process.env[k] || "").trim();
let lastError = null;
let transport = null, transportKey = "";

function provider() {
  if (env("GMAIL_USER") && env("GMAIL_APP_PASSWORD")) return "gmail";
  if (env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS")) return "smtp";
  if (env("SENDGRID_API_KEY")) return "sendgrid";
  return null;
}
function fromEmail() {
  const p = provider();
  return env("ALERT_FROM_EMAIL") || env("ESTIMATE_FROM_EMAIL") || (p === "gmail" ? env("GMAIL_USER") : p === "smtp" ? env("SMTP_USER") : "");
}
function emailReady() { return !!provider() && /@/.test(fromEmail()); }

function smtp() {
  const gmail = provider() === "gmail";
  const cfg = gmail
    ? { host: "smtp.gmail.com", port: 465, user: env("GMAIL_USER"), pass: env("GMAIL_APP_PASSWORD").replace(/\s+/g, "") }
    : { host: env("SMTP_HOST"), port: Number(env("SMTP_PORT") || 465), user: env("SMTP_USER"), pass: env("SMTP_PASS") };
  const key = [cfg.host, cfg.port, cfg.user, cfg.pass.length].join("|");
  if (!transport || transportKey !== key) {
    // Built on first use, so a missing or bad mail setting can never stop the server from starting.
    transport = require("nodemailer").createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    transportKey = key;
  }
  return transport;
}

/** opts: { replyTo, fromName, html } */
async function sendEmail(to, subject, text, opts = {}) {
  const rcpt = String(to || "").trim();
  if (!emailReady() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rcpt)) return false;
  const from = fromEmail();
  const name = opts.fromName || env("ALERT_FROM_NAME") || "CallTwin";
  const subj = String(subject || "").replace(/[\r\n]+/g, " ").slice(0, 200);
  const body = String(text || "").slice(0, 20000);
  const replyTo = opts.replyTo && /@/.test(opts.replyTo) ? String(opts.replyTo).trim() : undefined;
  try {
    if (provider() === "sendgrid") {
      await axios.post("https://api.sendgrid.com/v3/mail/send", {
        personalizations: [{ to: [{ email: rcpt }] }],
        from: { email: from, name },
        reply_to: replyTo ? { email: replyTo } : undefined,
        subject: subj,
        content: [{ type: "text/plain", value: body }, ...(opts.html ? [{ type: "text/html", value: opts.html }] : [])],
      }, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("SENDGRID_API_KEY")}` }, timeout: 15000 });
    } else {
      await smtp().sendMail({ from: { name, address: from }, to: rcpt, replyTo, subject: subj, text: body, html: opts.html || undefined });
    }
    lastError = null;
    return true;
  } catch (e) {
    const why = e.response ? `${e.response.status} ${JSON.stringify(e.response.data || "").slice(0, 200)}` : (e.code ? `${e.code}: ` : "") + e.message;
    lastError = { at: new Date().toISOString(), message: String(why).replace(/[^\s@]+@[^\s@]+/g, "[email]").slice(0, 300) };
    console.error("[mailer] send failed:", lastError.message);
    return false;
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The alert as an email: the same words as the text message, with a tap-to-call button when there is a callback number. */
function alertHtml(business, body) {
  const lines = String(body).split("\n").map((l) => l.trim()).filter(Boolean);
  const tel = (String(body).match(/tel:(\d{10,11})/) || [])[1];
  const shown = lines.filter((l) => !/^Call back: tel:/i.test(l));
  const urgent = /^EMERGENCY/i.test(shown[0] || "");
  const pretty = tel ? tel.replace(/^1(?=\d{10}$)/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3") : "";
  const link = (l) => esc(l).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#0b5cab">${u}</a>`);
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
<tr><td style="background:${urgent ? "#b91c1c" : "#0f172a"};color:#ffffff;padding:16px 22px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">${esc(business || "CallTwin")}${urgent ? " &middot; Emergency" : ""}</td></tr>
<tr><td style="padding:22px">
<div style="font-size:19px;line-height:1.35;font-weight:700;margin:0 0 12px">${link(shown[0] || "New alert")}</div>
${shown.slice(1).map((l) => `<div style="font-size:16px;line-height:1.5;margin:0 0 8px;color:#374151">${link(l)}</div>`).join("\n")}
${tel ? `<div style="margin:20px 0 4px"><a href="tel:${tel}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:14px 26px;border-radius:10px">Call back ${pretty}</a></div>` : ""}
</td></tr>
<tr><td style="padding:14px 22px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">Sent by CallTwin the moment this came in. It is also saved in your dashboard.</td></tr>
</table></body></html>`;
}

/** Email an owner alert. Subject is the alert's first line so the job shows in the inbox preview. */
async function alertEmail(to, business, body) {
  const text = String(body || "").trim();
  if (!text) return false;
  return sendEmail(to, text.split("\n")[0].slice(0, 150), text, { fromName: env("ALERT_FROM_NAME") || "CallTwin Alerts", html: alertHtml(business, text) });
}

/** Safe to show publicly: no addresses, no secrets. */
function status() { return { ready: emailReady(), provider: provider(), last_error: lastError }; }

module.exports = { sendEmail, alertEmail, alertHtml, emailReady, provider, status };
