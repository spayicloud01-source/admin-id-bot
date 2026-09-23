import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const result = {
    ok: false,
    env: {
      appsScriptUrl: Boolean(process.env.GOOGLE_APPS_SCRIPT_URL),
      bridgeSecret: Boolean(process.env.SHEETS_BRIDGE_SECRET),
      lineSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
      lineToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    },
    checks: {},
  };

  try {
    const search = await callSheetsBridge({
      action: "searchCustomer",
      query: "__ADMIN_ID_DIAGNOSTIC_NO_MATCH__",
    });

    result.checks.searchCustomer = {
      ok: Boolean(search?.ok),
      count: Array.isArray(search?.matches) ? search.matches.length : null,
    };
  } catch (error) {
    result.checks.searchCustomer = {
      ok: false,
      error: error?.message || String(error),
    };
  }

  result.ok =
    result.env.appsScriptUrl &&
    result.env.bridgeSecret &&
    result.checks.searchCustomer?.ok === true;

  return res.status(result.ok ? 200 : 500).json(result);
}
