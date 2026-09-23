import { callSheetsBridge } from "../lib/sheetsBridge.js";

const EXPECTED_BRIDGE_VERSION = "2026.09.23-90";

export default async function handler(req, res) {
  let bridge = {
    reachable: false,
    version: null,
    matchesExpected: false,
  };

  try {
    const result = await callSheetsBridge({ action: "getBridgeVersion" });
    bridge = {
      reachable: true,
      version: result?.version || null,
      matchesExpected: result?.version === EXPECTED_BRIDGE_VERSION,
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

  return res.status(200).json({
    ok: envReady && bridge.reachable,
    service: "Admin ID",
    appVersion: "2026.09.23-90",
    expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
    environment,
    bridge,
    readyForFullTest: envReady && bridge.reachable && bridge.matchesExpected,
  });
}
