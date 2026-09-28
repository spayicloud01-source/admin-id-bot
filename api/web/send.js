import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { sessionFromRequest } from "../../lib/webAuth.js";
import { paymentQrUrl } from "../../lib/paymentQr.js";
import crypto from "node:crypto";

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

function manualRecipientSecret() {
  const value = process.env.SHEETS_BRIDGE_SECRET;
  if (!value) throw new Error("SHEETS_BRIDGE_SECRET is not configured");
  return value;
}

function signManualRecipient(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", manualRecipientSecret()).update(body).digest("base64url");
  return body + "." + sig;
}

function verifyManualRecipient(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", manualRecipientSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.lineUserId || !payload?.queue || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function resolveManualRecipient(session, queue, preferred = {}) {
  let bridgeUpgradeRequired = false;

  // v122: resolve the active LINE binding directly from the binding sheet.
  try {
    const direct = await callSheetsBridge({
      action: "resolveCustomerNotificationRecipient",
      lineUserId: session.sub,
      queue,
    });
    if (direct?.found && direct?.recipient?.lineUserId) {
      return {
        lineUserId: direct.recipient.lineUserId,
        queue: String(direct.recipient.queue || queue),
        name: String(direct.recipient.name || ""),
        source: String(direct.recipient.source || ""),
        sheet: String(direct.recipient.sheet || ""),
        rowNo: null,
      };
    }
    if (direct?.needsSelection) {
      const error = new Error(direct.message || "พบ LINE ที่ผูกกับคิวนี้มากกว่า 1 รายการ");
      error.code = "AMBIGUOUS_RECIPIENT";
      throw error;
    }
    if (direct && direct.found === false) return null;
  } catch (error) {
    if (error?.code === "AMBIGUOUS_RECIPIENT") throw error;
    bridgeUpgradeRequired = /Unknown action/i.test(String(error?.message || error));
    if (!bridgeUpgradeRequired) {
      console.warn("Direct recipient lookup failed; falling back", error?.message);
    }
  }

  // Temporary v121 fallback. If the calculated summary already tells us
  // the exact source/sheet, probe only that binding target.
  const preferredSource = String(preferred.source || preferred.customer?.source || "").trim();
  const preferredSheet = String(preferred.sheet || preferred.customer?.sheet || "").trim();
  const targets = preferredSource && preferredSheet
    ? [{ source: preferredSource, sheet: preferredSheet }]
    : [
        { source: "v6", sheet: "V6/10-69" },
        { source: "v1/v3", sheet: "v3/10-69" },
      ];
  for (const target of targets) {
    try {
      const batch = await callSheetsBridge({
        action: "buildCustomerNotificationBatch",
        lineUserId: session.sub,
        source: target.source,
        sheet: target.sheet,
        field: "payment",
        queue,
        queues: "",
      });
      const item = Array.isArray(batch?.items) ? batch.items[0] : null;
      if (!item?.lineUserId) continue;
      return {
        lineUserId: item.lineUserId,
        queue: String(item.queue || queue),
        name: String(item.name || ""),
        source: target.source,
        sheet: target.sheet,
        rowNo: item.rowNo || null,
      };
    } catch (error) {
      console.warn("Legacy recipient lookup failed", target.source, target.sheet, error?.message);
    }
  }

  if (bridgeUpgradeRequired) {
    const error = new Error("Apps Script ยังเป็น v121 ต้อง Deploy v122 ก่อน จึงจะค้นหา LINE ที่ผูกกับคิวได้แบบตรง");
    error.code = "BRIDGE_UPGRADE_REQUIRED";
    throw error;
  }
  return null;
}

async function getBoundCustomerSummary(queue, recipient) {
  const self = await callSheetsBridge({
    action: "getCustomerSelf",
    lineUserId: recipient.lineUserId,
    field: "payment",
  });
  if (!self?.bound || !Array.isArray(self.items)) return null;

  const queueKey = String(queue || "").trim().toLowerCase();
  const sourceKey = String(recipient.source || "").trim().toLowerCase();
  const matches = self.items.filter((item) => {
    const sameQueue = String(item?.queue || "").trim().toLowerCase() === queueKey;
    const itemSource = String(item?.source || "").trim().toLowerCase();
    return sameQueue && (!sourceKey || !itemSource || itemSource === sourceKey);
  });
  if (matches.length !== 1) return null;

  const item = matches[0];
  const source = item.source || recipient.source || "";
  const sheet = recipient.sheet || "";
  const name = item.name || recipient.name || "";
  const resolvedQueue = item.queue || recipient.queue || queue;
  return {
    ...item,
    source,
    sheet,
    queue: resolvedQueue,
    name,
    customer: {
      source,
      sheet,
      queue: resolvedQueue,
      name,
    },
  };
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

    // Manual notification preview already knows the customer's active LINE binding.
    // Reuse that exact binding to calculate one customer's totals instead of scanning
    // both approved payment sources first. This is read-only and falls back to the
    // existing broad lookup when the bound-customer path is unavailable.
    // This fast path is read-only; payment writes and approvals are unchanged.
    if (requestedAction === "getCalculatedSummary" && body.resolveRecipient === true) {
      const queue = clean(body.query, 100);
      if (queue) {
        const recipient = await resolveManualRecipient(session, queue);
        if (recipient) {
          try {
            const summary = await getBoundCustomerSummary(queue, recipient);
            if (summary) {
              const paymentTotal = Number(summary.paymentTotal ?? ((Number(summary.accumulatedFee || summary.fee || 0) + Number(summary.lateFee || 0)) - Number(summary.paidForCycle || 0)));
              const closeTotal = Number(summary.calculatedClose || 0);
              return res.status(200).json({
                ok: true,
                summary,
                qr: {
                  payment: paymentQrUrl(summary.source, paymentTotal),
                  close: paymentQrUrl(summary.source, closeTotal),
                },
                recipientToken: signManualRecipient({
                  lineUserId: recipient.lineUserId,
                  queue: recipient.queue,
                  source: recipient.source,
                  sheet: recipient.sheet,
                  rowNo: recipient.rowNo || null,
                  summary,
                  exp: Date.now() + 30 * 60 * 1000,
                }),
              });
            }
          } catch (error) {
            console.warn("Bound customer summary lookup failed; falling back", queue, error?.message);
          }
        }
      }
    }

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
      if (requestedAction === "getCalculatedSummary" && result?.summary) {
        const s = result.summary;
        const source = s.source || s.customer?.source || "";
        const paymentTotal = Number(s.paymentTotal ?? ((Number(s.accumulatedFee || s.fee || 0) + Number(s.lateFee || 0)) - Number(s.paidForCycle || 0)));
        const closeTotal = Number(s.calculatedClose || 0);
        result.qr = {
          payment: paymentQrUrl(source, paymentTotal),
          close: paymentQrUrl(source, closeTotal),
        };

        if (body.resolveRecipient === true) {
          const queue = clean(body.query, 100);
          const recipient = await resolveManualRecipient(session, queue, s);
          if (recipient) {
            const summaryForSend = {
              ...(s.customer || {}),
              ...s,
              source: s.source || s.customer?.source || recipient.source,
              sheet: s.customer?.sheet || recipient.sheet,
              queue: s.queue || s.customer?.queue || recipient.queue,
              name: s.name || s.customer?.name || recipient.name,
            };
            result.recipientToken = signManualRecipient({
              lineUserId: recipient.lineUserId,
              queue: recipient.queue,
              source: recipient.source,
              sheet: recipient.sheet,
              rowNo: recipient.rowNo || null,
              summary: summaryForSend,
              exp: Date.now() + 30 * 60 * 1000,
            });
          }
        }
      }
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

    const manualRecipient = body.recipientToken ? verifyManualRecipient(body.recipientToken) : null;
    if (manualRecipient && queue && String(manualRecipient.queue).trim() === queue) {
      try {
        const messages = field === "custom"
          ? [{ type: "text", text: customMessage }]
          : [paymentFlex(manualRecipient.summary || {
              source: manualRecipient.source,
              queue: manualRecipient.queue,
              name: "",
            }, field)];
        await pushMessages(manualRecipient.lineUserId, messages);
        if (manualRecipient.rowNo) {
          try {
            await callSheetsBridge({ action: "markCustomerReminderSent", rowNo: manualRecipient.rowNo, sent: true });
          } catch (error) {
            console.warn("Could not mark manual notification sent", manualRecipient.rowNo, error?.message);
          }
        }
        console.info("Manual customer notification sent directly", {
          queue,
          field,
          source: manualRecipient.source,
          sheet: manualRecipient.sheet,
        });
        return res.status(200).json({
          ok: true,
          field,
          targetCount: 1,
          prepared: 1,
          sent: 1,
          failed: 0,
          message: "ส่งสำเร็จ 1 / 1 ราย",
        });
      } catch (error) {
        console.warn("Direct manual customer notification failed", queue, error?.message);
        return res.status(502).json({ ok: false, error: "ส่ง LINE ไม่สำเร็จ: " + String(error?.message || error).slice(0, 120) });
      }
    }

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
      const bridgeField = field;
      const batch = await callSheetsBridge({
        action: "buildCustomerNotificationBatch",
        lineUserId: session.sub,
        source: target.source,
        sheet: target.sheet,
        field: bridgeField,
        queue,
        queues,
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
          let messages;
          if (field === "custom") {
            messages = [{ type: "text", text: customMessage }];
          } else {
            let summary = item.summary || null;
            if (!summary || !summary.queue) {
              const calculated = await callSheetsBridge({
                action: "getCalculatedSummary",
                lineUserId: session.sub,
                sourceType: "user",
                groupId: "",
                query: item.queue,
              });
              if (calculated?.summary) {
                const s = calculated.summary;
                summary = {
                  ...(s.customer || {}),
                  ...s,
                  source: s.source || s.customer?.source || target.source,
                  sheet: s.customer?.sheet || target.sheet,
                  queue: s.queue || s.customer?.queue || item.queue,
                  name: s.name || s.customer?.name || item.name || "",
                };
              }
            }
            messages = [paymentFlex(summary || { source: target.source, queue: item.queue, name: item.name }, field)];
          }
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
