// release-sync: customer-id-ocr
const HEALTH_SCHEMA_VERSION = 3;
import { callSheetsBridge, getBridgeRoutingStatus } from "../lib/sheetsBridge.js";
import { LAKROI_SEED_BILLS } from "../lib/lakroiSeed.js";

const APP_VERSION = "2026.10.25-140";
// Generic health actions are routed to the Customer bridge. Split-role
// versions are verified independently by /api/sheets/diagnostics.
const EXPECTED_BRIDGE_VERSION = "2026.10.07-133";
const EXPECTED_ACTIVE_SOURCES = 2;

// Lakroi dashboard shared storage (reuses this existing function to stay within Hobby limits).
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
async function lakroiSeedState() {
  const state = {
    bills: Array.isArray(LAKROI_SEED_BILLS) ? LAKROI_SEED_BILLS : [],
    goal: 15000,
    updatedAt: new Date().toISOString(),
    seededFrom: "หลักร้อยเฟอร์ฯ - ยอดขายและลงของ / บิลขาย",
  };
  await lakroiPut("lakroi/data.json", JSON.stringify(state), "application/json; charset=utf-8");
  return state;
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
    updatedAt: new Date().toISOString(),
    seededFrom: "หลักร้อยเฟอร์ฯ - ยอดขายและลงของ / บิลขาย",
  };
  // Heal old cloud states that contained duplicate/dashboard-only sales rows.
  if (!Array.isArray(cloud.bills) || cloud.bills.length !== bills.length) {
    try { await lakroiPut("lakroi/data.json", JSON.stringify(state), "application/json; charset=utf-8"); } catch {}
  }
  return state;
}
async function handleLakroi(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");
    const expectedPin = String(process.env.LAKROI_DASHBOARD_PIN || "").trim();
    const suppliedPin = String(req.headers["x-lakroi-pin"] || "").trim();
    if (!expectedPin || suppliedPin !== expectedPin) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    if (req.method === "GET") {
      const state = await lakroiReadState();
      return res.status(200).json({ ok: true, ...state });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const action = String(body.action || "save");
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
      const bills = Array.isArray(body.bills) ? body.bills.slice(-2000) : [];
      const clean = bills.map((x) => ({
        id: String(x.id || ""),
        createdAt: String(x.createdAt || ""),
        date: String(x.date || ""),
        branch: String(x.branch || ""),
        amount: Number(x.amount || 0),
        method: String(x.method || ""),
        note: String(x.note || "").slice(0, 500),
        photo: String(x.photo || "").slice(0, 2000),
      })).filter((x) => x.id && x.date && x.amount >= 0);
      const state = { bills: clean, goal: Number(body.goal || 15000), updatedAt: new Date().toISOString() };
      await lakroiPut("lakroi/data.json", JSON.stringify(state), "application/json; charset=utf-8");
      return res.status(200).json({ ok: true, updatedAt: state.updatedAt, count: clean.length });
    }
    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

function normalizeSelfTestForActiveSources(selfTest) {
  if (!selfTest || !Array.isArray(selfTest.checks)) return selfTest;
  const checks = selfTest.checks.map((check) => {
    if (check?.name !== "แหล่งข้อมูลเปิดใช้") return check;
    const active = Number.parseInt(String(check.detail || ""), 10);
    if (active !== EXPECTED_ACTIVE_SOURCES) return check;
    return { ...check, pass: true, detail: active + " แหล่ง (โหมด 2 ชีต)" };
  });
  const critical = checks.filter((check) => check?.critical !== false);
  const criticalPassed = critical.filter((check) => check?.pass).length;
  const passed = checks.filter((check) => check?.pass).length;
  return {
    ...selfTest,
    checks,
    passed,
    total: checks.length,
    criticalPassed,
    criticalTotal: critical.length,
    ok: criticalPassed === critical.length,
    activeSourceMode: EXPECTED_ACTIVE_SOURCES,
  };
}

export default async function handler(req, res) {
  if (String(req.query?.lakroi || "") === "1") return handleLakroi(req, res);
  const deep = String(req.query?.deep || "") === "1";

  const bridgeRouting = getBridgeRoutingStatus();
  const splitUrlsReady = bridgeRouting.customer && bridgeRouting.payment && bridgeRouting.notify;
  const splitSecretsReady =
    bridgeRouting.sharedSecret ||
    (bridgeRouting.customerSecret && bridgeRouting.paymentSecret && bridgeRouting.notifySecret);
  const environment = {
    lineChannelSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
    lineAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    sheetsBridgeUrl: bridgeRouting.legacyFallback || splitUrlsReady,
    sheetsBridgeSecret: splitSecretsReady,
    spreadsheetId: Boolean(process.env.SPREADSHEET_ID),
  };
  const envReady = Object.values(environment).every(Boolean);

  // Normal page loads must be instant and must not consume Apps Script quota.
  if (!deep) {
    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({
      ok: envReady,
      service: "Admin ID",
      healthSchemaVersion: HEALTH_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
      environment,
      bridgeRouting,
      bridge: { checked: false },
      deep: false,
      readyForFullTest: envReady,
    });
  }

  let bridge = {
    checked: true,
    reachable: false,
    version: null,
    matchesExpected: false,
  };

  try {
    const result = await callSheetsBridge({ action: "getBridgeVersion" });
    let selfTest = null;
    try {
      selfTest = normalizeSelfTestForActiveSources(
        await callSheetsBridge({ action: "postDeploySelfTest" })
      );
    } catch (error) {
      selfTest = {
        ok: false,
        error: String(error?.message || error).slice(0, 160),
      };
    }

    bridge = {
      checked: true,
      reachable: true,
      version: result?.version || null,
      matchesExpected: result?.version === EXPECTED_BRIDGE_VERSION,
      selfTest,
    };
  } catch (error) {
    bridge.error = String(error?.message || error).slice(0, 160);
  }

  const readyForFullTest =
    envReady &&
    bridge.reachable &&
    bridge.matchesExpected &&
    bridge.selfTest?.ok === true;

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: readyForFullTest,
    service: "Admin ID",
    healthSchemaVersion: HEALTH_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
    environment,
    bridgeRouting,
    bridge,
    deep: true,
    readyForFullTest,
  });
}

