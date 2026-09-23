import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok:false, error:"Method Not Allowed" });
  }

  try {
    const result = await callSheetsBridge({
      action:"registerStaff",
      lineUserId:"U_ADMIN_ID_SELFTEST_NOT_REAL",
      staffName:"__ADMIN_ID_SELFTEST_NOT_REAL__"
    });

    const supported = result?.error !== "Unknown action";
    return res.status(supported ? 200 : 500).json({
      ok:supported,
      supported,
      registered:Boolean(result?.registered),
      message:result?.message || "",
      error:result?.error || ""
    });
  } catch (error) {
    return res.status(500).json({
      ok:false,
      supported:false,
      error:error?.message || String(error)
    });
  }
}
