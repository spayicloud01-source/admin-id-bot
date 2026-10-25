const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

function normalizeDigits(value) {
  return String(value || "").replace(/[๐-๙]/g, (digit) => String(THAI_DIGITS.indexOf(digit)));
}

function paidOnFromParts(day, month, rawYear) {
  if (!day) return undefined;
  const year = Number(rawYear) > 2400 ? Number(rawYear) - 543 : Number(rawYear);
  const d = Number(day);
  const m = Number(month);
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseCloseoutCommand(input) {
  const text = normalizeDigits(input).trim().replace(/\s+/g, " ");
  if (!/^ปิดยอด(?:\s|$)/u.test(text)) return null;

  const match = text.match(/^ปิดยอด\s+(\S+)\s+((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s+(?:ค่า?ปรับ|ปรับ)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?))?(?:\s+(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/u);
  if (!match) {
    return {
      matched: true,
      valid: false,
      command: {
        prefix: "ปิดยอด",
        action: "queueClose",
        permission: "ดูข้อมูลลูกค้า",
        privateOnly: true,
        query: "",
        amount: Number.NaN,
      },
    };
  }

  const totalAmount = Number(match[2].replace(/,/g, ""));
  const fineAmount = match[3] ? Number(match[3].replace(/,/g, "")) : 0;
  const amount = Math.round((totalAmount - fineAmount) * 100) / 100;
  const paidOn = paidOnFromParts(match[4], match[5], match[6]);
  return {
    matched: true,
    valid: Number.isFinite(amount) && amount > 0 && Number.isFinite(fineAmount) && fineAmount >= 0 && paidOn !== null,
    command: {
      prefix: "ปิดยอด",
      action: "queueClose",
      permission: "ดูข้อมูลลูกค้า",
      privateOnly: true,
      query: match[1],
      amount,
      totalAmount,
      fineAmount,
      paidOn: paidOn || undefined,
      autoApprove: true,
      successKind: fineAmount > 0 ? "combinedFine" : "close",
      baseKind: "close",
    },
  };
}

export function isCloseoutRoleAllowed(role) {
  return new Set(["เจ้าของ", "แอดมิน", "admin"]).has(String(role || "").trim().toLowerCase());
}

export function buildCloseoutPayload(command, context = {}) {
  return {
    action: "queueClose",
    query: String(command?.query || "").trim(),
    amount: Number(command?.amount),
    lineUserId: String(context.lineUserId || "").trim(),
    sourceType: String(context.sourceType || "user").trim(),
    groupId: String(context.groupId || "").trim(),
    staffName: String(context.staffName || "").trim(),
    role: String(context.role || "").trim(),
  };
}
