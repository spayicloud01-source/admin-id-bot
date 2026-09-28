import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { sessionFromRequest } from "../../lib/webAuth.js";

const ALLOWED_ACTIONS = new Set([
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const session = sessionFromRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าเว็บผ่าน LINE OA ใหม่" });

    const body = typeof req.body === "object" && req.body ? req.body : {};
    const action = clean(body.action, 60);
    if (!ALLOWED_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "คำสั่งหน้าเว็บนี้ไม่ได้รับอนุญาต" });
    }

    const payload = {
      action,
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
    };

    const result = await callSheetsBridge(payload);
    return res.status(200).json(result || { ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 220) });
  }
}
