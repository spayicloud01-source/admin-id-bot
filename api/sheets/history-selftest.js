import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok:false });
  try {
    const result = await callSheetsBridge({ action:"getHistory", query:"__ADMIN_ID_NO_MATCH__" });
    return res.status(200).json({ ok:true, supported:true, items:Array.isArray(result?.items) ? result.items.length : null });
  } catch (error) {
    return res.status(500).json({ ok:false, supported:false, error:error?.message || String(error) });
  }
}