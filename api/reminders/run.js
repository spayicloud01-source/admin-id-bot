import { callSheetsBridge } from "../../lib/sheetsBridge.js";

async function pushMessage(to, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !to || !text) return { ok: false, skipped: true };
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${body}`);
  }
  return { ok: true };
}

function formatItem(x, mode) {
  const lag = Number(x.daysDelta || 0);
  const suffix = mode === "overdue"
    ? `ค้าง ${Math.abs(lag)} วัน`
    : mode === "upcoming"
      ? `อีก ${lag} วัน`
      : "วันนี้";
  return `• ${x.name || "-"}${x.queue ? " | คิว " + x.queue : ""} | ${x.dueDate || "-"} | ${suffix}`;
}

function buildDigest(d) {
  if (!d) return "";
  const parts = [
    "แจ้งเตือน Admin ID",
    `ใกล้ครบกำหนด: ${d.upcomingCount || 0}`,
    ...(d.upcoming || []).slice(0, 5).map((x) => formatItem(x, "upcoming")),
    "",
    `ครบกำหนดวันนี้: ${d.todayCount || 0}`,
    ...(d.today || []).slice(0, 5).map((x) => formatItem(x, "today")),
    "",
    `ค้างชำระ: ${d.overdueCount || 0}`,
    ...(d.overdue || []).slice(0, 5).map((x) => formatItem(x, "overdue")),
    "",
    `อัปเดต ${d.generatedAt || "-"}`,
  ];
  return parts.join("\n").slice(0, 4900);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "Admin ID reminders" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const expected = process.env.SHEETS_BRIDGE_SECRET;
    if (!expected || body.secret !== expected) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const batch = await callSheetsBridge({ action: "getReminderBatch" });
    if (batch.alreadySent) {
      return res.status(200).json({
        ok: true,
        sent: 0,
        skipped: true,
        message: "Reminder already sent today",
        lastSentAt: batch.lastSentAt || null
      });
    }

    const recipients = Array.isArray(batch.recipients) ? batch.recipients : [];
    const text = buildDigest(batch.digest);
    if (!text || !recipients.length) {
      return res.status(200).json({ ok: true, sent: 0, message: "No recipients or digest" });
    }

    const results = await Promise.allSettled(recipients.map((id) => pushMessage(id, text)));
    const sent = results.filter((x) => x.status === "fulfilled" && x.value?.ok).length;
    const failed = results.length - sent;

    if (sent > 0) {
      await callSheetsBridge({
        action: "markReminderSent",
        sent,
        failed
      });
    }

    return res.status(200).json({ ok: true, sent, failed });
  } catch (error) {
    console.error("Reminder run failed", error);
    return res.status(500).json({ ok: false, error: "Reminder run failed" });
  }
}
