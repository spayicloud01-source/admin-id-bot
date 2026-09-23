import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok:false });
  try {
    const result = await callSheetsBridge({
      action:"checkAccess",
      lineUserId:"__NO_SUCH_USER__",
      permission:"ดูข้อมูลลูกค้า"
    });
    return res.status(200).json({ ok:true, supported:true, denied:result?.allowed === false });
  } catch (error) {
    return res.status(500).json({ ok:false, supported:false, error:error?.message || String(error) });
  }
}