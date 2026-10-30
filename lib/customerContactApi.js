import { revalidatePortalCustomer, sessionFromCustomerRequest } from "./customerPortal.js";

const recent = new Map();

async function pushOwner(text) {
  const to = String(process.env.CUSTOMER_PORTAL_SERVICE_LINE_USER_ID || "");
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "");
  if (!to || !token) throw new Error("Customer contact notification is not configured");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok && response.status !== 409) throw new Error(`LINE push failed: ${response.status}`);
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
    const key = [customer.source, customer.sheet, customer.row, customer.queue].join("|");
    const last = recent.get(key) || 0;
    if (Date.now() - last < 60_000) {
      return res.status(200).json({ ok: true, message: "ส่งแจ้งแอดมินแล้ว กรุณารอสักครู่" });
    }
    await pushOwner([
      "ลูกค้าต้องการติดต่อแอดมินผ่านเว็บ",
      `ชื่อ: ${customer.name || "-"}`,
      `คิว: ${customer.queue || "-"}`,
      `รายการ: ${customer.source || "-"} / ${customer.sheet || "-"}`,
      `เวลา: ${new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }).format(new Date())}`,
    ].join("\n"));
    recent.set(key, Date.now());
    while (recent.size > 200) recent.delete(recent.keys().next().value);
    return res.status(200).json({ ok: true, message: "ส่งแจ้งแอดมินแล้ว กรุณารอสักครู่" });
  } catch (error) {
    console.error("Customer web contact failed", error);
    return res.status(503).json({ ok: false, error: "ยังติดต่อแอดมินไม่ได้ กรุณาลองใหม่" });
  }
}
