// release-sync: customer-id-ocr
const HEALTH_SCHEMA_VERSION = 2;
import { callSheetsBridge } from "../lib/sheetsBridge.js";

const EXPECTED_BRIDGE_VERSION = "2026.09.28-121";

export default async function handler(req, res) {
  const deep = String(req.query?.deep || "") === "1";
  let bridge = {
    reachable: false,
    version: null,
    matchesExpected: false,
  };

  try {
    const result = await callSheetsBridge({ action: "getBridgeVersion" });
    let selfTest = null;
    if (deep) {
      try {
        selfTest = await callSheetsBridge({ action: "postDeploySelfTest" });
      } catch (error) {
        selfTest = {
          ok: false,
          error: String(error?.message || error).slice(0, 160),
        };
      }
    }

    bridge = {
      reachable: true,
      version: result?.version || null,
      matchesExpected: result?.version === EXPECTED_BRIDGE_VERSION,
      ...(deep ? { selfTest } : {}),
    };
  } catch (error) {
    bridge.error = String(error?.message || error).slice(0, 160);
  }

  const environment = {
    lineChannelSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
    lineAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    sheetsBridgeUrl: Boolean(process.env.GOOGLE_APPS_SCRIPT_URL),
    sheetsBridgeSecret: Boolean(process.env.SHEETS_BRIDGE_SECRET),
    spreadsheetId: Boolean(process.env.SPREADSHEET_ID),
  };

  const envReady = Object.values(environment).every(Boolean);
  const lightweightReady =
    envReady &&
    bridge.reachable &&
    bridge.matchesExpected;
  const readyForFullTest = deep
    ? lightweightReady && bridge.selfTest?.ok === true
    : lightweightReady;

  res.setHeader("Cache-Control", "private, max-age=15");
  return res.status(200).json({
    ok: lightweightReady,
    service: "Admin ID",
    healthSchemaVersion: HEALTH_SCHEMA_VERSION,
    appVersion: "2026.09.28-121",
    expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
    environment,
    bridge,
    deep,
    readyForFullTest,
  });
}
