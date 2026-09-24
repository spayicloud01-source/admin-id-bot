import QRCode from "qrcode";
import { buildPaymentPayload, verifyPaymentQrRequest } from "../../lib/paymentQr.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  const query = req.query || {};
  const input = {
    source: String(query.source || ""),
    amount: Number(query.amount),
    expires: Number(query.expires),
    sig: String(query.sig || ""),
  };
  if (!verifyPaymentQrRequest(input)) {
    return res.status(403).json({ ok: false, error: "Invalid or expired payment QR" });
  }
  try {
    const payload = buildPaymentPayload(input.source, input.amount);
    const png = await QRCode.toBuffer(payload, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 3,
      width: 900,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="payment-${input.amount.toFixed(2)}.png"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(png);
  } catch (error) {
    console.error("Payment QR generation failed", error);
    return res.status(500).json({ ok: false, error: "Payment QR generation failed" });
  }
}
