import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { sessionFromRequest } from "../../lib/webAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  try {
    const session = sessionFromRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าเว็บผ่าน LINE OA ใหม่" });

    const mode = ["today","upcoming","overdue"].includes(String(req.query?.mode || ""))
      ? String(req.query.mode) : "today";
    const result = await callSheetsBridge({
      action: "listDueCustomers",
      lineUserId: session.sub,
      dueMode: mode,
    });
    return res.status(200).json({
      ok: true,
      mode,
      items: Array.isArray(result?.items) ? result.items : [],
      totalShown: Number(result?.totalShown || 0),
      message: result?.message || "",
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0,180) });
  }
}
