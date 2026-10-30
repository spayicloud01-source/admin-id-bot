import sessionHandler from "../lib/customerSessionApi.js";
import paymentHandler from "../lib/customerPaymentApi.js";
import qrHandler from "../lib/customerQrApi.js";

export const maxDuration = 60;

const handlers = {
  session: sessionHandler,
  payment: paymentHandler,
  qr: qrHandler,
};

export default async function handler(req, res) {
  const route = String(req.query?.route || "");
  const selected = handlers[route];
  if (!selected) return res.status(404).json({ ok: false, error: "Not Found" });
  return selected(req, res);
}
