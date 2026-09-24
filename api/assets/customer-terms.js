import { CUSTOMER_TERMS_IMAGE_BASE64 } from "../../lib/customerTermsImage.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return res.status(200).send(Buffer.from(CUSTOMER_TERMS_IMAGE_BASE64, "base64"));
}
