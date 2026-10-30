import crypto from "node:crypto";
import { callSheetsBridge } from "./sheetsBridge.js";

const SESSION_COOKIE = "admin_id_customer";
const SESSION_DAYS = 30;

function secret() {
  const value = process.env.CUSTOMER_PORTAL_SECRET || process.env.SHEETS_BRIDGE_SECRET || process.env.LINE_CHANNEL_SECRET;
  if (!value) throw new Error("Customer portal secret is not configured");
  return value;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function normalizeQueue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

export function normalizeCustomerName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/^(?:นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง)\s*/u, "")
    .replace(/[.\-_'’`]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function customerSessionToken(customer, now = Date.now()) {
  const payload = {
    source: String(customer.source || ""),
    sheet: String(customer.sheet || ""),
    row: Number(customer.row || 0),
    queue: String(customer.queue || ""),
    name: String(customer.name || ""),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_DAYS * 86400,
  };
  if (!payload.source || !payload.sheet || !payload.row || !payload.queue || !payload.name) {
    throw new Error("Customer session data is incomplete");
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update("customer-portal:" + body).digest("base64url");
  return body + "." + sig;
}

export function verifyCustomerSession(token, now = Date.now()) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update("customer-portal:" + body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.source || !payload?.sheet || !payload?.row || !payload?.queue || !payload?.name) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= now / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookies(req) {
  return String(req.headers?.cookie || "").split(";").reduce((out, part) => {
    const index = part.indexOf("=");
    if (index <= 0) return out;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return out;
  }, {});
}

export function sessionFromCustomerRequest(req) {
  return verifyCustomerSession(cookies(req)[SESSION_COOKIE]);
}

export function setCustomerSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}

export function clearCustomerSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export async function findPortalCustomer(queue, fullName) {
  const queueKey = normalizeQueue(queue);
  const nameKey = normalizeCustomerName(fullName);
  if (!queueKey || !nameKey) return { customer: null, reason: "missing" };
  const result = await callSheetsBridge({
    action: "searchCustomer",
    query: queueKey,
    paymentLookup: true,
  });
  const matches = (Array.isArray(result?.matches) ? result.matches : []).filter((item) =>
    normalizeQueue(item?.queue) === queueKey && normalizeCustomerName(item?.name) === nameKey
  );
  if (matches.length !== 1) return { customer: null, reason: matches.length > 1 ? "ambiguous" : "not_found" };
  return { customer: matches[0], reason: "" };
}

export async function revalidatePortalCustomer(session) {
  if (!session) return null;
  const result = await callSheetsBridge({
    action: "searchCustomer",
    query: String(session.source) + ":" + String(session.queue),
    paymentLookup: true,
  });
  const matches = (Array.isArray(result?.matches) ? result.matches : []).filter((item) =>
    String(item?.source || "").trim().toLowerCase() === String(session.source).trim().toLowerCase() &&
    String(item?.sheet || "").trim().toLowerCase() === String(session.sheet).trim().toLowerCase() &&
    normalizeQueue(item?.queue) === normalizeQueue(session.queue) &&
    normalizeCustomerName(item?.name) === normalizeCustomerName(session.name)
  );
  return matches.length === 1 ? matches[0] : null;
}

export function customerExactPayload(customer) {
  return {
    source: String(customer.source || "").trim(),
    sheet: String(customer.sheet || "").trim(),
    row: Number(customer.row || 0),
    queue: String(customer.queue || "").trim(),
    name: String(customer.name || "").trim(),
  };
}

export function safeCustomerView(customer) {
  const status = String(customer.status || "").trim();
  const inactive = /ปิด|ยกเลิก|ไม่ใช้งาน/i.test(status);
  return {
    queue: String(customer.queue || ""),
    name: String(customer.name || ""),
    model: String(customer.model || ""),
    status,
    principal: money(customer.principal),
    fee: money(customer.fee),
    dueDate: String(customer.dueDate || ""),
    closeAmount: money(customer.closeAmount) || roundMoney(money(customer.principal) + money(customer.fee)),
    inactive,
  };
}

export function money(value) {
  const number = Number(String(value ?? "").replace(/[,฿\s]|บาท/g, ""));
  return Number.isFinite(number) ? roundMoney(number) : 0;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function clientIp(req) {
  return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim().slice(0, 80);
}

