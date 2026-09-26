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

    const [sheets, reminder] = await Promise.all([
      callSheetsBridge({ action: "listCustomerNotificationSheets", lineUserId: session.sub }),
      callSheetsBridge({ action: "getReminderBatch", lineUserId: session.sub }).catch(() => null),
    ]);

    if (sheets?.allowed === false) return res.status(403).json({ ok: false, error: sheets.message || "ไม่มีสิทธิ์" });
    return res.status(200).json({
      ok: true,
      owner: { name: session.name || "เจ้าของ" },
      sheets: Array.isArray(sheets?.items) ? sheets.items : [],
      summary: reminder?.digest ? {
        upcoming: Number(reminder.digest.upcomingCount || 0),
        today: Number(reminder.digest.todayCount || 0),
        overdue: Number(reminder.digest.overdueCount || 0),
        generatedAt: reminder.digest.generatedAt || null,
      } : null,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 180) });
  }
}
