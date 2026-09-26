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

    const mode = String(req.query?.mode || "").trim();
    if (["today","upcoming","overdue"].includes(mode)) {
      const result = await callSheetsBridge({
        action: "listDueCustomers",
        lineUserId: session.sub,
        dueMode: mode,
      });
      return res.status(200).json({
        ok: true,
        mode,
        items: Array.isArray(result?.items) ? result.items.filter((item) => String(item?.name || "").trim()) : [],
        totalShown: Number(result?.totalShown || 0),
        message: result?.message || "",
      });
    }

    const reminder = await callSheetsBridge({
      action: "getReminderBatch",
      lineUserId: session.sub,
    });

    return res.status(200).json({
      ok: true,
      summary: reminder?.digest ? {
        upcoming: Number(reminder.digest.upcomingCount || 0),
        today: Number(reminder.digest.todayCount || 0),
        overdue: Number(reminder.digest.overdueCount || 0),
        generatedAt: reminder.digest.generatedAt || null,
      } : null,
    });
  } catch (error) {
    if (String(req.query?.mode || "")) {
      return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 180) });
    }
    return res.status(200).json({ ok: true, summary: null, warning: String(error?.message || error).slice(0, 180) });
  }
}
