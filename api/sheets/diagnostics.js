import { callSheetsBridge, getBridgeRoutingStatus, inspectBridgeRole } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const bridgeRouting = getBridgeRoutingStatus();
  const result = {
    ok: false,
    env: {
      appsScriptUrl: bridgeRouting.legacyFallback ||
        (bridgeRouting.customer && bridgeRouting.payment && bridgeRouting.notify),
      bridgeSecret: bridgeRouting.sharedSecret ||
        (bridgeRouting.customerSecret && bridgeRouting.paymentSecret && bridgeRouting.notifySecret),
      lineSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
      lineToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    },
    bridgeRouting,
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

  result.checks.roles = {};
  const roles = ["customer", "payment", "notify"];
  await Promise.all(roles.map(async (role) => {
    try {
      const bridge = await inspectBridgeRole(role);
      result.checks.roles[role] = { ok: bridge?.ok === true && bridge.role === role && bridge.version === "2026.10.03-131", role: bridge.role, version: bridge.version };
    } catch (error) {
      result.checks.roles[role] = { ok: false, error: String(error?.message || error).slice(0, 160) };
    }
  }));

  result.ok =
    result.env.appsScriptUrl &&
    result.env.bridgeSecret &&
    result.checks.searchCustomer?.ok === true &&
    roles.every((role) => result.checks.roles[role]?.ok === true);

  return res.status(result.ok ? 200 : 500).json(result);
}

