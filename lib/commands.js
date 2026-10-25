export const COMMANDS = [
  { prefix: "AI ตรวจระบบ", action: "agentSystemAudit", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "เอไอ ตรวจระบบ", action: "agentSystemAudit", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "AI เช็กระบบ", action: "agentSystemAudit", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "เอไอ เช็กระบบ", action: "agentSystemAudit", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "ตรวจระบบ", action: "agentSystemAudit", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "AI ตรวจคิว", action: "agentCustomerAudit", permission: "ดูรายงาน" },
  { prefix: "เอไอ ตรวจคิว", action: "agentCustomerAudit", permission: "ดูรายงาน" },
  { prefix: "AI เช็กคิว", action: "agentCustomerAudit", permission: "ดูรายงาน" },
  { prefix: "เอไอ เช็กคิว", action: "agentCustomerAudit", permission: "ดูรายงาน" },
  { prefix: "ตรวจคิว", action: "agentCustomerAudit", permission: "ดูรายงาน" },
  { prefix: "AI", action: "agentHelp", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "เอไอ", action: "agentHelp", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "สรุปยอดวันนี้", action: "dailyOwnerReport", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "อ่านบัตรล่าสุด", action: "getRecentIdentityImages", permission: "ดูข้อมูลลูกค้า", requiresQuery: false },
  { prefix: "กรอกชื่อเอง", action: "verifyCustomerIdentity", permission: "ดูข้อมูลลูกค้า" },
  { prefix: "บัตรประชาชน", action: "verifyCustomerIdentity", permission: "ดูข้อมูลลูกค้า" },
  { prefix: "ลูกค้ารออนุมัติ", action: "listPendingCustomerBindings", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "อนุมัติลูกค้า", action: "resolveCustomerBinding", permission: "จัดการเจ้าหน้าที่", decision: "อนุมัติ" },
  { prefix: "ไม่อนุมัติลูกค้า", action: "resolveCustomerBinding", permission: "จัดการเจ้าหน้าที่", decision: "ไม่อนุมัติ" },
  { prefix: "เช็กพร้อมใช้", action: "readinessCheck", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "เปิดระบบ", action: "setBotSwitch", permission: "จัดการเจ้าหน้าที่", switchKey: "BOT_MASTER_ENABLED", enabled: true, requiresQuery: false },
  { prefix: "ปิดระบบ", action: "setBotSwitch", permission: "จัดการเจ้าหน้าที่", switchKey: "BOT_MASTER_ENABLED", enabled: false, requiresQuery: false },
  { prefix: "เปิดพนักงาน", action: "setBotSwitch", permission: "จัดการเจ้าหน้าที่", switchKey: "BOT_STAFF_ENABLED", enabled: true, requiresQuery: false },
  { prefix: "ปิดพนักงาน", action: "setBotSwitch", permission: "จัดการเจ้าหน้าที่", switchKey: "BOT_STAFF_ENABLED", enabled: false, requiresQuery: false },
  { prefix: "เปิดกลุ่มทั้งหมด", action: "setBotSwitch", permission: "จัดการเจ้าหน้าที่", switchKey: "BOT_GROUP_ENABLED", enabled: true, requiresQuery: false },
  { prefix: "ปิดกลุ่มทั้งหมด", action: "setBotSwitch", permission: "จัดการเจ้าหน้าที่", switchKey: "BOT_GROUP_ENABLED", enabled: false, requiresQuery: false },
  { prefix: "เวอร์ชันระบบ", action: "getBridgeVersion", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "กิจกรรมวันนี้", action: "getStaffActivity", permission: "ดูรายงาน", activityToday: true, requiresQuery: false },
  { prefix: "กิจกรรม", action: "getStaffActivity", permission: "ดูรายงาน" },
  { prefix: "ทดสอบแจ้งเตือน", action: "getReminderBatch", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "ตรวจชีตต้นทาง", action: "auditSourceSchemas", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "ตรวจเขียนต้นทาง", action: "auditSourceWriteCapabilities", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "สิทธิ์เจ้าหน้าที่", action: "getStaffPermissions", permission: "จัดการเจ้าหน้าที่" },
  { prefix: "ให้สิทธิ์", action: "setStaffPermission", permission: "จัดการเจ้าหน้าที่", permissionEnabled: true },
  { prefix: "ถอนสิทธิ์", action: "setStaffPermission", permission: "จัดการเจ้าหน้าที่", permissionEnabled: false },
  { prefix: "ติดตั้งแจ้งเตือน", action: "installReminderTrigger", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "สถานะแจ้งเตือน", action: "getReminderTriggerStatus", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "เปิดแจ้งเตือนกลุ่ม", action: "setGroupNotification", permission: "จัดการเจ้าหน้าที่", enabled: true, requiresQuery: false },
  { prefix: "ปิดแจ้งเตือนกลุ่ม", action: "setGroupNotification", permission: "จัดการเจ้าหน้าที่", enabled: false, requiresQuery: false },
  { prefix: "ครบกำหนดวันนี้", action: "listDueCustomers", permission: "ดูรายงาน", dueMode: "today", requiresQuery: false },
  { prefix: "ใกล้ครบกำหนด", action: "listDueCustomers", permission: "ดูรายงาน", dueMode: "upcoming", requiresQuery: false },
  { prefix: "ค้างชำระทั้งหมด", action: "listDueCustomers", permission: "ดูรายงาน", dueMode: "overdue", requiresQuery: false },
  { prefix: "เปิดกลุ่ม", action: "setGroupEnabled", permission: "จัดการเจ้าหน้าที่", enabled: true, requiresQuery: false },
  { prefix: "ปิดกลุ่ม", action: "setGroupEnabled", permission: "จัดการเจ้าหน้าที่", enabled: false, requiresQuery: false },
  { prefix: "สถานะกลุ่ม", action: "getGroupStatus", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "รายงานวันนี้", action: "dailyOwnerReport", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "สถานะระบบ", action: "systemStatus", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "เจ้าหน้าที่", action: "listStaff", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "ระงับ", action: "setStaffEnabled", permission: "จัดการเจ้าหน้าที่", enabled: false },
  { prefix: "เปิดใช้", action: "setStaffEnabled", permission: "จัดการเจ้าหน้าที่", enabled: true },
  { prefix: "คิวตรวจสอบ", action: "listReviewQueue", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "ดูคิว", action: "getReviewQueueItem", permission: "ดูรายงาน" },
  { prefix: "ยกเลิกคิว", action: "cancelReviewQueue", permission: "ดูรายงาน" },
  { prefix: "ยืนยันยกเลิก", action: "confirmRollbackReviewQueue", permission: "ดูรายงาน" },
  { prefix: "ยกเลิกล่าสุด", action: "latestRollbackHelp", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "ยกเลิกรายการ", action: "prepareRollbackReviewQueue", permission: "ดูรายงาน" },
  { prefix: "จำลองบันทึก", action: "planSourceWrite", permission: "ดูรายงาน" },
  { prefix: "ผ่านคิว", action: "resolveReviewQueue", permission: "ดูรายงาน", decision: "ผ่าน" },
  { prefix: "ไม่ผ่านคิว", action: "resolveReviewQueue", permission: "ดูรายงาน", decision: "ไม่ผ่าน" },
  { prefix: "รออนุมัติ", action: "listPendingStaff", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "ไม่อนุมัติ", action: "rejectStaff", permission: "จัดการเจ้าหน้าที่" },
  { prefix: "อนุมัติ", action: "approveStaff", permission: "จัดการเจ้าหน้าที่" },
  { prefix: "ค้นหา", action: "searchCustomer", permission: "ดูข้อมูลลูกค้า" },
  { prefix: "ประวัติ", action: "getHistory", permission: "ดูประวัติ" },
  { prefix: "ดูโน้ต", action: "getHistory", permission: "ดูประวัติ", eventType: "โน้ตลูกค้า" },
  { prefix: "โน้ต", action: "addNote", permission: "บันทึกโน้ต" },
  { prefix: "รับค่าปรับ", action: "queuePayment", permission: "บันทึกชำระ", privateOnly: true, paymentKind: "fine" },
  { prefix: "รับยอด", action: "queuePayment", permission: "บันทึกชำระ", privateOnly: true, autoApprove: true, successKind: "payment" },
  { prefix: "ตัดต้น", action: "queuePayment", permission: "บันทึกชำระ", privateOnly: true, paymentKind: "principal", autoApprove: true, successKind: "principal" },
  { prefix: "รับชำระ", action: "queuePayment", permission: "บันทึกชำระ", privateOnly: true },
  { prefix: "บันทึกชำระ", action: "queuePayment", permission: "บันทึกชำระ" },
  { prefix: "ยืนยันสลิป", action: "queueSlipReview", permission: "ยืนยันสลิป" },
  { prefix: "ปิดยอด", action: "queueClose", permission: "ปิดยอด" },
  { prefix: "สรุปยอด", action: "getCalculatedSummary", permission: "ดูข้อมูลลูกค้า" },
  { prefix: "สิทธิ์ส่วนลด", action: "getCalculatedSummary", permission: "ดูข้อมูลลูกค้า", summaryField: "discount" , requiresQuery: true },
  { prefix: "ยอดปิด", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "closeAmount" , requiresQuery: true },
  { prefix: "ค่าเช่า", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "fee" , requiresQuery: true },
  { prefix: "วันจ่าย", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "dueDate" , requiresQuery: true },
  { prefix: "ยอดค้าง", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "outstanding" , requiresQuery: true },
  { prefix: "สถานะ", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "status" , requiresQuery: true },
];

function paidOnFromParts(day, month, rawYear) {
  if (!day) return undefined;
  const year = Number(rawYear) > 2400 ? Number(rawYear) - 543 : Number(rawYear);
  const d = Number(day);
  const m = Number(month);
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseCommand(text) {
  const input = String(text || "").trim();

  // The stated total includes the fine.
  // Example: รับยอด 610-4 900 ปรับ100 => payment 800 + fine 100.
  const combinedFine = input.match(/^รับยอด\s+(\S+)\s+([0-9,]+(?:\.\d{1,2})?)\s+(?:ค่าปรับ|ปรับ)\s*([0-9,]+(?:\.\d{1,2})?)(?:\s+(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/u);
  if (combinedFine) {
    const totalAmount = Number(combinedFine[2].replace(/,/g, ""));
    const fineAmount = Number(combinedFine[3].replace(/,/g, ""));
    const amount = Math.round((totalAmount - fineAmount) * 100) / 100;
    const paidOn = paidOnFromParts(combinedFine[4], combinedFine[5], combinedFine[6]);
    return {
      prefix: "รับยอด+ค่าปรับ",
      action: "queuePayment",
      permission: "บันทึกชำระ",
      privateOnly: true,
      autoApprove: true,
      successKind: "combinedFine",
      baseKind: "payment",
      query: combinedFine[1],
      amount,
      totalAmount,
      fineAmount,
      paidOn: paidOn || undefined,
      invalidCombined: !(totalAmount > 0 && fineAmount > 0 && amount > 0) || paidOn === null,
    };
  }

  // Principal plus fine: the stated total includes both amounts.
  // Example: ตัดต้น 310-4 1100 ปรับ100 => principal 1000 + fine 100.
  const principalFine = input.match(/^ตัดต้น\s+(\S+)\s+([0-9,]+(?:\.\d{1,2})?)\s+(?:ค่าปรับ|ปรับ)\s*([0-9,]+(?:\.\d{1,2})?)(?:\s+(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/u);
  if (principalFine) {
    const totalAmount = Number(principalFine[2].replace(/,/g, ""));
    const fineAmount = Number(principalFine[3].replace(/,/g, ""));
    const amount = Math.round((totalAmount - fineAmount) * 100) / 100;
    const paidOn = paidOnFromParts(principalFine[4], principalFine[5], principalFine[6]);
    return {
      prefix: "ตัดต้น+ค่าปรับ",
      action: "queuePayment",
      permission: "บันทึกชำระ",
      privateOnly: true,
      paymentKind: "principal",
      autoApprove: true,
      successKind: "combinedFine",
      baseKind: "principal",
      query: principalFine[1],
      amount,
      totalAmount,
      fineAmount,
      paidOn: paidOn || undefined,
      invalidCombined: !(totalAmount > 0 && fineAmount > 0 && amount > 0) || paidOn === null,
    };
  }

  // Combined input: the stated total includes both rent/payment and principal.
  // Example: 610q9 ชำระยอด 1700 ตัดต้น1000 => payment 700 + principal 1000.
  const combined = input.match(/^(\S+)\s+ชำระยอด\s+([0-9,]+(?:\.\d{1,2})?)\s+ตัดต้น\s*([0-9,]+(?:\.\d{1,2})?)(?:\s+(?:ค่าปรับ|ปรับ)\s*([0-9,]+(?:\.\d{1,2})?))?(?:\s+(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/u);
  if (combined) {
    const totalAmount = Number(combined[2].replace(/,/g, ""));
    const principalAmount = Number(combined[3].replace(/,/g, ""));
    const fineAmount = combined[4] ? Number(combined[4].replace(/,/g, "")) : 0;
    const amount = Math.round((totalAmount - principalAmount - fineAmount) * 100) / 100;
    const paidOn = paidOnFromParts(combined[5], combined[6], combined[7]);
    return {
      prefix: "ชำระยอด+ตัดต้น",
      action: "queuePayment",
      permission: "บันทึกชำระ",
      privateOnly: true,
      autoApprove: true,
      successKind: "combined",
      query: combined[1],
      amount,
      totalAmount,
      principalAmount,
      fineAmount,
      paidOn: paidOn || undefined,
      invalidCombined: !(totalAmount > 0 && principalAmount > 0 && fineAmount >= 0 && amount > 0) || paidOn === null,
    };
  }

  for (const cmd of COMMANDS) {
    if (input === cmd.prefix || input.startsWith(cmd.prefix + " ")) {
      const rest = input.slice(cmd.prefix.length).trim();
      if (cmd.requiresQuery === true && !rest) return null;
      if (cmd.action === "verifyCustomerIdentity") {
        const m = rest.match(/^(\S+)\s+(\S+)\s+(\S+)(?:\s+(\d{4}))?$/);
        const firstToken = rest.match(/^(\S+)/);
        return {
          ...cmd,
          query: m ? m[1] : (firstToken ? firstToken[1] : ""),
          firstName: m ? m[2] : "",
          lastName: m ? m[3] : "",
          idLast4: m && m[4] ? m[4] : "",
        };
      }
      if (cmd.action === "addNote") {
        const m = rest.match(/^(\S+)\s+(.+)$/s);
        return {
          ...cmd,
          query: m ? m[1] : "",
          note: m ? m[2].trim() : "",
        };
      }
      if (cmd.action === "queuePayment") {
        if (cmd.paymentKind === "fine") {
          const m = rest.match(/^(\S+)\s+([0-9,]+(?:\.\d{1,2})?)(?:\s+(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/);
          const paidOn = m ? paidOnFromParts(m[3], m[4], m[5]) : undefined;
          return { ...cmd, query: m && paidOn !== null ? m[1] : "", amount: m && paidOn !== null ? Number(m[2].replace(/,/g, "")) : null, paidOn: paidOn || undefined };
        }
        const m = rest.match(/^(\S+)\s+([0-9,]+(?:\.\d{1,2})?)(?:\s+(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/);
        const paidOn = m ? paidOnFromParts(m[3], m[4], m[5]) : undefined;
        return {
          ...cmd,
          query: m && paidOn !== null ? m[1] : (/^\S+$/.test(rest) ? rest : ""),
          amount: m && paidOn !== null ? Number(m[2].replace(/,/g, "")) : null,
          paidOn: paidOn || undefined,
        };
      }
      if (cmd.action === "setStaffPermission") {
        const m = rest.match(/^(\S+)\s+(.+)$/s);
        return {
          ...cmd,
          query: m ? m[1] : "",
          targetPermission: m ? m[2].trim() : "",
        };
      }
      return { ...cmd, query: rest };
    }
  }
  return null;
}

export function formatCustomerInfo(info = {}, field) {
  const name = info.name || "-";
  const queue = info.queue ? `คิว ${info.queue}` : "";
  const head = [name, queue].filter(Boolean).join(" / ");

  const labels = {
    fee: ["ค่าเช่า", info.fee],
    dueDate: ["วันจ่าย", info.dueDate],
    outstanding: ["ยอดค้าง", info.outstanding],
    status: ["สถานะ", info.status],
    closeAmount: ["ยอดปิด", info.closeAmount],
  };

  const pair = labels[field];
  if (!pair) return "ไม่พบข้อมูล";

  return `${head}\n${pair[0]}: ${pair[1] || "-"}`;
}

export function formatHistory(items = []) {
  if (!items.length) return "ไม่พบประวัติลูกค้า";
  return items.slice(0, 10).map((x, i) => {
    const parts = [
      `${i + 1}. ${x.eventType || "-"}`,
      x.dateTime || null,
      x.amount ? `ยอด ${x.amount}` : null,
      x.note || null,
      x.staff || null,
    ].filter(Boolean);
    return parts.join(" | ");
  }).join("\n");
}


