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
    return res.status(200).json({ ok: true, summary: null, warning: String(error?.message || error).slice(0, 180) });
  }
}
