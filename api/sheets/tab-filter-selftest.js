import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok:false });

  try {
    const result = await callSheetsBridge({
      action:"searchCustomer",
      query:"ภาณุ"
    });

    const sheets = Array.from(new Set(
      (result?.matches || []).map((m) => String(m.sheet || "")).filter(Boolean)
    ));

    return res.status(200).json({
      ok:true,
      matchCount:Array.isArray(result?.matches) ? result.matches.length : 0,
      sheets,
      excludedTabPresent:sheets.some((s) => s === "LINE แจ้งค่าเช่า")
    });
  } catch (error) {
    return res.status(500).json({
      ok:false,
      error:error?.message || String(error)
    });
  }
}
