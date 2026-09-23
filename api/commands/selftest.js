import { parseCommand } from "../../lib/commands.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const cases = [
    ["คิวตรวจสอบ", "listReviewQueue", ""],
    ["รออนุมัติ", "listPendingStaff", ""],
    ["สรุปยอด 101", "getCalculatedSummary", "101"],
    ["สิทธิ์ส่วนลด 101", "getCalculatedSummary", "101"],
    ["บันทึกชำระ 101 1,250", "queuePayment", "101"],
    ["ดูคิว 12", "getReviewQueueItem", "12"],
    ["ผ่านคิว 12", "resolveReviewQueue", "12"],
    ["ไม่ผ่านคิว 12", "resolveReviewQueue", "12"],
    ["ระงับ สุธิดา", "setStaffEnabled", "สุธิดา"],
    ["เปิดใช้ สุธิดา", "setStaffEnabled", "สุธิดา"],
    ["ให้สิทธิ์ สุธิดา ดูรายงาน", "setStaffPermission", "สุธิดา"],
    ["ถอนสิทธิ์ สุธิดา ดูรายงาน", "setStaffPermission", "สุธิดา"],
    ["ครบกำหนดวันนี้", "listDueCustomers", ""],
    ["ค้างชำระทั้งหมด", "listDueCustomers", ""],
    ["เปิดกลุ่ม", "setGroupEnabled", ""],
    ["ปิดกลุ่ม", "setGroupEnabled", ""],
    ["ทดสอบแจ้งเตือน", "getReminderBatch", ""],
    ["ตรวจชีตต้นทาง", "auditSourceSchemas", ""],
  ];

  const tests = cases.map(([input, action, query]) => {
    const parsed = parseCommand(input);
    return {
      input,
      pass: parsed?.action === action && String(parsed?.query || "") === query,
      action: parsed?.action || null,
      query: parsed?.query || "",
    };
  });

  const payment = parseCommand("บันทึกชำระ 101 1,250");
  tests.push({
    input: "payment amount parser",
    pass: payment?.amount === 1250,
    amount: payment?.amount ?? null,
  });

  const permission = parseCommand("ให้สิทธิ์ สุธิดา ดูรายงาน");
  tests.push({
    input: "permission parser",
    pass: permission?.targetPermission === "ดูรายงาน" && permission?.permissionEnabled === true,
    targetPermission: permission?.targetPermission || null,
  });

  const ok = tests.every((x) => x.pass);
  return res.status(ok ? 200 : 500).json({ ok, tests });
}
