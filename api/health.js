export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    service: "Admin ID",
    appVersion: "2026.09.23-90",
    expectedBridgeVersion: "2026.09.23-90",
    environment: {
      lineChannelSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
      lineAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      sheetsBridgeUrl: Boolean(process.env.GOOGLE_APPS_SCRIPT_URL),
      sheetsBridgeSecret: Boolean(process.env.SHEETS_BRIDGE_SECRET),
      spreadsheetId: Boolean(process.env.SPREADSHEET_ID),
    },
  });
}
