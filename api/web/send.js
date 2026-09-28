import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { sessionFromRequest } from "../../lib/webAuth.js";
import { paymentQrUrl } from "../../lib/paymentQr.js";

const ALLOWED_ADMIN_ACTIONS = new Set([
  "searchCustomer", "getCustomerInfo", "getCalculatedSummary", "getHistory",
  "addNote", "queueClose", "listReviewQueue", "getReviewQueueItem",
  "resolveReviewQueue", "cancelReviewQueue", "rollbackReviewQueue",
  "listStaff", "listPendingStaff", "getStaffPermissions", "setStaffEnabled",
  "setStaffPermission", "approveStaff", "rejectStaff", "dailyOwnerReport",
  "systemStatus", "getReminderTriggerStatus", "installReminderTrigger",
  "auditSourceSchemas", "auditSourceWriteCapabilities", "getStaffActivity",
  "listPendingCustomerBindings", "resolveCustomerBinding", "cancelCustomerBindings"
]);

function clean(value, max = 300) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

async function pushMessages(to, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ to, messages }),
  });
  if (!response.ok) throw new Error("LINE push failed: " + response.status);
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "0";
}

function paymentFlex(summary = {}, field = "payment") {
  const isClose = field === "close";
  const total = isClose ? Number(summary.calculatedClose || 0) : Number(summary.paymentTotal || 0);
  const qrUrl = paymentQrUrl(summary.source, total);
  const discountAmount = Number(summary.discountAmount || 0);
  const rows = isClose
    ? [
        ["ชื่อ", summary.name || "-"], ["คิว", summary.queue || "-"],
        ["เงินต้น", money(summary.principal) + " บาท"],
        ["ค่าเช่า", money(summary.accumulatedFee) + " บาท"],
        ...(discountAmount > 0 ? [["ส่วนลด", "−" + money(discountAmount) + " บาท"]] : []),
        ["ค่าปรับ", money(summary.lateFee) + " บาท"],
        ["รวมยอดปิดวันนี้", money(total) + " บาท"],
      ]
    : [
        ["ชื่อ", summary.name || "-"], ["คิว", summary.queue || "-"],
        ["ค่าเช่าที่ต้องชำระ", money(summary.accumulatedFee) + " บาท"],
        ...(Number(summary.paidForCycle || 0) > 0 ? [["รับชำระแล้ว", money(summary.paidForCycle) + " บาท"]] : []),
        ["ค่าปรับ", money(summary.lateFee) + " บาท"],
        ["รวมยอดชำระวันนี้", money(total) + " บาท"],
        ["วันครบกำหนด", summary.dueDate || "-"],
      ];
  return {
    type: "flex",
    altText: (isClose ? "ยอดปิด" : "ชำระยอด") + " คิว " + (summary.queue || "-") + " รวม " + money(total) + " บาท",
    contents: {
      type: "bubble", size: "mega",
      header: { type: "box", layout: "vertical", paddingAll: "18px", backgroundColor: isClose ? "#7B3F00" : "#0D5D65", contents: [
        { type: "text", text: isClose ? "สรุปยอดปิดวันนี้" : "สรุปยอดชำระวันนี้", color: "#FFFFFF", size: "lg", weight: "bold" },
        { type: "text", text: "กรุณาตรวจสอบยอดก่อนชำระ", color: "#F3FAFA", size: "xs", margin: "sm" }
      ]},
      ...(qrUrl ? { hero: { type: "image", url: qrUrl, size: "full", aspectRatio: "1:1", aspectMode: "fit", backgroundColor: "#FFFFFF" } } : {}),
      body: { type: "box", layout: "vertical", paddingAll: "18px", contents: [
        ...rows.map(([label, value], index) => ({
          type: "box", layout: "horizontal", spacing: "md", margin: index ? "sm" : "none",
          contents: [
            { type: "text", text: label, size: "sm", color: "#60717B", flex: 5, wrap: true },
            { type: "text", text: String(value), size: "sm", color: index === rows.length - 1 ? "#C2413B" : "#173B46", weight: "bold", align: "end", flex: 5, wrap: true }
          ]
        })),
        { type: "separator", margin: "lg", color: "#DDE9EA" },
        { type: "text", text: qrUrl ? "QR นี้กำหนดยอด " + money(total) + " บาทแล้ว" : "ยังไม่ได้ตั้งค่า QR สำหรับแหล่งข้อมูลนี้ กรุณาติดต่อแอดมิน", size: "xs", color: qrUrl ? "#0D5D65" : "#C2413B", wrap: true, margin: "lg", align: "center" }
      ]},
      ...(qrUrl ? { footer: { type: "box", layout: "vertical", paddingAll: "14px", contents: [
        { type: "button", style: "primary", color: "#0D5D65", height: "sm", action: { type: "uri", label: "เปิด/บันทึก QR", uri: qrUrl } }
      ]}} : {})
    }
  };
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

    const requestedAction = clean(body.action, 60);
    if (ALLOWED_ADMIN_ACTIONS.has(requestedAction)) {
      const result = await callSheetsBridge({
        action: requestedAction,
        lineUserId: session.sub,
        sourceType: "user",
        groupId: "",
        staffName: session.name || "เจ้าของ",
        role: "เจ้าของ",
        query: clean(body.query),
        note: clean(body.note, 1000),
        decision: clean(body.decision, 30),
        targetPermission: clean(body.targetPermission, 100),
        eventType: clean(body.eventType, 100),
        enabled: body.enabled === true,
        permissionEnabled: body.permissionEnabled === true,
        activityToday: body.activityToday === true,
        amount: body.amount == null || body.amount === "" ? null : Number(body.amount),
      });
      return res.status(200).json(result || { ok: true });
    }

    if (requestedAction === "record_payment") {
      const customerQuery = String(body.queue || "").trim();
      const amount = Number(body.amount);
      if (!customerQuery || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ ok: false, error: "กรุณาระบุคิวและยอดชำระให้ถูกต้อง" });
      }
      const result = await callSheetsBridge({ action: "queuePayment", lineUserId: session.sub, query: customerQuery, amount });
      if (result?.needsSelection) {
        return res.status(409).json({ ok: false, needsSelection: true, matches: Array.isArray(result.matches) ? result.matches : [], error: "พบลูกค้าหลายรายการ กรุณาระบุคิวให้ชัดเจน" });
      }
      if (result?.queued === false) {
        return res.status(400).json({ ok: false, duplicate: !!result.duplicate, duplicateRowNo: result.duplicateRowNo || null, error: result.message || "ยังส่งเข้าคิวตรวจสอบไม่ได้" });
      }
      return res.status(200).json({ ok: true, queued: true, rowNo: result?.rowNo || null, customer: result?.customer || null, amount, message: result?.message || "ส่งเข้าคิวตรวจสอบแล้ว" });
    }
    const field = String(body.field || "").trim();
    const customMessage = clean(body.customMessage, 4000);
    const queue = String(body.queue || "").trim();
    const queues = Array.isArray(body.queues) ? body.queues.map(String).join(",") : String(body.queues || "").trim();

    let targets = Array.isArray(body.targets) ? body.targets : [];
    if (!targets.length && body.source && body.sheet) {
      targets = [{ source: body.source, sheet: body.sheet }];
    }
    if (!targets.length && queue) {
      targets = [
        { source: "v6", sheet: "V6/10-69" },
        { source: "v1/v3", sheet: "v3/10-69" }
      ];
    }
    targets = targets
      .map((x) => ({ source: String(x?.source || "").trim(), sheet: String(x?.sheet || "").trim() }))
      .filter((x) => x.source && x.sheet);

    const seenTargets = new Set();
    targets = targets.filter((x) => {
      const key = x.source + "|" + x.sheet;
      if (seenTargets.has(key)) return false;
      seenTargets.add(key);
      return true;
    });

    if (!targets.length || !["payment","close","custom"].includes(field) || (field === "custom" && !customMessage)) {
      return res.status(400).json({ ok: false, error: "ข้อมูลส่งแจ้งเตือนไม่ครบ" });
    }

    let prepared = 0, sent = 0, failed = 0;
    const details = [];

    for (const target of targets) {
      const batch = await callSheetsBridge({
        action: "buildCustomerNotificationBatch",
        lineUserId: session.sub,
        source: target.source,
        sheet: target.sheet,
        field,
        queue,
        queues,
        customMessage,
      });

      if (batch?.allowed === false) {
        details.push({ ...target, prepared: 0, sent: 0, failed: 0, error: batch.message || "ไม่มีสิทธิ์" });
        continue;
      }

      const items = Array.isArray(batch?.items) ? batch.items : [];
      prepared += items.length;
      let targetSent = 0, targetFailed = 0;

      for (const item of items) {
        let ok = false;
        try {
          const messages = field === "custom"
            ? [{ type: "text", text: item.message }]
            : [paymentFlex(item.summary || {}, field)];
          await pushMessages(item.lineUserId, messages);
          ok = true;
          sent++;
          targetSent++;
        } catch (error) {
          failed++;
          targetFailed++;
          console.warn("Web customer notification failed", target.source, target.sheet, item.queue, error);
        }
        try {
          await callSheetsBridge({ action: "markCustomerReminderSent", rowNo: item.rowNo, sent: ok });
        } catch (error) {
          console.warn("Web notification mark failed", item.rowNo, error);
        }
      }

      details.push({
        ...target,
        prepared: items.length,
        sent: targetSent,
        failed: targetFailed,
        message: batch?.message || "",
      });
    }

    return res.status(200).json({
      ok: true,
      field,
      targetCount: targets.length,
      prepared,
      sent,
      failed,
      details,
      message: prepared
        ? ("ส่งสำเร็จ " + sent + " / " + prepared + " ราย จาก " + targets.length + " ชีต")
        : ("ไม่มีรายการใหม่ใน " + targets.length + " ชีต"),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 180) });
  }
}
