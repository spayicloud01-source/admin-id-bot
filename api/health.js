// release-sync: customer-id-ocr
const HEALTH_SCHEMA_VERSION = 3;
import { callSheetsBridge } from "../lib/sheetsBridge.js";

const EXPECTED_BRIDGE_VERSION = "2026.09.28-121";

export default async function handler(req, res) {
  const deep = String(req.query?.deep || "") === "1";

  const environment = {
    lineChannelSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
    lineAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    sheetsBridgeUrl: Boolean(process.env.GOOGLE_APPS_SCRIPT_URL),
    sheetsBridgeSecret: Boolean(process.env.SHEETS_BRIDGE_SECRET),
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
      appVersion: "2026.09.28-121",
      expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
      environment,
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
      selfTest = await callSheetsBridge({ action: "postDeploySelfTest" });
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
    appVersion: "2026.09.28-121",
    expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
    environment,
    bridge,
    deep: true,
    readyForFullTest,
  });
}
