import { callSheetsBridge } from "./sheetsBridge.js";
import {
  clearCustomerSessionCookie,
  clientIp,
  customerSessionToken,
  findPortalCustomer,
  normalizeCustomerName,
  normalizeQueue,
  revalidatePortalCustomer,
  safeCustomerView,
  sessionFromCustomerRequest,
  setCustomerSessionCookie,
} from "./customerPortal.js";

export const maxDuration = 60;

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function rateState(ip) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || now - current.startedAt > WINDOW_MS) {
    const fresh = { startedAt: now, failures: 0 };
    attempts.set(ip, fresh);
    return fresh;
  }
  return current;
}

function fail(ip) {
  const state = rateState(ip);
  state.failures += 1;
  attempts.set(ip, state);
}

function jsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(String(req.body || "{}")); } catch { return {}; }
}

async function historyFor(customer) {
  try {
    const result = await callSheetsBridge({ action: "getHistory", query: customer.queue });
    return (Array.isArray(result?.items) ? result.items : [])
      .filter((item) =>
        normalizeQueue(item?.queue) === normalizeQueue(customer.queue) &&
        String(item?.source || "").trim().toLowerCase() === String(customer.source || "").trim().toLowerCase() &&
        String(item?.sheet || "").trim().toLowerCase() === String(customer.sheet || "").trim().toLowerCase()
      )
      .slice(0, 12)
      .map((item) => ({
        dateTime: String(item.dateTime || ""),
        eventType: String(item.eventType || ""),
        amount: Number(String(item.amount || "0").replace(/,/g, "")) || 0,
        note: String(item.note || "").slice(0, 220),
      }));
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "POST") {
    const ip = clientIp(req);
    const state = rateState(ip);
    if (state.failures >= MAX_FAILURES) {
      return res.status(429).json({ ok: false, error: "กรอกข้อมูลผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่" });
    }
    const body = jsonBody(req);
    const queue = String(body.queue || "").slice(0, 40);
    const fullName = [body.firstName, body.lastName].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
    if (!normalizeQueue(queue) || !normalizeCustomerName(fullName) || !String(body.firstName || "").trim() || !String(body.lastName || "").trim()) {
      fail(ip);
      return res.status(400).json({ ok: false, error: "กรุณากรอกเลขคิว ชื่อ และนามสกุลให้ครบ" });
    }
    try {
      const found = await findPortalCustomer(queue, fullName);
      if (!found.customer) {
        fail(ip);
        return res.status(401).json({ ok: false, error: "ข้อมูลไม่ตรงกับระบบ กรุณาตรวจสอบแล้วลองใหม่" });
      }
      attempts.delete(ip);
      setCustomerSessionCookie(res, customerSessionToken(found.customer));
      return res.status(200).json({ ok: true, customer: safeCustomerView(found.customer) });
    } catch (error) {
      return res.status(503).json({ ok: false, error: "ระบบตรวจข้อมูลชั่วคราวไม่ได้ กรุณาลองใหม่" });
    }
  }

  if (req.method === "GET") {
    const session = sessionFromCustomerRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าสู่ระบบ" });
    try {
      const customer = await revalidatePortalCustomer(session);
      if (!customer) {
        clearCustomerSessionCookie(res);
        return res.status(401).json({ ok: false, error: "ไม่พบข้อมูลลูกค้าล่าสุด กรุณาเข้าสู่ระบบใหม่" });
      }
      const history = await historyFor(customer);
      return res.status(200).json({ ok: true, customer: safeCustomerView(customer), history });
    } catch {
      return res.status(503).json({ ok: false, error: "โหลดข้อมูลไม่ได้ กรุณาลองใหม่" });
    }
  }

  if (req.method === "DELETE") {
    clearCustomerSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
}

