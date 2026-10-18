// LINE relationship events are distinct from customer binding approval.
export function lineRelationshipEvent(event) {
  if (!event || !["follow", "unfollow"].includes(event.type)) return null;
  if (event.source?.type !== "user" || !/^U[0-9a-f]{32}$/i.test(String(event.source?.userId || ""))) return null;
  return {
    action: "recordCustomerLineStatus",
    eventType: event.type,
    lineUserId: event.source.userId,
    webhookEventId: String(event.webhookEventId || "").slice(0, 100),
    eventTimestamp: Number(event.timestamp) || Date.now(),
    isUnblocked: event.follow?.isUnblocked === true,
  };
}

export function formatLineRelationshipAlert(result, eventType) {
  if (!result?.changed || !Array.isArray(result.items) || !result.items.length) return "";
  const title = eventType === "unfollow" ? "ลูกค้าบล็อก LINE OA" : "ลูกค้ากลับมาเพิ่มเพื่อน/ปลดบล็อก LINE OA";
  const lines = result.items.slice(0, 5).map((x) =>
    ["คิว " + (x.queue || "ไม่ทราบ"), x.name || "", x.source && x.sheet ? x.source + "/" + x.sheet : ""]
      .filter(Boolean).join(" | ")
  );
  return [title, ...lines, "ตรวจสอบสถานะในชีต ลูกค้า LINE"].join("\n").slice(0, 4500);
}

export function formatBlockedCustomerLines(items) {
  if (!Array.isArray(items) || !items.length) return "ยังไม่พบลูกค้าที่บล็อก LINE OA (นับเฉพาะรายที่เคยผูกบัญชี)";
  return [
    "รายชื่อลูกค้าที่บล็อก LINE OA",
    ...items.slice(0, 20).map((x) =>
      "คิว " + (x.queue || "-") + " | " + (x.name || "-") +
      (x.changedAt ? " | " + x.changedAt : "") +
      (x.source && x.sheet ? " | " + x.source + "/" + x.sheet : "")
    ),
    "ดูรายละเอียดเพิ่มเติมในชีต ลูกค้า LINE",
  ].join("\n").slice(0, 4500);
}
