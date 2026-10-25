import { bridgeConfigured, callBridge } from "../lib/bridge.js";
import { LAKROI_SEED_BILLS, LAKROI_SEED_SYNCED_AT } from "../lib/seed.js";

// Dedicated Lakroi API. No Admin ID or LINE dependencies.
function lakroiStoreId() {
  return String(process.env.BLOB_STORE_ID || "").replace(/^store_/, "");
}
function lakroiAuthToken() {
  return process.env.VERCEL_OIDC_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || "";
}
function lakroiBlobUrl(pathname) {
  const id = lakroiStoreId();
  if (!id) throw new Error("BLOB_STORE_ID missing");
  return `https://${id}.public.blob.vercel-storage.com/${pathname}`;
}
async function lakroiPut(pathname, body, contentType) {
  const id = lakroiStoreId();
  const token = lakroiAuthToken();
  if (!id || !token) throw new Error("Blob credentials missing");
  const r = await fetch("https://vercel.com/api/blob/?pathname=" + encodeURIComponent(pathname), {
    method: "PUT",
    headers: {
      authorization: "Bearer " + token,
      "x-api-version": "12",
      "x-vercel-blob-store-id": id,
      "x-vercel-blob-access": "public",
      "x-allow-overwrite": "1",
      "x-content-type": contentType || "application/octet-stream",
    },
    body,
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error((data.error && data.error.message) || text || ("Blob HTTP " + r.status));
  return data;
}
async function lakroiReadState() {
  // Sales rows are grounded in the latest synced Google Sheet snapshot.
  // Cloud is used only to preserve dashboard metadata such as goal/photos.
  let cloud = { bills: [], goal: 15000, updatedAt: null };
  try {
    const r = await fetch(lakroiBlobUrl("lakroi/data.json") + "?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) cloud = await r.json();
  } catch {}
  const seed = Array.isArray(LAKROI_SEED_BILLS) ? LAKROI_SEED_BILLS : [];
  const cloudById = new Map((Array.isArray(cloud.bills) ? cloud.bills : []).map((x) => [String(x.id || ""), x]));
  const bills = seed.map((x) => {
    const old = cloudById.get(String(x.id || ""));
    return old ? { ...x, photo: String(old.photo || x.photo || "") } : x;
  });
  const state = {
    bills,
    goal: Number(cloud.goal || 15000),
    updatedAt: LAKROI_SEED_SYNCED_AT,
    sourceMode: "snapshot",
    salesWritable: false,
    seededFrom: "หลักร้อยเฟอร์ฯ - ยอดขายและลงของ / บิลขาย",
  };
  return state;
}
export default async function handleLakroi(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");
    const expectedPin = String(process.env.LAKROI_DASHBOARD_PIN || "").trim();
    const suppliedPin = String(req.headers["x-lakroi-pin"] || "").trim();
    if (!expectedPin || suppliedPin !== expectedPin) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    if (Boolean(process.env.LAKROI_BRIDGE_URL) !== Boolean(process.env.LAKROI_BRIDGE_SECRET)) {
      throw new Error("ตั้งค่าตัวเชื่อมชีตไม่ครบ");
    }
    if (req.method === "GET") {
      const state = bridgeConfigured() ? await lakroiLiveState() : await lakroiReadState();
      return res.status(200).json({ ok: true, ...state });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const action = String(body.action || "save");
    if (bridgeConfigured() && ["createBill", "setPhoto", "setGoal"].includes(action)) {
      if (action === "setPhoto") {
        const photo = new URL(String(body.data?.url || ""));
        if (photo.origin !== new URL(lakroiBlobUrl("lakroi/bills/")).origin || !photo.pathname.startsWith("/lakroi/bills/")) {
          return res.status(400).json({ok:false,error:"ที่อยู่รูปไม่ถูกต้อง"});
        }
      }
      const result = await callBridge(action, body.data || {});
      return res.status(200).json(result);
    }
    if (bridgeConfigured() && action === "save") {
      return res.status(409).json({ok:false,error:"กรุณารีเฟรชเว็บ ใช้การบันทึกทีละรายการแทนการเขียนทับทั้งชุด"});
    }
    if (action === "uploadImage") {
      const dataUrl = String(body.dataUrl || "");
      const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return res.status(400).json({ ok: false, error: "Invalid image" });
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > 1400000) return res.status(413).json({ ok: false, error: "Image too large" });
      const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
      const safe = String(body.billId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || String(Date.now());
      const path = `lakroi/bills/${safe}-${Date.now()}.${ext}`;
      const result = await lakroiPut(path, buf, m[1]);
      return res.status(200).json({ ok: true, url: result.url || lakroiBlobUrl(path) });
    }
    if (action === "save") {
      const fields = ["id", "createdAt", "date", "branch", "amount", "method", "note", "cashAmount", "transferAmount", "thaiAmount"];
      const salesKey = x => JSON.stringify(fields.map(k => x[k] ?? ""));
      const expected = new Map(LAKROI_SEED_BILLS.map(x => [x.id, salesKey(x)]));
      const incoming = Array.isArray(body.bills) ? body.bills : [];
      if (incoming.length !== expected.size || new Set(incoming.map(x => x.id)).size !== expected.size ||
          incoming.some(x => expected.get(x.id) !== salesKey(x))) {
        return res.status(409).json({ok:false,error:"ยังไม่เชื่อมการบันทึกชีต กรุณาลงหรือแก้บิลผ่าน LINE เดิม"});
      }
      const bills = Array.isArray(body.bills) ? body.bills.slice(-2000) : [];
      const clean = bills.map((x) => ({
        id: String(x.id || ""),
        createdAt: String(x.createdAt || ""),
        date: String(x.date || ""),
        branch: String(x.branch || ""),
        amount: Number(x.amount || 0),
        cashAmount: Number(x.cashAmount || 0),
        transferAmount: Number(x.transferAmount || 0),
        thaiAmount: Number(x.thaiAmount || 0),
        method: String(x.method || ""),
        note: String(x.note || "").slice(0, 500),
        photo: String(x.photo || "").slice(0, 2000),
      })).filter((x) => x.id && x.date && x.amount >= 0);
      const previousResponse = await fetch(lakroiBlobUrl("lakroi/data.json") + "?t=" + Date.now(), {cache:"no-store"});
      if (!previousResponse.ok && previousResponse.status !== 404) throw new Error("อ่านข้อมูลเดิมก่อนบันทึกไม่สำเร็จ");
      const previous = previousResponse.ok ? await previousResponse.json() : {bills:[]};
      const preserved = (Array.isArray(previous.bills) ? previous.bills : []).filter(x => !expected.has(x.id));
      const state = { bills: [...clean, ...preserved], goal: Number(body.goal || 15000), updatedAt: new Date().toISOString() };
      await lakroiPut("lakroi/data.json", JSON.stringify(state), "application/json; charset=utf-8");
      return res.status(200).json({ ok: true, updatedAt: state.updatedAt, count: clean.length });
    }
    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: String(error?.message || error) });
  }
}

// Read legacy cloud records for reconciliation only. Never migrate or overwrite them on GET.
async function lakroiLiveState() {
  const live = await callBridge("list");
  if (live.sourceMode !== "live" || live.spreadsheetId !== "1m8HfLnsrtf3TGFPeJOAfSfSZlBTQyZ6mN4WU_QrIruA" || live.sheetId !== 68391922 || !Array.isArray(live.bills)) {
    throw new Error("ตัวเชื่อมส่งข้อมูลผิดแหล่ง");
  }
  let cloud = {bills:[]}, cloudReadable = !lakroiStoreId();
  if (lakroiStoreId()) {
    try {
      const response = await fetch(lakroiBlobUrl("lakroi/data.json") + "?t=" + Date.now(), {cache:"no-store"});
      if (response.ok) { cloud = await response.json(); cloudReadable = Array.isArray(cloud.bills); }
      else cloudReadable = response.status === 404;
    } catch {}
  }
  const fingerprint = b => JSON.stringify([b.date,b.createdAt,b.branch,b.note,b.amount,b.cashAmount,b.transferAmount,b.thaiAmount]);
  const seeds = new Map(LAKROI_SEED_BILLS.map(b => [b.id,b]));
  const cloudBills = Array.isArray(cloud.bills) ? cloud.bills : [];
  const unmatched = [];
  for (const old of cloudBills) {
    let match = live.bills.find(b => b.id === old.id);
    const seed = seeds.get(old.id);
    if (!match && seed && fingerprint(old) === fingerprint(seed)) {
      const candidates = live.bills.filter(b => fingerprint(b) === fingerprint(seed));
      if(candidates.length === 1) match = candidates[0];
    }
    if (!match || fingerprint(old) !== fingerprint(match)) { unmatched.push(old.id); continue; }
    if (!match.photo && /^https:\/\//.test(old.photo || "")) match.photo = old.photo;
  }
  return {...live,reconciliation:{cloudReadable,unmatchedCount:unmatched.length,unmatchedIds:unmatched},salesWritable:live.salesWritable === true && cloudReadable && unmatched.length === 0};
}
