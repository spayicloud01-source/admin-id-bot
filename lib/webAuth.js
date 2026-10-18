import crypto from "node:crypto";

function secret() {
  const value = process.env.SHEETS_BRIDGE_SECRET;
  if (!value) throw new Error("SHEETS_BRIDGE_SECRET is not configured");
  return value;
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function createWebSession({ lineUserId, staffName = "", role = "เจ้าของ" }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(lineUserId || ""),
    name: String(staffName || ""),
    role: String(role || ""),
    iat: now,
  };
  if (!payload.sub || payload.role !== "เจ้าของ") throw new Error("Owner session required");
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + sig;
}

export function verifyWebSession(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (!payload?.sub || payload.role !== "เจ้าของ") return null;
  // No automatic timeout. Sessions persist on trusted devices until manual
  // sign-out, browser data removal, owner credential revocation or secret rotation.
  // Require a legitimate issuance timestamp to reject malformed/future tokens.
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = Number(payload.iat);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0 || issuedAt > now + 120) return null;
  // Optional emergency revocation: set WEB_SESSION_NOT_BEFORE to a Unix second.
  const notBefore = Number(process.env.WEB_SESSION_NOT_BEFORE || 0);
  if (Number.isFinite(notBefore) && issuedAt < notBefore) return null;
  return payload;
}

export function sessionFromRequest(req) {
  const header = String(req.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return verifyWebSession(token);
}
