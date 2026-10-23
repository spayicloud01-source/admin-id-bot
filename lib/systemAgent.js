import { callSheetsBridge, callSheetsBridgeForRole } from "./sheetsBridge.js";

const EXPECTED_VERSION = "2026.10.07-133";
const ROLE_LABELS = { customer: "Customer", payment: "Payment", notify: "Notify" };
const INACTIVE_STATUSES = new Set([
  "ปิด", "ปิดยอด", "ปิดบัญชี", "จบ", "จบยอด", "ยกเลิก", "ลบ",
  "closed", "close", "inactive", "cancelled", "canceled", "deleted",
]);

const clean = (value) => String(value ?? "").trim();
const normalizeStatus = (value) => clean(value).toLowerCase().replace(/\s+/g, "");
const isInactiveStatus = (value) => INACTIVE_STATUSES.has(normalizeStatus(value));

function money(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/[,฿]|บาท/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function errorMessage(error) {
  return clean(error?.message || error || "ไม่ทราบสาเหตุ").slice(0, 140);
}

async function capture(name, fn) {
  try {
    return { name, ok: true, value: await fn() };
  } catch (error) {
    return { name, ok: false, error: errorMessage(error) };
  }
}

function basePayload(context) {
  return {
    lineUserId: context.lineUserId,
    sourceType: context.sourceType,
    groupId: context.groupId,
    staffName: context.staffName || "",
    role: context.role || "",
  };
}

export function analyzeSystemAgentEvidence(evidence, expectedVersion = EXPECTED_VERSION) {
  const critical = [];
  const warnings = [];
  const info = [];
  const versionEntries = [];

  for (const role of Object.keys(ROLE_LABELS)) {
    const entry = evidence[`version:${role}`];
    if (!entry?.ok) {
      critical.push(`${ROLE_LABELS[role]} ติดต่อไม่ได้: ${entry?.error || "ไม่ทราบสาเหตุ"}`);
      continue;
    }
    const version = clean(entry.value?.version) || "ไม่ทราบเวอร์ชัน";
    versionEntries.push([role, version]);
    if (version !== expectedVersion) {
      critical.push(`${ROLE_LABELS[role]} เป็น ${version} แต่ระบบต้องการ ${expectedVersion}`);
    }
  }

  if (versionEntries.length === 3 && new Set(versionEntries.map(([, version]) => version)).size === 1) {
    info.push(`GAS ทั้ง 3 บทบาทตรงกันที่ ${versionEntries[0][1]}`);
  }

  const readiness = evidence.readiness;
  if (!readiness?.ok) {
    critical.push(`ตรวจความพร้อมไม่ได้: ${readiness?.error || "ไม่ทราบสาเหตุ"}`);
  } else if (!Array.isArray(readiness.value?.checks)) {
    critical.push(readiness.value?.message || "ผลตรวจความพร้อมไม่สมบูรณ์");
  } else {
    for (const check of readiness.value.checks) {
      if (check?.pass) continue;
      const name = clean(check?.name);
      const detail = clean(check?.detail);
      if (name === "OK Slip" || name === "รับชำระเขียนต้นทาง") {
        info.push(`${name}: ${detail || "ปิดอยู่"}`);
        continue;
      }
      // Version truth is checked against all three split deployments above.
      if (name === "Apps Script version") continue;
      critical.push(`${name || "รายการตรวจ"}: ${detail || "ไม่ผ่าน"}`);
    }
  }

  const schemas = evidence.schemas;
  if (!schemas?.ok) {
    critical.push(`ตรวจชีตต้นทางไม่ได้: ${schemas?.error || "ไม่ทราบสาเหตุ"}`);
  } else if (schemas.value?.summary) {
    const summary = schemas.value.summary;
    const issues = Number(summary.issues || 0);
    if (issues > 0) {
      const samples = (schemas.value.items || []).filter((item) => !item.ready).slice(0, 3)
        .map((item) => `${item.source || "-"}/${item.sheet || "-"}: ${(item.missing || []).join(", ") || "ตรวจไม่ผ่าน"}`);
      critical.push(`ชีตต้นทางมี ${issues} จุดต้องตรวจ${samples.length ? ` (${samples.join("; ")})` : ""}`);
    } else {
      info.push(`ชีตต้นทางพร้อม ${Number(summary.ready || 0)}/${Number(summary.tabs || 0)} แท็บ`);
    }
  }

  const reminder = evidence.reminder;
  if (!reminder?.ok) {
    warnings.push(`ตรวจ Trigger แจ้งเตือนไม่ได้: ${reminder?.error || "ไม่ทราบสาเหตุ"}`);
  } else if (reminder.value?.installed === false) {
    critical.push("Notify ยังไม่ได้ติดตั้ง Trigger แจ้งเตือนรายวัน");
  } else if (reminder.value?.installed === true) {
    info.push(`Trigger แจ้งเตือนพร้อม เวลา ${clean(reminder.value.remindTime) || "ไม่ระบุ"}`);
  } else {
    warnings.push(reminder.value?.message || "ต้องตรวจ Trigger ใน Apps Script");
  }

  const review = evidence.review;
  if (!review?.ok) {
    warnings.push(`อ่านคิวตรวจสอบไม่ได้: ${review?.error || "ไม่ทราบสาเหตุ"}`);
  } else {
    const pending = Array.isArray(review.value?.items) ? review.value.items.length : 0;
    info.push(`คิวรอตรวจ ${pending} รายการ${pending >= 10 ? " (แสดงได้สูงสุด 10)" : ""}`);
  }

  const level = critical.length ? "critical" : warnings.length ? "warning" : "healthy";
  return { ok: !critical.length, level, critical, warnings, info, checkedAt: new Date().toISOString() };
}

export async function runSystemAgentAudit(context, dependencies = {}) {
  const bridge = dependencies.callBridge || callSheetsBridge;
  const bridgeForRole = dependencies.callBridgeForRole || callSheetsBridgeForRole;
  const payload = basePayload(context);
  const jobs = [
    ...Object.keys(ROLE_LABELS).map((role) => capture(`version:${role}`, () =>
      bridgeForRole({ action: "getBridgeVersion" }, role)
    )),
    capture("readiness", () => bridge({ ...payload, action: "readinessCheck" })),
    capture("schemas", () => bridge({ ...payload, action: "auditSourceSchemas" })),
    capture("reminder", () => bridgeForRole({ ...payload, action: "getReminderTriggerStatus" }, "notify")),
    capture("review", () => bridgeForRole({ ...payload, action: "listReviewQueue" }, "payment")),
  ];
  const settled = await Promise.all(jobs);
  const evidence = Object.fromEntries(settled.map((entry) => [entry.name, entry]));
  return { ...analyzeSystemAgentEvidence(evidence), evidence };
}

export function analyzeCustomerAgentEvidence(query, searchResult, summaryResult) {
  const matches = Array.isArray(searchResult?.matches) ? searchResult.matches : [];
  if (!matches.length) return { ok: false, level: "warning", query, message: `ไม่พบคิว ${query}` };
  if (matches.length > 1 || searchResult?.needsSelection) {
    return {
      ok: false, level: "warning", query,
      message: `พบคิว ${query} มากกว่า 1 รายการ กรุณาระบุแหล่ง เช่น v6:${query}`,
      matches: matches.slice(0, 5),
    };
  }

  const customer = matches[0];
  const summary = summaryResult?.summary || null;
  const inactive = isInactiveStatus(customer.status) || summaryResult?.inactive === true;
  const amounts = {
    // Prefer today's calculated values. Source rows may intentionally retain a
    // historical close amount after the account has already been closed.
    outstanding: money(summary?.paymentTotal ?? customer.outstanding),
    close: money(summary?.calculatedClose ?? customer.closeAmount),
  };
  const anomalies = [];
  if (inactive && (amounts.outstanding > 0 || amounts.close > 0)) {
    anomalies.push("สถานะปิด/ลบ แต่ยังพบยอดชำระหรือยอดปิดมากกว่า 0");
  }
  if (inactive && summary?.inactive === false) anomalies.push("สถานะต้นทางปิด/ลบ แต่ผลคำนวณยังมองว่าใช้งานอยู่");
  if (!inactive && !clean(customer.name)) anomalies.push("รายการยังใช้งานแต่ไม่มีชื่อลูกค้า");

  return {
    ok: anomalies.length === 0,
    level: anomalies.length ? "critical" : "healthy",
    query, customer, inactive, amounts, anomalies,
    summaryMessage: summaryResult?.message || "",
  };
}

export async function runCustomerAgentAudit(query, context, dependencies = {}) {
  const bridge = dependencies.callBridge || callSheetsBridge;
  const payload = basePayload(context);
  const [search, summary] = await Promise.all([
    bridge({ ...payload, action: "searchCustomer", query }),
    bridge({ ...payload, action: "getCalculatedSummary", query }),
  ]);
  return analyzeCustomerAgentEvidence(query, search, summary);
}

export function formatSystemAgentReport(report) {
  const icon = report.level === "healthy" ? "✅" : report.level === "warning" ? "⚠️" : "🚨";
  const lines = [
    `${icon} AI ตรวจระบบ Admin ID`,
    report.level === "healthy" ? "ผลรวม: ระบบส่วนที่ตรวจพร้อมใช้งาน" : `ผลรวม: พบ ${report.critical.length} จุดสำคัญ และ ${report.warnings.length} คำเตือน`,
  ];
  if (report.critical.length) lines.push("", "ต้องแก้:", ...report.critical.slice(0, 8).map((x) => `• ${x}`));
  if (report.warnings.length) lines.push("", "คำเตือน:", ...report.warnings.slice(0, 5).map((x) => `• ${x}`));
  if (report.info.length) lines.push("", "ข้อมูล:", ...report.info.slice(0, 8).map((x) => `• ${x}`));
  lines.push("", "โหมดปลอดภัย: ตรวจอย่างเดียว ไม่แก้ยอดและไม่ส่งหาลูกค้า");
  return lines.join("\n").slice(0, 4800);
}

export function formatCustomerAgentReport(report) {
  if (!report.customer) return `⚠️ AI ตรวจคิว ${report.query}\n${report.message || "ตรวจไม่สำเร็จ"}\n\nไม่มีการแก้ยอดหรือส่งข้อความหาลูกค้า`;
  const icon = report.ok ? "✅" : "🚨";
  const customer = report.customer;
  const lines = [
    `${icon} AI ตรวจคิว ${report.query}`,
    `ลูกค้า: ${customer.name || "-"}`,
    `แหล่ง: ${customer.source || "-"}${customer.sheet ? ` / ${customer.sheet}` : ""}`,
    `สถานะ: ${customer.status || "-"}`,
    `ผล: ${report.ok ? (report.inactive ? "ปิดรายการถูกต้อง และไม่พบยอดที่ควรส่งชำระ" : "ไม่พบความผิดปกติจากข้อมูลล่าสุด") : "พบความผิดปกติ"}`,
  ];
  if (report.anomalies?.length) lines.push("", ...report.anomalies.map((x) => `• ${x}`));
  lines.push("", "โหมดปลอดภัย: ตรวจอย่างเดียว ไม่แก้ยอดและไม่ส่งหาลูกค้า");
  return lines.join("\n").slice(0, 4800);
}
