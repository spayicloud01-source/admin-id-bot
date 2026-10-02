// release-sync: customer-id-ocr
const HEALTH_SCHEMA_VERSION = 3;
import { callSheetsBridge, getBridgeRoutingStatus } from "../lib/sheetsBridge.js";

const EXPECTED_BRIDGE_VERSION = "2026.10.03-130";
const EXPECTED_ACTIVE_SOURCES = 2;

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
      appVersion: "2026.10.03-130",
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
    appVersion: "2026.10.03-130",
    expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
    environment,
    bridgeRouting,
    bridge,
    deep: true,
    readyForFullTest,
  });
}

