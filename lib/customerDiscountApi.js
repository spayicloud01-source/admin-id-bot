import { callSheetsBridge } from "./sheetsBridge.js";
import {
  clearCustomerSessionCookie,
  normalizeCustomerName,
  normalizeQueue,
  revalidatePortalCustomer,
  sessionFromCustomerRequest,
} from "./customerPortal.js";

export const maxDuration = 60;

function sameCustomer(expected, actual) {
  if (!expected || !actual) return false;
  return String(expected.source || "").trim().toLowerCase() === String(actual.source || "").trim().toLowerCase()
    && String(expected.sheet || "").trim().toLowerCase() === String(actual.sheet || "").trim().toLowerCase()
    && Number(expected.row || 0) > 0
    && Number(expected.row) === Number(actual.row)
    && normalizeQueue(expected.queue) === normalizeQueue(actual.queue)
    && normalizeCustomerName(expected.name) === normalizeCustomerName(actual.name);
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  const session = sessionFromCustomerRequest(req);
  if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าสู่ระบบ" });
  try {
    const customer = await revalidatePortalCustomer(session);
    if (!customer) {
      clearCustomerSessionCookie(res);
      return res.status(401).json({ ok: false, error: "บัญชีปิดยอดหรือไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาติดต่อแอดมิน" });
    }
    const result = await callSheetsBridge({
      action: "getCalculatedSummary",
      query: [customer.source, customer.queue].join(":"),
    });
    const summary = result?.summary;
    if (!summary || result?.needsSelection || !sameCustomer(customer, summary.customer)) {
      // Do not ever show another queue's discounts; never guess eligibility.
      return res.status(409).json({ ok: false, error: "ยังยืนยันสิทธิ์ส่วนลดของคิวนี้ไม่ได้ กรุณาติดต่อแอดมิน" });
    }
    const discountAmount = numeric(summary.discountAmount);
    const discountPercent = numeric(summary.discountPercent);
    const calculatedClose = numeric(summary.calculatedClose);
    const paidForCycle = numeric(summary.paidForCycle);
    const feeBefore = numeric(summary.accumulatedFee);
    if ([discountAmount, discountPercent, calculatedClose, paidForCycle, feeBefore].some(v => v === null)) {
      return res.status(503).json({ ok: false, error: "ข้อมูลคำนวณส่วนลดยังไม่ครบ กรุณาลองใหม่" });
    }
    const feeAfter = numeric(summary.feeApplied);
    if (feeAfter === null) return res.status(503).json({ ok: false, error: "ข้อมูลค่าเช่าหลังส่วนลดยังไม่ครบ กรุณาลองใหม่" });
    // The GAS summary.calculatedClose is before paidForCycle; subtract payments
    // already applied to this cycle, like calculateCustomerSelfSummary_ does.
    const netClose = Math.max(0, Math.round((calculatedClose - paidForCycle + Number.EPSILON) * 100) / 100);
    return res.status(200).json({
      ok: true,
      eligible: summary.discountEligible === true,
      discountPercent,
      discountAmount,
      feeBefore,
      feeAfter,
      paidForCycle,
      calculatedClose: netClose,
      discountStartDate: String(summary.discountStartDate || ""),
      crossCycleOutstanding: summary.crossCycleOutstanding === true,
      calculatedAt: String(summary.calculatedAt || ""),
      provisional: true,
    });
  } catch (error) {
    console.error("Customer discount lookup failed", String(error?.message || error).slice(0, 180));
    return res.status(503).json({ ok: false, error: "ระบบคำนวณส่วนลดยังไม่พร้อม กรุณาลองใหม่หรือติดต่อแอดมิน" });
  }
}
