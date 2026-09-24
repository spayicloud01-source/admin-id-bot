import crypto from "node:crypto";

// Static merchant-presented Thai QR payloads supplied by the owner.
// V6 = โมบาย โฟน, V1/v3 = หจก.สปาย ไอโฟน.
const SOURCE_PAYLOADS = {
  v6: "00020101021130810016A00000067701011201150107536000315010214TRA010015129580320KPS004TRA0100151295831690016A00000067701011301030040214TRA010015129580420KPS004TRA0100151295853037645802TH63047292",
  "v1/v3": "00020101021130810016A00000067701011201150107536000315010214KB0000020817990320KPS004KB00000208179931690016A00000067701011301030040214KB0000020817990420KPS004KB00000208179953037645802TH630472B3",
};

function sourceKey(value) {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (key === "v6") return "v6";
  if (["v1/v3", "v1-v3", "v1v3", "v1", "v3"].includes(key)) return "v1/v3";
  return "";
}

function crc16CcittFalse(value) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id, value) {
  const text = String(value);
  return id + String(Buffer.byteLength(text, "utf8")).padStart(2, "0") + text;
}

function parseTopLevel(payload) {
  const fields = [];
  let offset = 0;
  while (offset + 4 <= payload.length) {
    const id = payload.slice(offset, offset + 2);
    const length = Number(payload.slice(offset + 2, offset + 4));
    if (!Number.isInteger(length) || length < 0 || offset + 4 + length > payload.length) {
      throw new Error("Invalid merchant QR payload");
    }
    fields.push({ id, value: payload.slice(offset + 4, offset + 4 + length) });
    offset += 4 + length;
  }
  if (offset !== payload.length) throw new Error("Invalid merchant QR payload length");
  return fields;
}

export function supportsPaymentQr(source) {
  return !!SOURCE_PAYLOADS[sourceKey(source)];
}

export function buildPaymentPayload(source, amount) {
  const key = sourceKey(source);
  const base = SOURCE_PAYLOADS[key];
  const number = Number(amount);
  if (!base) throw new Error("Payment QR is not configured for this source");
  if (!Number.isFinite(number) || number <= 0 || number > 999999.99) throw new Error("Invalid payment amount");
  const amountText = number.toFixed(2);
  const fields = parseTopLevel(base).filter((field) => !["01", "54", "63"].includes(field.id));
  const output = [];
  for (const field of fields) {
    output.push(tlv(field.id, field.value));
    if (field.id === "00") output.push(tlv("01", "12"));
    if (field.id === "53") output.push(tlv("54", amountText));
  }
  const withoutCrc = output.join("") + "6304";
  return withoutCrc + crc16CcittFalse(withoutCrc);
}

function qrSecret() {
  return process.env.PAYMENT_QR_SECRET || process.env.SHEETS_BRIDGE_SECRET || process.env.LINE_CHANNEL_SECRET || "";
}

function signature(source, amount, expires) {
  const secret = qrSecret();
  if (!secret) throw new Error("Payment QR signing secret is not configured");
  return crypto.createHmac("sha256", secret)
    .update([sourceKey(source), Number(amount).toFixed(2), String(expires)].join("|"))
    .digest("base64url")
    .slice(0, 32);
}

export function verifyPaymentQrRequest({ source, amount, expires, sig }) {
  const exp = Number(expires);
  if (!supportsPaymentQr(source) || !Number.isFinite(Number(amount)) || !Number.isFinite(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000) || exp > Math.floor(Date.now() / 1000) + 8 * 86400) return false;
  const expected = signature(source, amount, exp);
  const a = Buffer.from(String(sig || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function paymentQrUrl(source, amount) {
  if (!supportsPaymentQr(source) || !(Number(amount) > 0)) return "";
  const expires = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
  const host = process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://admin-id-bot.vercel.app");
  const query = new URLSearchParams({
    source: sourceKey(source),
    amount: Number(amount).toFixed(2),
    expires: String(expires),
    sig: signature(source, amount, expires),
  });
  return `${host.replace(/\/$/, "")}/api/payment/qr?${query}`;
}

