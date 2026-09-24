import { callSheetsBridge } from "../../lib/sheetsBridge.js";

async function pushMessages(to, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !to || !Array.isArray(messages) || !messages.length) {
    return { ok: false, skipped: true };
  }
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${body}`);
  }
  return { ok: true };
}

async function pushText(to, text) {
  return pushMessages(to, [{ type: "text", text }]);
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

function customerReminderMessage(item) {
  return {
    type: "text",
    text: item.message || [
      "แจ้งเตือนกำหนดครบวันชำระ",
      "ชื่อ: " + (item.name || "-"),
      "คิว: " + (item.queue || "-"),
      "กำหนดครบวันชำระวันนี้: " + (item.dueDate || "-"),
    ].join("\n"),
    quickReply: {
      items: [
        ["ชำระยอด", "ชำระยอด"],
        ["ยอดปิด", "ยอดปิด"],
        ["สถานะ", "สถานะ"],
        ["ข้อมูล", "ข้อมูล"],
        ["สิทธิ์ส่วนลด", "สิทธิ์ส่วนลด"],
        ["ติดต่อแอดมิน", "ติดต่อแอดมิน"],
      ].map(([label, text]) => ({
        type: "action",
        action: { type: "message", label, text },
      })),
    },
  };
}

async function sendCustomerReminders() {
  let batch;
  try {
    batch = await callSheetsBridge({ action: "getCustomerReminderBatch" });
  } catch (error) {
    // Keep the existing internal reminder working while bridge 102 is being published.
    console.warn("Customer reminder bridge action unavailable", error);
    return { sent: 0, failed: 0, total: 0, skipped: true, reason: "bridge-not-ready" };
  }
  const items = Array.isArray(batch?.items) ? batch.items : [];
  if (!items.length) {
    return { sent: 0, failed: 0, total: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const item of items) {
    let ok = false;
    try {
      const result = await pushMessages(item.lineUserId, [customerReminderMessage(item)]);
      ok = result?.ok === true;
      if (ok) sent += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      console.warn("Customer reminder push failed", item.queue, error);
    }

    try {
      await callSheetsBridge({
        action: "markCustomerReminderSent",
        rowNo: item.rowNo,
        sent: ok,
      });
    } catch (error) {
      console.warn("Customer reminder mark failed", item.rowNo, error);
    }
  }

  return { sent, failed, total: items.length };
}

async function sendInternalDigest() {
  const batch = await callSheetsBridge({ action: "getReminderBatch" });
  if (batch.alreadySent) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
      lastSentAt: batch.lastSentAt || null,
    };
  }

  const recipients = Array.isArray(batch.recipients) ? batch.recipients : [];
  const text = buildDigest(batch.digest);
  if (!text || !recipients.length) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const results = await Promise.allSettled(recipients.map((id) => pushText(id, text)));
  const sent = results.filter((x) => x.status === "fulfilled" && x.value?.ok).length;
  const failed = results.length - sent;

  if (sent > 0) {
    await callSheetsBridge({
      action: "markReminderSent",
      sent,
      failed,
    });
  }

  return { sent, failed, skipped: false };
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

    // Customer reminders and the internal owner digest are independent.
    // A customer due reminder can still go out even if today's owner digest was already sent.
    const [customer, internal] = await Promise.all([
      sendCustomerReminders(),
      sendInternalDigest(),
    ]);

    return res.status(200).json({
      ok: true,
      customer,
      internal,
      sent: Number(customer.sent || 0) + Number(internal.sent || 0),
      failed: Number(customer.failed || 0) + Number(internal.failed || 0),
    });
  } catch (error) {
    console.error("Reminder run failed", error);
    return res.status(500).json({
      ok: false,
      error: "Reminder run failed",
      detail: String(error?.message || error).slice(0, 200),
    });
  }
}
