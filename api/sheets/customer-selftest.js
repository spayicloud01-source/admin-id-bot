import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const result = await callSheetsBridge({
      action: "getCustomerInfo",
      query: "__ADMIN_ID_NO_MATCH__",
    });

    return res.status(200).json({
      ok: true,
      actionSupported: true,
      needsSelection: Boolean(result?.needsSelection),
      matchCount: Array.isArray(result?.matches) ? result.matches.length : null,
      hasInfo: Boolean(result?.info),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      actionSupported: false,
      error: error?.message || String(error),
    });
  }
}
