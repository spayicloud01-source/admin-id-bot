import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { sessionFromRequest } from "../../lib/webAuth.js";

async function pushText(to, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!response.ok) throw new Error("LINE push failed: " + response.status);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  try {
    const session = sessionFromRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าเว็บผ่าน LINE OA ใหม่" });

    const body = typeof req.body === "object" && req.body ? req.body : {};
    const source = String(body.source || "").trim();
    const sheet = String(body.sheet || "").trim();
    const field = String(body.field || "").trim();
    const queue = String(body.queue || "").trim();
    const queues = Array.isArray(body.queues) ? body.queues.map(String).join(",") : String(body.queues || "").trim();
    if (!source || !sheet || !["close","outstanding","due"].includes(field)) {
      return res.status(400).json({ ok: false, error: "ข้อมูลส่งแจ้งเตือนไม่ครบ" });
    }

    const batch = await callSheetsBridge({
      action: "buildCustomerNotificationBatch",
      lineUserId: session.sub,
      source, sheet, field, queue, queues,
    });
    if (batch?.allowed === false) return res.status(403).json({ ok: false, error: batch.message || "ไม่มีสิทธิ์" });

    const items = Array.isArray(batch?.items) ? batch.items : [];
    let sent = 0, failed = 0;
    for (const item of items) {
      let ok = false;
      try {
        await pushText(item.lineUserId, item.message);
        ok = true; sent++;
      } catch (error) {
        failed++;
        console.warn("Web customer notification failed", item.queue, error);
      }
      try {
        await callSheetsBridge({ action: "markCustomerReminderSent", rowNo: item.rowNo, sent: ok });
      } catch (error) {
        console.warn("Web notification mark failed", item.rowNo, error);
      }
    }

    return res.status(200).json({
      ok: true, source, sheet, field,
      prepared: items.length, sent, failed,
      message: items.length ? ("ส่งสำเร็จ " + sent + " / " + items.length + " ราย") : (batch?.message || "ไม่มีรายการใหม่"),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 180) });
  }
}
