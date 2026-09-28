/**
 * Crypto helpers for the Estimate add-on.
 *  - seal/open: AES-256-GCM field encryption for customer PII (phone, email, address, signatures).
 *    Key: ESTIMATE_ENC_KEY (any string; hashed to 32 bytes). Falls back to JWT_SECRET so it is never plaintext
 *    on a configured server. If neither is set, values are stored with a "plain:" prefix and a warning is logged once.
 *  - newToken/hashToken: random URL tokens; only the SHA-256 hash is used for lookups.
 */
const crypto = require("crypto");

let warned = false;
function key() {
  const raw = process.env.ESTIMATE_ENC_KEY || process.env.JWT_SECRET || "";
  if (!raw) {
    if (!warned) { console.warn("[estimate] ESTIMATE_ENC_KEY/JWT_SECRET not set: customer PII stored unencrypted"); warned = true; }
    return null;
  }
  return crypto.createHash("sha256").update("hsw365-estimate:" + raw).digest();
}

function seal(value) {
  if (value == null || value === "") return "";
  const s = String(value);
  const k = key();
  if (!k) return "plain:" + s;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

function open(value) {
  if (!value) return "";
  const s = String(value);
  if (s.startsWith("plain:")) return s.slice(6);
  if (!s.startsWith("v1:")) return s;
  const k = key();
  if (!k) return "";
  try {
    const buf = Buffer.from(s.slice(3), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch (e) {
    return "";
  }
}

const newToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");
const hashToken = (t) => crypto.createHash("sha256").update(String(t || "")).digest("hex");
const phoneHash = (phone) => {
  const d = String(phone || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return "";
  return crypto.createHmac("sha256", process.env.ESTIMATE_ENC_KEY || process.env.JWT_SECRET || "hsw365").update(d).digest("hex");
};
const safeEqual =(a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = { seal, open, newToken, hashToken, safeEqual, phoneHash };
