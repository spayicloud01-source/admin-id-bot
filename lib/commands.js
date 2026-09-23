export const COMMANDS = [
  { prefix: "คิวตรวจสอบ", action: "listReviewQueue", permission: "ดูรายงาน", requiresQuery: false },
  { prefix: "ผ่านคิว", action: "resolveReviewQueue", permission: "ดูรายงาน", decision: "ผ่าน" },
  { prefix: "ไม่ผ่านคิว", action: "resolveReviewQueue", permission: "ดูรายงาน", decision: "ไม่ผ่าน" },
  { prefix: "รออนุมัติ", action: "listPendingStaff", permission: "จัดการเจ้าหน้าที่", requiresQuery: false },
  { prefix: "ไม่อนุมัติ", action: "rejectStaff", permission: "จัดการเจ้าหน้าที่" },
  { prefix: "อนุมัติ", action: "approveStaff", permission: "จัดการเจ้าหน้าที่" },
  { prefix: "ประวัติ", action: "getHistory", permission: "ดูประวัติ" },
  { prefix: "ดูโน้ต", action: "getHistory", permission: "ดูประวัติ", eventType: "โน้ตลูกค้า" },
  { prefix: "โน้ต", action: "addNote", permission: "บันทึกโน้ต" },
  { prefix: "บันทึกชำระ", action: "queuePayment", permission: "บันทึกชำระ" },
  { prefix: "ยืนยันสลิป", action: "queueSlipReview", permission: "ยืนยันสลิป" },
  { prefix: "ปิดยอด", action: "queueClose", permission: "ปิดยอด" },
  { prefix: "ยอดปิด", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "closeAmount" },
  { prefix: "ค่าเช่า", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "fee" },
  { prefix: "วันจ่าย", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "dueDate" },
  { prefix: "ยอดค้าง", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "outstanding" },
  { prefix: "สถานะ", action: "getCustomerInfo", permission: "ดูข้อมูลลูกค้า", field: "status" },
];

export function parseCommand(text) {
  const input = String(text || "").trim();
  for (const cmd of COMMANDS) {
    if (input === cmd.prefix || input.startsWith(cmd.prefix + " ")) {
      const rest = input.slice(cmd.prefix.length).trim();
      if (cmd.action === "addNote") {
        const m = rest.match(/^(\S+)\s+(.+)$/s);
        return {
          ...cmd,
          query: m ? m[1] : "",
          note: m ? m[2].trim() : "",
        };
      }
      if (cmd.action === "queuePayment") {
        const m = rest.match(/^(\S+)\s+([0-9,]+(?:\.\d{1,2})?)$/);
        return {
          ...cmd,
          query: m ? m[1] : "",
          amount: m ? Number(m[2].replace(/,/g, "")) : null,
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
