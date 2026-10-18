import crypto from "node:crypto";
import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { sessionFromRequest, createWebSession, verifyWebSession } from "../../lib/webAuth.js";
import { PWA_PNG_ICONS } from "../../lib/pwaIcons.js";

let cachedSheets = null;
let cachedAt = 0;
const CONFIG_CACHE_MS = 5 * 60 * 1000;

async function redeemPrivateLink(req, res) {
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
    // A scoped HttpOnly cookie lets Chrome fetch a personalised install manifest
    // with the one-tap fragment in its start_url. It is never public or cached.
    res.setHeader("Set-Cookie", "adminIdPwaSession=" + encodeURIComponent(token) +
      "; Path=/api/web/config; Max-Age=34560000; HttpOnly; Secure; SameSite=Strict");
    return res.status(200).json({ ok: true, token });
  } catch (error) {
    console.error("Private owner access failed", { name: error?.name });
    return res.status(503).json({ ok: false, error: "Owner access temporarily unavailable" });
  }
}

export default async function handler(req, res) {
  if (req.method === "GET" && String(req.query?.pwa_manifest || "") === "1") {
    // A home-screen icon needs a repeatable launch URL. Only a browser with
    // a signed, private owner cookie may receive the private fragment.
    // The fragment will be consumed and removed on the first app launch.
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    res.setHeader("Referrer-Policy", "no-referrer");
    const cookie = String(req.headers?.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith("adminIdPwaSession="));
    let session = null;
    try {
      session = cookie ? verifyWebSession(decodeURIComponent(cookie.split("=").slice(1).join("="))) : null;
    } catch (_) {}
    const privateKey = String(process.env.ADMIN_ID_PRIVATE_LINK_KEY || "");
    const privateOwner = String(process.env.ADMIN_ID_PRIVATE_OWNER_LINE_ID || "");
    const authorized = session?.via === "private-link" && session.sub === privateOwner &&
      /^U[0-9a-f]{32}$/i.test(privateOwner) && privateKey.length >= 48;
    if (!authorized) return res.status(403).json({ ok: false, error: "Install from the private owner link in Chrome first" });
    const startUrl = "/?app=1#access=" + encodeURIComponent(privateKey);
    return res.status(200).send(JSON.stringify({
      id: "/admin-id-owner",
      name: "Admin ID — หลังบ้าน",
      short_name: "Admin ID",
      description: "ระบบหลังบ้าน Admin ID สำหรับเจ้าของ",
      lang: "th",
      start_url: startUrl,
      scope: "/",
      display: "standalone",
      background_color: "#0f4030",
      theme_color: "#0f4030",
      prefer_related_applications: false,
      icons: [
        {src:"/api/web/config?icon=192",sizes:"192x192",type:"image/png",purpose:"any"},
        {src:"/api/web/config?icon=512",sizes:"512x512",type:"image/png",purpose:"any maskable"}
      ]
    }));
  }
  // The PWA installer needs public icons, not another serverless function.
  // No auth data, customer information, or session token is served by this route.
  const iconSize = String(req.query?.icon || "");
  if (req.method === "GET" && (iconSize === "192" || iconSize === "512")) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800");
    return res.status(200).send(Buffer.from(PWA_PNG_ICONS[Number(iconSize)], "base64"));
  }
  if (req.method === "POST") return redeemPrivateLink(req, res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  try {
    const session = sessionFromRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าเว็บผ่าน LINE OA ใหม่" });

    let items = cachedSheets;
    const fresh = Array.isArray(items) && Date.now() - cachedAt < CONFIG_CACHE_MS;

    if (!fresh) {
      const sheets = await callSheetsBridge({
        action: "listCustomerNotificationSheets",
        lineUserId: session.sub,
      });

      if (sheets?.allowed === false) {
        return res.status(403).json({ ok: false, error: sheets.message || "ไม่มีสิทธิ์" });
      }

      items = Array.isArray(sheets?.items) ? sheets.items : [];
      cachedSheets = items;
      cachedAt = Date.now();
    }

    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).json({
      ok: true,
      owner: { name: session.name || "เจ้าของ" },
      sheets: items,
      cached: fresh,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 180) });
  }
}
