import { paymentQrUrl } from "./paymentQr.js";
import { money, revalidatePortalCustomer, sessionFromCustomerRequest } from "./customerPortal.js";

export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  const session = sessionFromCustomerRequest(req);
  if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าสู่ระบบใหม่" });
  const amount = money(req.query?.amount);
  if (!(amount > 0) || amount > 999999.99) return res.status(400).json({ ok: false, error: "ยอดไม่ถูกต้อง" });
  try {
    const customer = await revalidatePortalCustomer(session);
    if (!customer) return res.status(401).json({ ok: false, error: "ไม่พบข้อมูลลูกค้า" });
    const url = paymentQrUrl(customer.source, amount);
    if (!url) return res.status(404).json({ ok: false, error: "ยังไม่ได้ตั้งค่า QR สำหรับรายการนี้" });
    res.setHeader("Location", url);
    return res.status(302).end();
  } catch {
    return res.status(503).json({ ok: false, error: "สร้าง QR ไม่ได้ กรุณาลองใหม่" });
  }
}

