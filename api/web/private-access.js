import crypto from "node:crypto";
import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { createWebSession } from "../../lib/webAuth.js";

// Private one-tap link: a strong secret in the URL fragment is POSTed once.
// The fragment is never sent to Vercel as part of the initial GET request.
// No generic public admin access is enabled.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const expected = String(process.env.ADMIN_ID_PRIVATE_LINK_KEY || "");
  const ownerId = String(process.env.ADMIN_ID_PRIVATE_OWNER_LINE_ID || "");
  if (expected.length < 48 || !/^U[0-9a-f]{32}$/i.test(ownerId)) {
    return res.status(503).json({ ok: false, error: "Private owner access not configured" });
  }
  const supplied = typeof req.body?.access === "string" ? req.body.access : "";
  if (supplied.length > 300) return res.status(401).json({ ok: false, error: "Invalid private access link" });

  const actualBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (actualBytes.length !== expectedBytes.length ||
      !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    return res.status(401).json({ ok: false, error: "Invalid private access link" });
  }

  try {
    // Verify current owner permission at first entry, not on every page load.
    const access = await callSheetsBridge({
      action: "checkAccess",
      lineUserId: ownerId,
      sourceType: "user",
      groupId: "",
      permission: "จัดการเจ้าหน้าที่",
      allowSystemControl: true,
    });
    if (access?.allowed !== true || String(access?.role || "").trim() !== "เจ้าของ") {
      return res.status(403).json({ ok: false, error: "Owner permission unavailable" });
    }
    const token = createWebSession({
      lineUserId: ownerId,
      staffName: access.staffName || "เจ้าของ",
      role: "เจ้าของ",
      via: "private-link",
    });
    return res.status(200).json({ ok: true, token });
  } catch (error) {
    console.error("Private owner access failed", { name: error?.name });
    return res.status(503).json({ ok: false, error: "Owner access temporarily unavailable" });
  }
}
