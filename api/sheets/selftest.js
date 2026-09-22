import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const started = Date.now();
    const result = await callSheetsBridge({
      action: "searchCustomer",
      query: "__ADMIN_ID_SELFTEST_NO_MATCH__"
    });

    return res.status(200).json({
      ok: !!result?.ok,
      count: Array.isArray(result?.matches) ? result.matches.length : null,
      elapsedMs: Date.now() - started,
      bridgeError: result?.error || null
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error)
    });
  }
}
