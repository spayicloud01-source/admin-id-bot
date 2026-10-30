import crypto from "node:crypto";
import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { createWebSession } from "../../lib/webAuth.js";
import { configuredOwnerCredentials, verifyOwnerPassword } from "../../lib/adminPasswordAuth.js";

export const maxDuration = 25;

// Best-effort per-instance throttling. For Production, add Vercel Firewall /
// distributed rate limiting before making password login the primary access path.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 6;
const MAX_TRACKED_IPS = 1200;
const OWNER_SESSION_SECONDS = 12 * 60 * 60;

function clientKey(req) {
  const forwarded = String(req.headers?.["x-vercel-forwarded-for"] || "").split(",")[0].trim();
  const source = forwarded || String(req.socket?.remoteAddress || "unknown").trim();
  return crypto.createHash("sha256").update(source).digest("hex");
}

function exceeded(key, now) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (now - entry.since >= WINDOW_MS) { attempts.delete(key); return false; }
  return entry.failed >= MAX_FAILURES;
}

function failed(key, now) {
  let entry = attempts.get(key);
  if (!entry || now - entry.since >= WINDOW_MS) entry = {since:now,failed:0};
  entry.failed += 1;
  attempts.set(key, entry);
  if (attempts.size > MAX_TRACKED_IPS) attempts.delete(attempts.keys().next().value);
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || "");
  const site = String(req.headers?.["sec-fetch-site"] || "");
  if (site && !["same-origin","none"].includes(site)) return false;
  if (!origin) return true; // Non-browser clients; still need the password.
  try {
    const host = String(req.headers?.host || "").toLowerCase();
    const uri = new URL(origin);
    return uri.protocol === "https:" && uri.host.toLowerCase() === host;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ok:false,error:"Method Not Allowed"});
  }
  if (!sameOrigin(req)) return res.status(403).json({ok:false,error:"คำขอไม่ถูกต้อง"});
  if (!String(req.headers?.["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ok:false,error:"กรุณาส่งข้อมูลแบบ JSON"});
  }
  if (!configuredOwnerCredentials()) {
    return res.status(503).json({ok:false,error:"ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วยรหัสผ่าน กรุณาใช้ LINE เจ้าของก่อน"});
  }
  const key = clientKey(req);
  const now = Date.now();
  if (exceeded(key,now)) {
    res.setHeader("Retry-After",String(Math.ceil(WINDOW_MS/1000)));
    return res.status(429).json({ok:false,error:"ลองรหัสผ่านหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง"});
  }
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  if (JSON.stringify(body).length > 1024) return res.status(413).json({ok:false,error:"ข้อมูลยาวเกินกำหนด"});
  const username = body.username;
  const password = body.password;
  if (typeof username !== "string" || username.length>80 || typeof password !== "string" ||
      password.length>128 || Buffer.byteLength(password,"utf8")>512) {
    failed(key,now);
    return res.status(401).json({ok:false,error:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"});
  }
  try {
    const valid = await verifyOwnerPassword(username,password);
    if (!valid) {
      failed(key,Date.now());
      return res.status(401).json({ok:false,error:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"});
    }
    // Owner identity is fixed server-side. No client-provided LINE ID or role
    // can grant access, and an unavailable GAS permission check fails closed.
    const ownerId = String(process.env.OWNER_LINE_USER_ID || "").trim();
    const access = await callSheetsBridge({
      action:"checkAccess",lineUserId:ownerId,sourceType:"user",groupId:"",
      permission:"จัดการเจ้าหน้าที่",allowSystemControl:true,
    });
    if (access?.allowed !== true || String(access?.role || "").trim() !== "เจ้าของ") {
      return res.status(403).json({ok:false,error:"บัญชีนี้ไม่มีสิทธิ์เจ้าของที่ใช้งานอยู่"});
    }
    attempts.delete(key);
    const token = createWebSession({
      lineUserId:ownerId,staffName:access.staffName||"เจ้าของ",role:"เจ้าของ",
      authMethod:"password",expiresInSeconds:OWNER_SESSION_SECONDS,
    });
    return res.status(200).json({ok:true,token,expiresInSeconds:OWNER_SESSION_SECONDS});
  } catch (error) {
    console.warn("Owner password login unavailable",String(error?.message || error).slice(0,140));
    return res.status(503).json({ok:false,error:"ตรวจสอบสิทธิ์เจ้าของไม่สำเร็จ กรุณาลองใหม่"});
  }
}
