import { parseCommand } from "../../lib/commands.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const cases = [
    ["คิวตรวจสอบ", "listReviewQueue", ""],
    ["ลูกค้ารออนุมัติ", "listPendingCustomerBindings", ""],
    ["อ่านบัตรล่าสุด", "getRecentIdentityImages", ""],
    ["อ่านบัตรล่าสุด 101", "getRecentIdentityImages", "101"],
    ["กรอกชื่อเอง 101 สมชาย ใจดี 1234", "verifyCustomerIdentity", "101"],
    ["อนุมัติลูกค้า 12", "resolveCustomerBinding", "12"],
    ["ไม่อนุมัติลูกค้า 12", "resolveCustomerBinding", "12"],
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
    ["ตรวจเขียนต้นทาง", "auditSourceWriteCapabilities", ""],
    ["เช็กพร้อมใช้", "readinessCheck", ""],
    ["เวอร์ชันระบบ", "getBridgeVersion", ""],
    ["กิจกรรมวันนี้", "getStaffActivity", ""],
    ["ยกเลิกคิว 12", "cancelReviewQueue", "12"],
    ["จำลองบันทึก 12", "planSourceWrite", "12"],
    ["เปิดระบบ", "setBotSwitch", ""],
    ["ปิดระบบ", "setBotSwitch", ""],
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

  const identity = parseCommand("กรอกชื่อเอง 101 สมชาย ใจดี 1234");
  tests.push({
    input: "identity parser",
    pass:
      identity?.firstName === "สมชาย" &&
      identity?.lastName === "ใจดี" &&
      identity?.idLast4 === "1234",
    firstName: identity?.firstName || null,
    lastName: identity?.lastName || null,
    idLast4: identity?.idLast4 || null,
  });

  const partialIdentity = parseCommand("กรอกชื่อเอง 101");
  tests.push({
    input: "partial identity parser",
    pass:
      partialIdentity?.action === "verifyCustomerIdentity" &&
      partialIdentity?.query === "101" &&
      !partialIdentity?.firstName &&
      !partialIdentity?.lastName,
    query: partialIdentity?.query || "",
  });

  const ok = tests.every((x) => x.pass);
  return res.status(ok ? 200 : 500).json({ ok, tests });
}
