import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { callSheetsBridge } from "./sheetsBridge.js";
import {
  customerExactPayload,
  money,
  revalidatePortalCustomer,
  sessionFromCustomerRequest,
} from "./customerPortal.js";

export const maxDuration = 60;

const KINDS = {
  payment: { action: "queuePayment", label: "รับยอด", paymentKind: "" },
  principal: { action: "queuePayment", label: "ตัดต้น", paymentKind: "principal" },
  fine: { action: "queuePayment", label: "ค่าปรับ", paymentKind: "fine" },
  close: { action: "queueClose", label: "ปิดยอด", paymentKind: "" },
};

function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(String(req.body || "{}")); } catch { return {}; }
}

function bangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function decodeSlip(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("กรุณาแนบรูปสลิป JPG, PNG หรือ WEBP");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) throw new Error("รูปสลิปต้องมีขนาดไม่เกิน 3 MB");
  const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  return { buffer, contentType: match[1], extension };
}

function slipKey(customer, kind, amount, paidOn) {
  const secret = process.env.CUSTOMER_PORTAL_SECRET || process.env.SHEETS_BRIDGE_SECRET || process.env.LINE_CHANNEL_SECRET || "";
  if (!secret) throw new Error("ระบบยืนยันรายการยังไม่พร้อม");
  return crypto.createHmac("sha256", secret)
    .update([customer.source, customer.sheet, customer.queue, paidOn, kind, Number(amount).toFixed(2)].join("|"))
    .digest("base64url")
    .slice(0, 32);
}

async function pushLine(to, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !to) return false;
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
    signal: AbortSignal.timeout(10000),
  });
  return response.ok || response.status === 409;
}

async function notifyReviewers(result, customer, kind, amount, slipUrl, paidOn, rowNo) {
  const recipients = [...new Set([
    process.env.CUSTOMER_PORTAL_SERVICE_LINE_USER_ID,
    ...(Array.isArray(result?.reviewerLineUserIds) ? result.reviewerLineUserIds : []),
    ...(Array.isArray(result?.ownerLineUserIds) ? result.ownerLineUserIds : []),
  ].filter(Boolean))];
  const label = KINDS[kind]?.label || "รับยอด";
  const text = [
    "มีรายการชำระผ่านเว็บ",
    `#${rowNo} | ${label}`,
    `คิว: ${customer.queue}`,
    `ชื่อ: ${customer.name}`,
    `ยอด: ${Number(amount).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`,
    `วันที่รับเงินจริง: ${paidOn.split("-").reverse().join("/")}`,
    "กรุณาตรวจสลิปก่อนกดผ่าน",
  ].join("\n");
  const action = {
    type: "text",
    text,
    quickReply: { items: [
      { type: "action", action: { type: "message", label: "ผ่าน", text: `ผ่านคิว ${rowNo}` } },
      { type: "action", action: { type: "message", label: "ไม่ผ่าน", text: `ไม่ผ่านคิว ${rowNo}` } },
    ] },
  };
  let sent = 0;
  for (const to of recipients) {
    try {
      if (await pushLine(to, [action, { type: "image", originalContentUrl: slipUrl, previewImageUrl: slipUrl }])) sent += 1;
    } catch {}
  }
  return { sent, recipients: recipients.length };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  const session = sessionFromCustomerRequest(req);
  if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าสู่ระบบใหม่" });
  try {
    const customer = await revalidatePortalCustomer(session);
    if (!customer) return res.status(401).json({ ok: false, error: "ไม่พบข้อมูลลูกค้าล่าสุด" });
    if (/ปิด|ยกเลิก|ไม่ใช้งาน/i.test(String(customer.status || ""))) {
      return res.status(409).json({ ok: false, error: "รายการนี้ปิดหรือไม่ใช้งานแล้ว" });
    }
    const body = bodyOf(req);
    const kind = String(body.kind || "payment");
    const config = KINDS[kind];
    const amount = money(body.amount);
    if (!config || !(amount > 0) || amount > 999999.99) {
      return res.status(400).json({ ok: false, error: "กรุณาเลือกประเภทและระบุยอดให้ถูกต้อง" });
    }
    if (kind === "principal" && amount > money(customer.principal)) {
      return res.status(400).json({ ok: false, error: "ยอดตัดต้นมากกว่าเงินต้นคงเหลือ" });
    }
    const slip = decodeSlip(body.slipDataUrl);
    const paidOn = bangkokDate();
    const key = slipKey(customer, kind, amount, paidOn);
    const pathname = `admin-id-slips/${paidOn}/${key}.${slip.extension}`;
    const blob = await put(pathname, slip.buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: slip.contentType,
    });
    const payload = {
      action: config.action,
      query: `${customer.source}:${customer.queue}`,
      exactCustomer: customerExactPayload(customer),
      amount,
      paidOn,
      requestId: blob.url,
      lineUserId: String(process.env.CUSTOMER_PORTAL_SERVICE_LINE_USER_ID || ""),
      sourceType: "user",
      groupId: "",
      staffName: "ลูกค้าผ่านเว็บ",
      role: "เจ้าของ",
    };
    if (!payload.lineUserId) throw new Error("ระบบรับรายการผ่านเว็บยังไม่พร้อม");
    if (config.paymentKind) payload.paymentKind = config.paymentKind;
    const result = await callSheetsBridge(payload);
    const rowNo = Number(result?.rowNo || result?.duplicateRowNo || 0);
    if ((!result?.queued && !result?.duplicate) || !rowNo) {
      return res.status(409).json({ ok: false, error: result?.message || "ยังส่งรายการเข้าคิวไม่ได้" });
    }
    const notification = await notifyReviewers(result, customer, kind, amount, blob.url, paidOn, rowNo);
    return res.status(200).json({
      ok: true,
      pending: true,
      duplicate: Boolean(result?.duplicate),
      rowNo,
      message: `ส่งหลักฐานแล้ว รายการ #${rowNo} กำลังรอตรวจสอบ`,
      notification,
    });
  } catch (error) {
    console.error("Customer web payment failed", error);
    const message = String(error?.message || error);
    const safe = /รูปสลิป|ขนาด|ยืนยันรายการ/.test(message) ? message : "ระบบรับรายการชั่วคราวไม่ได้ กรุณาลองใหม่";
    return res.status(503).json({ ok: false, error: safe });
  }
}

