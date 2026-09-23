import crypto from "node:crypto";
import { callSheetsBridge, formatCustomerMatches } from "../../lib/sheetsBridge.js";
import { parseCommand, formatCustomerInfo, formatHistory } from "../../lib/commands.js";

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function replyMessage(replyToken, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${text}`);
  }
}

async function pushMessage(to, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !to) return;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${text}`);
  }
}

async function getGroupSummary(groupId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !groupId) return null;
  try {
    const response = await fetch("https://api.line.me/v2/bot/group/" + encodeURIComponent(groupId) + "/summary", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("LINE group summary failed", error);
    return null;
  }
}

async function safeLogAction(payload) {
  try {
    await callSheetsBridge({
      action: "logAction",
      ...payload,
    });
  } catch (error) {
    console.warn("Audit log failed", error);
  }
}

async function startLoading(chatId, loadingSeconds = 60) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !chatId) return;

  try {
    const response = await fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chatId,
        loadingSeconds,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`LINE loading failed: ${response.status} ${text}`);
    }
  } catch (error) {
    console.warn("LINE loading error", error);
  }
}

function menuQuickReply(role) {
  const base = [
    ["ค้นลูกค้า", "ช่วยเหลือ"],
    ["ครบกำหนดวันนี้", "ครบกำหนดวันนี้"],
    ["ใกล้ครบกำหนด", "ใกล้ครบกำหนด"],
    ["ค้างชำระ", "ค้างชำระทั้งหมด"],
    ["คิวตรวจสอบ", "คิวตรวจสอบ"],
    ["รายงานวันนี้", "รายงานวันนี้"],
  ];

  const ownerOnly = [
    ["เจ้าหน้าที่", "เจ้าหน้าที่"],
    ["ลูกค้ารออนุมัติ", "ลูกค้ารออนุมัติ"],
    ["กิจกรรมวันนี้", "กิจกรรมวันนี้"],
    ["สถานะระบบ", "สถานะระบบ"],
    ["เช็กพร้อมใช้", "เช็กพร้อมใช้"],
    ["ตรวจชีต", "ตรวจชีตต้นทาง"],
    ["แจ้งเตือน", "สถานะแจ้งเตือน"],
  ];

  const items = (role === "เจ้าของ" ? base.concat(ownerOnly) : base)
    .slice(0, 13)
    .map(([label, text]) => ({
      type: "action",
      action: { type: "message", label, text },
    }));

  return { items };
}

function customerSelfQuickReply() {
  return {
    items: [
      ["ยอดปิด", "ยอดปิด"],
      ["ค่าเช่า", "ค่าเช่า"],
      ["วันจ่าย", "วันจ่าย"],
      ["ยอดค้าง", "ยอดค้าง"],
      ["สถานะ", "สถานะ"],
      ["สิทธิ์ส่วนลด", "สิทธิ์ส่วนลด"],
      ["เมนูลูกค้า", "เมนูลูกค้า"],
    ].map(([label, text]) => ({
      type: "action",
      action: { type: "message", label, text },
    })),
  };
}

function formatMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "0";
}

function formatCustomerSelfResult(result, field) {
  const items = Array.isArray(result?.items) ? result.items : [];
  if (!result?.bound) return result?.message || "ยังไม่ได้ผูกบัญชี";
  if (!items.length) return "บัญชีผูกแล้ว แต่ไม่พบข้อมูลลูกค้าต้นทาง กรุณาติดต่อเจ้าหน้าที่";

  const blocks = items.slice(0, 5).map((x) => {
    const head = (x.name || "ลูกค้า") + (x.queue ? " | คิว " + x.queue : "");
    if (field === "close") {
      return [head, "ยอดปิดวันนี้: " + formatMoney(x.calculatedClose) + " บาท", x.discountEligible ? "มีสิทธิ์ลดค่าเช่า " + x.discountPercent + "%" : null, "คำนวณ ณ " + x.calculatedAt].filter(Boolean).join("\n");
    }
    if (field === "fee") {
      return [head, "ค่าเช่า: " + formatMoney(x.accumulatedFee) + " บาท", x.lateFee ? "ค่าปรับ: " + formatMoney(x.lateFee) + " บาท" : null].filter(Boolean).join("\n");
    }
    if (field === "due") {
      return [head, "วันจ่าย: " + (x.dueDate || "-"), x.overdueDays > 0 ? "เกินกำหนด " + x.overdueDays + " วัน" : null].filter(Boolean).join("\n");
    }
    if (field === "outstanding") {
      const outstanding = Number(x.outstanding || 0) > 0 ? Number(x.outstanding || 0) : Number(x.accumulatedFee || 0) + Number(x.lateFee || 0);
      return [head, "ยอดค้าง: " + formatMoney(outstanding) + " บาท"].join("\n");
    }
    if (field === "status") {
      return [head, "สถานะ: " + (x.status || "-"), x.overdueDays > 0 ? "ค้าง " + x.overdueDays + " วัน" : "ยังไม่เกินกำหนด"].join("\n");
    }
    if (field === "discount") {
      return [
        head,
        x.discountEligible
          ? "มีสิทธิ์ลดค่าเช่า " + x.discountPercent + "%"
          : "ตอนนี้ยังไม่มีสิทธิ์ส่วนลดปิดยอด",
        "ยอดปิดวันนี้: " + formatMoney(x.calculatedClose) + " บาท"
      ].join("\n");
    }
    return [
      head,
      "ยอดปิดวันนี้: " + formatMoney(x.calculatedClose) + " บาท",
      "วันจ่าย: " + (x.dueDate || "-"),
      x.overdueDays > 0 ? "ค้าง " + x.overdueDays + " วัน" : null,
    ].filter(Boolean).join("\n");
  });

  return blocks.join("\n\n");
}

async function handleEvent(event) {
  if (event.type !== "message") return;

  if (event.message?.type === "image") {
    const lineUserId = event.source?.userId || "";
    const sourceType = event.source?.type || "";
    const groupId = event.source?.groupId || "";
    if (!lineUserId) return;

    try {
      const result = await callSheetsBridge({
        action: "rememberSlipMessage",
        lineUserId,
        sourceType,
        groupId,
        messageId: event.message?.id || "",
      });

      const replyText = result.remembered
        ? "รับรูปสลิปแล้ว\nภายใน 10 นาที พิมพ์ ยืนยันสลิป <ชื่อ/เบอร์/คิว/Apple ID>"
        : (result.message || "ยังไม่สามารถรับสลิปได้");

      await replyMessage(event.replyToken, [{ type: "text", text: replyText }]);
    } catch (error) {
      console.error("Slip image capture failed", error);
      await replyMessage(event.replyToken, [{
        type: "text",
        text: "รับรูปสลิปไม่สำเร็จ กรุณาลองใหม่"
      }]);
    }
    return;
  }

  if (event.message?.type !== "text") return;

  const text = String(event.message.text || "").trim();

  if (text.toLowerCase() === "ping") {
    await replyMessage(event.replyToken, [
      { type: "text", text: "Admin ID Bot: pong" },
    ]);
    return;
  }

  if (text.toLowerCase() === "myid") {
    const lineUserId = event.source?.userId || "";
    await replyMessage(event.replyToken, [
      {
        type: "text",
        text: lineUserId
          ? `LINE User ID ของคุณ:\n${lineUserId}`
          : "ไม่พบ LINE User ID",
      },
    ]);
    return;
  }

  if (!text) return;

  try {
    const lineUserId = event.source?.userId || "";
    const sourceType = event.source?.type || "";
    const groupId = event.source?.groupId || "";

    if (sourceType === "user" && lineUserId) {
      await startLoading(lineUserId, 60);
    }

    const command = parseCommand(text);

    const directOwnerValidatedActions = new Set(["readinessCheck"]);
    let access;

    if (directOwnerValidatedActions.has(command?.action)) {
      // readinessCheck performs its own owner validation in Apps Script.
      // Avoid a second pre-check that can incorrectly route the owner into registration fallback.
      access = {
        allowed: true,
        staffName: "",
        role: "เจ้าของ",
      };
    } else {
      access = await callSheetsBridge({
        action: "checkAccess",
        lineUserId,
        sourceType,
        groupId,
        permission: command?.permission || "ดูข้อมูลลูกค้า",
        allowGroupSetup: ["setGroupEnabled", "getGroupStatus", "setGroupNotification"].includes(command?.action),
        allowSystemControl: ["setBotSwitch", "getBridgeVersion"].includes(command?.action),
      });
    }

    if (!access.allowed) {
      if (sourceType === "user" && lineUserId) {
        const bindingMatch = text.match(/^ผูกบัญชี\s+(\S+)\s+(.+\S)$/);
        const customerFieldMap = {
          "ยอดปิด": "close",
          "ค่าเช่า": "fee",
          "วันจ่าย": "due",
          "ยอดค้าง": "outstanding",
          "สถานะ": "status",
          "สถานะทั้งหมด": "status",
          "สิทธิ์ส่วนลด": "discount",
          "เมนูลูกค้า": "menu",
        };

        if (text === "ผูกบัญชี") {
          await replyMessage(event.replyToken, [{
            type: "text",
            text: "พิมพ์ตามนี้ครับ\nผูกบัญชี <คิว> <ชื่อ นามสกุล>\nตัวอย่าง: ผูกบัญชี 101 สมชาย ใจดี"
          }]);
          return;
        }

        if (bindingMatch) {
          const result = await callSheetsBridge({
            action: "requestCustomerBinding",
            lineUserId,
            queue: bindingMatch[1],
            fullName: bindingMatch[2].trim(),
          });

          if (result.requested && Array.isArray(result.ownerLineUserIds)) {
            const ownerMessage = {
              type: "text",
              text: [
                "ลูกค้าขอผูกบัญชี LINE",
                "ชื่อ: " + (result.customerName || "-"),
                "คิว: " + (result.queue || "-"),
                "แหล่ง: " + (result.source || "-"),
                "คำขอ #" + result.rowNo,
              ].join("\n"),
              quickReply: {
                items: [
                  {
                    type: "action",
                    action: { type: "message", label: "อนุมัติลูกค้า", text: "อนุมัติลูกค้า " + result.rowNo },
                  },
                  {
                    type: "action",
                    action: { type: "message", label: "ไม่อนุมัติ", text: "ไม่อนุมัติลูกค้า " + result.rowNo },
                  },
                ],
              },
            };
            await Promise.all(
              result.ownerLineUserIds.map((ownerId) =>
                pushMessage(ownerId, [ownerMessage]).catch((error) =>
                  console.warn("Customer binding owner alert failed", error)
                )
              )
            );
          }

          await replyMessage(event.replyToken, [{ type: "text", text: result.message || "ส่งคำขอแล้ว" }]);
          return;
        }

        if (text === "ยกเลิกผูกบัญชี") {
          const result = await callSheetsBridge({ action: "cancelCustomerBindings", lineUserId });
          await replyMessage(event.replyToken, [{ type: "text", text: result.message || "ดำเนินการแล้ว" }]);
          return;
        }

        if (customerFieldMap[text]) {
          const field = customerFieldMap[text];
          const result = await callSheetsBridge({
            action: "getCustomerSelf",
            lineUserId,
            field,
          });

          const message = {
            type: "text",
            text: field === "menu" ? formatCustomerSelfResult(result, "menu") : formatCustomerSelfResult(result, field),
          };
          if (result.bound) message.quickReply = customerSelfQuickReply();
          await replyMessage(event.replyToken, [message]);
          return;
        }
      }

      const registration = await callSheetsBridge({
        action: "registerStaff",
        lineUserId,
        staffName: text,
      });

      if (registration?.registered || registration?.alreadyRegistered) {
        if ((registration?.registered || registration?.pendingApproval) && Array.isArray(registration.ownerLineUserIds)) {
          const staffName = registration.staffName || text;
          const ownerText = [
            "มีเจ้าหน้าที่ขออนุมัติ",
            "ชื่อ: " + staffName
          ].filter(Boolean).join("\n");

          const ownerMessage = {
            type: "text",
            text: ownerText,
            quickReply: {
              items: [
                {
                  type: "action",
                  action: {
                    type: "message",
                    label: "อนุมัติ",
                    text: "อนุมัติ " + staffName
                  }
                },
                {
                  type: "action",
                  action: {
                    type: "message",
                    label: "ไม่อนุมัติ",
                    text: "ไม่อนุมัติ " + staffName
                  }
                }
              ]
            }
          };

          await Promise.all(
            registration.ownerLineUserIds.map((ownerId) =>
              pushMessage(ownerId, [ownerMessage]).catch((error) => {
                console.warn("Owner approval alert failed", error);
              })
            )
          );
        }

        await replyMessage(event.replyToken, [
          {
            type: "text",
            text: registration.message || "รออนุมัติ",
          },
        ]);
        return;
      }

      await replyMessage(event.replyToken, [
        {
          type: "text",
          text: access.message || registration?.message || "บัญชี LINE นี้ยังไม่มีสิทธิ์ใช้งาน Admin ID",
        },
      ]);
      return;
    }

    if (text === "เมนู") {
      await replyMessage(event.replyToken, [{
        type: "text",
        text: access.role === "เจ้าของ" ? "เมนูเจ้าของ Admin ID" : "เมนู Admin ID",
        quickReply: menuQuickReply(access.role || "")
      }]);
      return;
    }

    if (text === "ช่วยเหลือ" || text === "แนะนำการใช้งาน") {
      await replyMessage(event.replyToken, [
        {
          type: "text",
          text: [
            "คำสั่ง Admin ID",
            "• พิมพ์ชื่อ / เบอร์ / คิว / Apple ID เพื่อค้นหา",
            "• ถ้าคิวซ้ำ ใช้ แหล่ง:คิว เช่น v6:101",
            "• ประวัติ <คำค้น>",
            "• ดูโน้ต <คำค้น>",
            "• โน้ต <คำค้น> <ข้อความ>",
            "• สรุปยอด <คำค้น>",
            "• สิทธิ์ส่วนลด <คำค้น>",
            "• ยอดปิด <คำค้น>",
            "• ค่าเช่า <คำค้น>",
            "• วันจ่าย <คำค้น>",
            "• ยอดค้าง <คำค้น>",
            "• สถานะ <คำค้น>",
            access.role === "เจ้าของ" ? "• รายงานวันนี้ / สถานะระบบ / ตรวจชีตต้นทาง" : null,
            access.role === "เจ้าของ" ? "• คิวตรวจสอบ / ดูคิว <เลข> / ผ่านคิว <เลข> / ไม่ผ่านคิว <เลข>" : null,
            access.role === "เจ้าของ" ? "• เจ้าหน้าที่ / สิทธิ์เจ้าหน้าที่ <ชื่อ> / ระงับ <ชื่อ> / เปิดใช้ <ชื่อ>" : null,
            access.role === "เจ้าของ" ? "• ให้สิทธิ์ <ชื่อ> <สิทธิ์> / ถอนสิทธิ์ <ชื่อ> <สิทธิ์>" : null,
            access.role === "เจ้าของ" ? "• เปิดกลุ่ม / ปิดกลุ่ม / สถานะกลุ่ม" : null,
            access.role === "เจ้าของ" ? "• ติดตั้งแจ้งเตือน / สถานะแจ้งเตือน / ทดสอบแจ้งเตือน" : null
          ].join("\n")
        },
      ]);
      return;
    }

    if (command) {
      if (command.requiresQuery !== false && !command.query) {
        const usage =
          command.action === "addNote"
            ? "รูปแบบ: โน้ต <คำค้น> <ข้อความ>"
            : command.action === "queuePayment"
              ? "รูปแบบ: บันทึกชำระ <คำค้น> <ยอด>"
              : command.action === "setStaffPermission"
                ? "รูปแบบ: " + command.prefix + " <ชื่อ> <สิทธิ์>"
                : `รูปแบบ: ${command.prefix} <คำค้น>`;
        await replyMessage(event.replyToken, [{ type: "text", text: usage }]);
        return;
      }

      let groupName = "";
      if (sourceType === "group" && ["setGroupEnabled", "getGroupStatus"].includes(command.action)) {
        const groupSummary = await getGroupSummary(groupId);
        groupName = groupSummary?.groupName || "";
      }

      const payload = {
        action: command.action,
        query: command.query,
        lineUserId,
        sourceType,
        groupId,
        staffName: access.staffName || "",
        role: access.role || "",
        groupName,
      };

      if (command.eventType) payload.eventType = command.eventType;
      if (command.firstName) payload.firstName = command.firstName;
      if (command.lastName) payload.lastName = command.lastName;
      if (command.idLast4) payload.idLast4 = command.idLast4;
      if (command.note) payload.note = command.note;
      if (command.amount != null) payload.amount = command.amount;
      if (command.decision) payload.decision = command.decision;
      if (command.enabled != null) payload.enabled = command.enabled;
      if (command.dueMode) payload.dueMode = command.dueMode;
      if (command.targetPermission) payload.targetPermission = command.targetPermission;
      if (command.permissionEnabled != null) payload.permissionEnabled = command.permissionEnabled;
      if (command.action === "getReminderBatch") payload.force = true;
      if (command.activityToday) payload.activityToday = true;
      if (command.switchKey) payload.switchKey = command.switchKey;

      const result = await callSheetsBridge(payload);

      let responseText = "";
      if (command.action === "verifyCustomerIdentity") {
        responseText = result.needsSelection
          ? "พบหลายรายการ กรุณาระบุคำค้นให้ชัดขึ้น\n\n" + formatCustomerMatches(result.matches || [])
          : (result.message || (result.verified ? "ยืนยันตัวตนแล้ว" : "ยืนยันตัวตนไม่ได้"));
      } else if (command.action === "listPendingCustomerBindings") {
        const items = Array.isArray(result.items) ? result.items : [];
        responseText = items.length
          ? "ลูกค้ารออนุมัติ (" + items.length + ")\n" + items.slice(0, 10).map((x) =>
              "#" + x.rowNo + " " + (x.name || "-") + " | คิว " + (x.queue || "-") + " | " + (x.source || "-")
            ).join("\n")
          : (result.message || "ไม่มีลูกค้ารออนุมัติ");
      } else if (command.action === "resolveCustomerBinding") {
        responseText = result.message || (result.resolved ? "ดำเนินการแล้ว" : "ดำเนินการไม่ได้");
        if (result.resolved && result.customerLineUserId) {
          const customerText = result.approved
            ? "ผูกบัญชีสำเร็จแล้ว\nพิมพ์ ยอดปิด เพื่อดูยอดปิดของคุณได้ทันที"
            : "คำขอผูกบัญชีไม่ได้รับการอนุมัติ กรุณาติดต่อเจ้าหน้าที่";
          await pushMessage(result.customerLineUserId, [{
            type: "text",
            text: customerText,
            ...(result.approved ? { quickReply: customerSelfQuickReply() } : {}),
          }]).catch((error) => console.warn("Customer binding result push failed", error));
        }
      } else if (command.action === "readinessCheck") {
        if (!Array.isArray(result.checks)) {
          responseText = result.message || "ตรวจความพร้อมไม่ได้";
        } else {
          responseText = [
            "เช็กพร้อมใช้ Admin ID",
            "ผ่าน " + result.passed + "/" + result.total + " (" + result.percent + "%)",
            "",
            ...result.checks.map((x) => (x.pass ? "✓ " : "✗ ") + x.name + (x.detail ? " | " + x.detail : ""))
          ].join("\n");
        }
      } else if (command.action === "setBotSwitch") {
        responseText = result.message || (result.changed ? "อัปเดตระบบแล้ว" : "อัปเดตระบบไม่ได้");
      } else if (command.action === "getBridgeVersion") {
        responseText = "Admin ID\nApps Script version: " + (result.version || "ไม่ทราบ");
      } else if (result.needsSelection) {
        responseText =
          "พบหลายรายการ กรุณาใช้เบอร์โทร / Apple ID หรือระบุ แหล่ง:คิว เช่น v6:101\n\n" +
          formatCustomerMatches(result.matches || []);
      } else if (command.action === "getCustomerInfo") {
        responseText = result.info
          ? formatCustomerInfo(result.info, command.field)
          : "ไม่พบข้อมูลลูกค้า";
      } else if (command.action === "auditSourceWriteCapabilities") {
        const a = result.summary;
        if (!a) {
          responseText = result.message || "ตรวจความพร้อมเขียนต้นทางไม่ได้";
        } else {
          const notReady = (result.items || []).filter((x) => !x.paymentReady || !x.closeReady).slice(0, 8);
          responseText = [
            "ตรวจเขียนต้นทาง",
            "แท็บทั้งหมด: " + a.tabs,
            "อ่านข้อมูลหลักพร้อม: " + a.safeRead,
            "พร้อม mapping ชำระ: " + a.paymentReady,
            "พร้อม mapping ปิดยอด: " + a.closeReady,
            "เขียนจริง: " + (result.writesEnabled ? "เปิด" : "ปิดเพื่อความปลอดภัย"),
            ...(notReady.length ? ["", "ยังต้องตรวจ:", ...notReady.map((x) =>
              "• " + x.source + (x.sheet ? " / " + x.sheet : "") +
              " | พบ " + ((x.fields || []).join(", ") || "หัวตารางไม่ครบ")
            )] : [])
          ].join("\n");
        }
      } else if (command.action === "auditSourceSchemas") {
        const a = result.summary;
        if (!a) {
          responseText = result.message || "ตรวจชีตต้นทางไม่ได้";
        } else {
          const issues = (result.items || []).filter((x) => !x.ready).slice(0, 8);
          responseText = [
            "ตรวจชีตต้นทาง",
            "แหล่งข้อมูล: " + a.sources,
            "แท็บที่ตรวจ: " + a.tabs,
            "พร้อม: " + a.ready,
            "มีจุดต้องตรวจ: " + a.issues,
            ...(issues.length ? ["", "จุดที่ต้องตรวจ:", ...issues.map((x) => "• " + x.source + (x.sheet ? " / " + x.sheet : "") + " : " + (x.missing || []).join(", "))] : [])
          ].join("\n");
        }
      } else if (command.action === "listDueCustomers") {
        const items = Array.isArray(result.items) ? result.items : [];
        const title = command.dueMode === "overdue"
          ? "ค้างชำระ"
          : command.dueMode === "upcoming"
            ? "ใกล้ครบกำหนด"
            : "ครบกำหนดวันนี้";
        responseText = items.length
          ? title + " (" + items.length + ")\n" + items.slice(0, 10).map((x, i) => {
              const lag = x.daysDelta < 0 ? "ค้าง " + Math.abs(x.daysDelta) + " วัน" : (x.daysDelta > 0 ? "อีก " + x.daysDelta + " วัน" : "วันนี้");
              return (i + 1) + ". " + (x.name || "-") + (x.queue ? " | คิว " + x.queue : "") + " | " + (x.dueDate || "-") + " | " + lag;
            }).join("\n") + (items.length > 10 ? "\nแสดง 10 รายการแรก" : "")
          : "ไม่มีรายการ" + title;
      } else if (command.action === "getCalculatedSummary") {
        const s = result.summary;
        if (!s) {
          responseText = "ไม่พบข้อมูลลูกค้า";
        } else if (command.summaryField === "discount") {
          responseText = [
            (s.customer?.name || "-") + (s.customer?.queue ? " / คิว " + s.customer.queue : ""),
            "สิทธิ์ส่วนลด: " + (s.discountEligible ? "มีสิทธิ์" : "ไม่มีสิทธิ์"),
            s.discountEligible ? "ส่วนลดค่าเช่า: " + s.discountPercent + "%" : null,
            s.discountStartDate ? "เริ่มนับสิทธิ์: " + s.discountStartDate : null,
            s.crossCycleOutstanding ? "มีรายการข้ามรอบ จึงงดส่วนลด" : null
          ].filter(Boolean).join("\n");
        } else {
          responseText = [
            (s.customer?.name || "-") + (s.customer?.queue ? " / คิว " + s.customer.queue : ""),
            "เงินต้น: " + Number(s.principal || 0).toLocaleString("th-TH"),
            "ค่าเช่ารวมรอบ: " + Number(s.accumulatedFee || 0).toLocaleString("th-TH"),
            "ค้าง: " + Number(s.overdueDays || 0) + " วัน",
            "ค่าปรับ: " + Number(s.lateFee || 0).toLocaleString("th-TH"),
            "สิทธิ์ลด: " + (s.discountEligible ? s.discountPercent + "%" : "ไม่มี"),
            "ยอดปิดคำนวณ: " + Number(s.calculatedClose || 0).toLocaleString("th-TH"),
            "คำนวณ ณ " + s.calculatedAt
          ].join("\n");
        }
      } else if (command.action === "getStaffActivity") {
        const items = Array.isArray(result.items) ? result.items : [];
        const title = command.activityToday
          ? "กิจกรรมวันนี้"
          : "กิจกรรม " + (result.targetName || command.query || "");
        responseText = items.length
          ? title + "\n" + items.slice(0, 10).map((x, i) => {
              return (i + 1) + ". " + (x.dateTime || "-") + " | " + (x.staffName || "-") +
                " | " + (x.command || x.actionName || "-") +
                (x.query ? " | " + x.query : "") +
                " | " + (x.status || x.result || "-");
            }).join("\n") + (items.length > 10 ? "\nแสดง 10 รายการล่าสุด" : "")
          : (result.message || "ไม่พบกิจกรรม");
      } else if (command.action === "dailyOwnerReport") {
        const r = result.report;
        responseText = r ? [
          "รายงานวันนี้",
          "ใช้งานคำสั่ง: " + r.commandCount,
          "ค้นลูกค้า: " + r.searchCount,
          "ผิดพลาด: " + r.errorCount,
          "คิวรอตรวจ: " + r.pendingReview,
          "เจ้าหน้าที่รออนุมัติ: " + r.pendingStaff
        ].join("\n") : (result.message || "ไม่พบรายงาน");
      } else if (command.action === "systemStatus") {
        const x = result.status;
        responseText = x ? [
          "สถานะระบบ " + x.botName,
          "บอตหลัก: " + (x.masterEnabled ? "เปิด" : "ปิด"),
          "เจ้าหน้าที่: " + (x.staffEnabled ? "เปิด" : "ปิด"),
          "กลุ่ม LINE: " + (x.groupEnabled ? "เปิด" : "ปิด"),
          "แหล่งข้อมูลเปิดใช้: " + x.enabledSources,
          "OK Slip: " + (x.okSlipEnabled ? "เปิด" : "ยังไม่เชื่อม"),
          "Webhook: " + x.webhookStatus,
          "เขียนชีตต้นทาง: " + (x.financialSourceWrites ? "เปิด" : "ปิดเพื่อความปลอดภัย"),
          "แจ้งเตือนลูกค้าโดยตรง: " + (x.reminderInternalOnly ? "ยังปิด" : "เปิด")
        ].join("\n") : (result.message || "ไม่พบสถานะระบบ");
      } else if (command.action === "getHistory") {
        responseText = formatHistory(result.items || []);
      } else if (command.action === "addNote") {
        responseText = result.added
          ? `บันทึกโน้ตแล้ว: ${result.customer?.name || command.query}`
          : "ไม่พบข้อมูลลูกค้า";
      } else if (["queuePayment", "queueSlipReview", "queueClose"].includes(command.action)) {
        responseText = result.message || (result.queued ? "ส่งเข้าคิวตรวจสอบแล้ว" : "ไม่สามารถดำเนินการได้");

        if (result.queued && result.rowNo && Array.isArray(result.ownerLineUserIds)) {
          const customerName = result.customer?.name || command.query || "-";
          const queueText = [
            "มีรายการรอตรวจ",
            "#" + result.rowNo + " | " + (result.type || "-"),
            "ลูกค้า: " + customerName,
            result.amount ? "ยอด: " + result.amount : null,
            "ผู้ส่ง: " + (access.staffName || "-")
          ].filter(Boolean).join("\n");

          const ownerMessage = {
            type: "text",
            text: queueText,
            quickReply: {
              items: [
                {
                  type: "action",
                  action: {
                    type: "message",
                    label: "ผ่าน",
                    text: "ผ่านคิว " + result.rowNo
                  }
                },
                {
                  type: "action",
                  action: {
                    type: "message",
                    label: "ไม่ผ่าน",
                    text: "ไม่ผ่านคิว " + result.rowNo
                  }
                }
              ]
            }
          };

          await Promise.all(
            result.ownerLineUserIds.map((ownerId) =>
              pushMessage(ownerId, [ownerMessage]).catch((error) => {
                console.warn("Owner review alert failed", error);
              })
            )
          );
        }
      } else if (command.action === "cancelReviewQueue") {
        responseText = result.message || (result.cancelled ? "ยกเลิกคิวแล้ว" : "ยกเลิกคิวไม่ได้");
      } else if (command.action === "planSourceWrite") {
        const p = result.plan;
        responseText = p ? [
          "จำลองบันทึก #" + p.reviewRowNo,
          "ประเภท: " + (p.type || "-"),
          "ต้นทาง: " + (p.source || "-") + " / " + (p.sheet || "-") + " แถว " + (p.sourceRow || "-"),
          "ลูกค้า: " + (p.name || "-") + (p.queue ? " | คิว " + p.queue : ""),
          "สถานะล่าสุด: " + (p.currentStatus || "-"),
          p.requestedAmount ? "ยอดที่ขอ: " + p.requestedAmount : null,
          "เขียนต้นทางจริง: " + (p.writesEnabled ? "เปิด" : "ปิดเพื่อความปลอดภัย"),
          "ฟิลด์ต้นทางที่ตรวจพบ: " + ((p.detectedFields || []).join(", ") || "ไม่พบ"),
          "",
          ...(p.proposed || []).map((x) => "• " + x)
        ].filter(Boolean).join("\n") : (result.message || "จำลองไม่ได้");
      } else if (command.action === "getReviewQueueItem") {
        const x = result.item;
        const live = result.liveCustomer;
        responseText = x ? [
          "คิวตรวจสอบ #" + x.rowNo,
          "ประเภท: " + (x.type || "-"),
          "ลูกค้า: " + (x.name || "-"),
          x.queue ? "คิวลูกค้า: " + x.queue : null,
          x.amount ? "ยอด: " + x.amount : null,
          "แหล่ง: " + (x.source || "-"),
          "ผู้ส่ง: " + (x.staff || "-"),
          "สถานะ: " + (x.status || "-"),
          live ? "ต้นทางล่าสุด: " + (live.status || "-") + (live.dueDate ? " | วันจ่าย " + live.dueDate : "") : "ต้นทางล่าสุด: ไม่พบ/เปลี่ยนแปลง",
          x.note ? "หมายเหตุ: " + x.note : null
        ].filter(Boolean).join("\n") : (result.message || "ไม่พบคิวนี้");
      } else if (command.action === "listReviewQueue") {
        const items = Array.isArray(result.items) ? result.items : [];
        responseText = items.length
          ? "คิวตรวจสอบ:\n" + items.map((x) => {
              const parts = ["#" + x.rowNo, x.type || "-", x.name || "-", x.queue ? "คิว " + x.queue : "", x.amount ? "ยอด " + x.amount : "", x.staff ? "โดย " + x.staff : ""].filter(Boolean);
              return parts.join(" | ");
            }).join("\n")
          : "ไม่มีคิวรอตรวจ";
      } else if (command.action === "resolveReviewQueue") {
        responseText = result.message || (result.resolved ? "อัปเดตคิวแล้ว" : "ไม่สามารถดำเนินการได้");

        if (result.resolved && result.requesterLineUserId) {
          const staffText = result.decision === "ผ่าน"
            ? (result.type === "ปิดยอด"
                ? "คิว #" + result.rowNo + " ผ่านการตรวจสอบแล้ว\nรอรับรหัส***** สักครู่นะครับ ภายใน 24 ชม."
                : "คิว #" + result.rowNo + " ผ่านการตรวจสอบแล้ว\nบันทึกประวัติแล้ว แต่ยังไม่มีการแก้ยอดในชีตต้นทาง")
            : "คิว #" + result.rowNo + " ไม่ผ่านการตรวจสอบ";
          await pushMessage(result.requesterLineUserId, [
            { type: "text", text: staffText }
          ]).catch((error) => {
            console.warn("Review result notification failed", error);
          });
        }
      } else if (command.action === "getReminderBatch") {
        const d = result.digest;
        responseText = d ? [
          "ทดสอบแจ้งเตือน",
          "ใกล้ครบกำหนด: " + (d.upcomingCount || 0),
          "ครบกำหนดวันนี้: " + (d.todayCount || 0),
          "ค้างชำระ: " + (d.overdueCount || 0),
          "ผู้รับแจ้งเตือน: " + ((result.recipients || []).length),
          "อัปเดต: " + (d.generatedAt || "-")
        ].join("\n") : "ยังไม่มีข้อมูลแจ้งเตือน";
      } else if (command.action === "setGroupNotification") {
        responseText = result.message || (result.changed ? "อัปเดตการแจ้งเตือนกลุ่มแล้ว" : "ไม่สามารถดำเนินการได้");
      } else if (command.action === "installReminderTrigger") {
        responseText = result.message || (result.installed ? "ติดตั้งแจ้งเตือนแล้ว" : "ติดตั้งไม่สำเร็จ");
      } else if (command.action === "getReminderTriggerStatus") {
        responseText = result.installed
          ? "แจ้งเตือนรายวัน: ติดตั้งแล้ว\nเวลาเป้าหมาย: " + (result.remindTime || "09:00")
          : "แจ้งเตือนรายวัน: ยังไม่ได้ติดตั้ง";
      } else if (command.action === "setGroupEnabled") {
        responseText = result.message || (result.changed ? "อัปเดตกลุ่มแล้ว" : "ไม่สามารถดำเนินการได้");
      } else if (command.action === "getGroupStatus") {
        const g = result.group;
        responseText = g ? [
          "สถานะกลุ่ม: " + (g.name || "-"),
          "บอต: " + (g.botEnabled ? "เปิด" : "ปิด"),
          "ตอบข้อความ: " + (g.replyEnabled ? "เปิด" : "ปิด"),
          "แจ้งเตือน: " + (g.notificationsEnabled ? "เปิด" : "ปิด"),
          "โหมด: " + (g.mode || "-")
        ].join("\n") : (result.message || "ไม่พบข้อมูลกลุ่ม");
      } else if (command.action === "getStaffPermissions") {
        if (!result.permissions) {
          responseText = result.message || "ไม่พบข้อมูลสิทธิ์";
        } else {
          const enabled = Object.entries(result.permissions).filter(([,v]) => v).map(([k]) => "✓ " + k);
          const disabled = Object.entries(result.permissions).filter(([,v]) => !v).map(([k]) => "− " + k);
          responseText = [
            "สิทธิ์: " + (result.staffName || "-"),
            "สถานะ: " + (result.status || "-"),
            "เปิดอยู่:",
            ...(enabled.length ? enabled : ["ไม่มี"]),
            "ปิดอยู่:",
            ...(disabled.length ? disabled : ["ไม่มี"])
          ].join("\n");
        }
      } else if (command.action === "setStaffPermission") {
        responseText = result.message || (result.changed ? "อัปเดตสิทธิ์แล้ว" : "ไม่สามารถอัปเดตสิทธิ์ได้");
        if (result.changed && result.staffLineUserId) {
          await pushMessage(result.staffLineUserId, [{
            type: "text",
            text: (result.enabled ? "ได้รับสิทธิ์: " : "ถูกถอนสิทธิ์: ") + result.permissionName
          }]).catch((error) => console.warn("Permission notification failed", error));
        }
      } else if (command.action === "listStaff") {
        const items = Array.isArray(result.items) ? result.items : [];
        responseText = items.length
          ? "เจ้าหน้าที่:\n" + items.map((x, i) => {
              const state = x.status || (x.lineBound ? "ยังไม่อนุมัติ" : "ยังไม่ลงทะเบียน");
              const bot = x.botEnabled ? "บอตเปิด" : "บอตปิด";
              return (i + 1) + ". " + x.staffName + " | " + (x.role || "พนักงาน") + " | " + state + " | " + bot;
            }).join("\n")
          : "ยังไม่มีเจ้าหน้าที่";
      } else if (command.action === "setStaffEnabled") {
        responseText = result.message || (result.changed ? "อัปเดตเจ้าหน้าที่แล้ว" : "ไม่สามารถดำเนินการได้");

        if (result.changed && result.staffLineUserId) {
          const staffText = result.enabled
            ? "บัญชี Admin ID ของคุณถูกเปิดใช้งานแล้ว"
            : "บัญชี Admin ID ของคุณถูกระงับการใช้งาน";
          await pushMessage(result.staffLineUserId, [{ type: "text", text: staffText }]).catch((error) => {
            console.warn("Staff status notification failed", error);
          });
        }
      } else if (command.action === "listPendingStaff") {
        const items = Array.isArray(result.items) ? result.items : [];
        responseText = items.length
          ? "รออนุมัติ:\n" + items.map((x, i) => `${i + 1}. ${x.staffName}${x.registeredAt ? " | " + x.registeredAt : ""}`).join("\n")
          : "ไม่มีเจ้าหน้าที่รออนุมัติ";
      } else if (command.action === "rejectStaff") {
        responseText = result.message || (result.rejected ? "ไม่อนุมัติเจ้าหน้าที่แล้ว" : "ไม่สามารถดำเนินการได้");

        if (result.rejected && result.staffLineUserId) {
          await pushMessage(result.staffLineUserId, [
            {
              type: "text",
              text: "คำขอใช้งาน Admin ID ไม่ได้รับการอนุมัติ"
            }
          ]).catch((error) => {
            console.warn("Staff rejection notification failed", error);
          });
        }
      } else if (command.action === "approveStaff") {
        responseText = result.message || (result.approved ? "อนุมัติเจ้าหน้าที่แล้ว" : "ไม่สามารถอนุมัติได้");

        if (result.approved && result.staffLineUserId) {
          await pushMessage(result.staffLineUserId, [
            {
              type: "text",
              text: "อนุมัติแล้ว\nตอนนี้สามารถใช้งาน Admin ID ได้"
            }
          ]).catch((error) => {
            console.warn("Staff approval notification failed", error);
          });
        }
      }

      await replyMessage(event.replyToken, [{ type: "text", text: responseText || "ดำเนินการแล้ว" }]);

      await safeLogAction({
        lineUserId,
        staffName: access.staffName || "",
        role: access.role || "",
        command: command.prefix || text,
        query: command.query || "",
        source: sourceType,
        result: result?.needsSelection ? "หลายรายการ" : (result?.ok === false ? "ผิดพลาด" : "สำเร็จ"),
        actionName: command.action || "",
        status: result?.ok === false ? "ผิดพลาด" : "สำเร็จ",
        note: ""
      });
      return;
    }

    const result = await callSheetsBridge({
      action: "searchCustomer",
      query: text,
      lineUserId,
      sourceType,
      groupId,
    });

    await replyMessage(event.replyToken, [
      {
        type: "text",
        text: formatCustomerMatches(result.matches || []),
      },
    ]);

    await safeLogAction({
      lineUserId,
      staffName: access.staffName || "",
      role: access.role || "",
      command: "ค้นหา",
      query: text,
      source: sourceType,
      result: Array.isArray(result.matches) ? String(result.matches.length) + " รายการ" : "0 รายการ",
      actionName: "searchCustomer",
      status: "สำเร็จ",
      note: ""
    });
  } catch (error) {
    console.error("Sheets bridge error", error);
    await replyMessage(event.replyToken, [
      {
        type: "text",
        text: "ระบบค้นหาลูกค้ายังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",
      },
    ]);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "Admin ID LINE Webhook",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    return res.status(500).json({
      ok: false,
      error: "LINE_CHANNEL_SECRET is not configured",
    });
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["x-line-signature"];

    if (!verifyLineSignature(rawBody, signature, secret)) {
      return res.status(401).json({ ok: false, error: "Invalid signature" });
    }

    const body = JSON.parse(rawBody.toString("utf8") || "{}");
    const events = Array.isArray(body.events) ? body.events : [];

    await Promise.all(events.map(handleEvent));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Webhook processing failed",
    });
  }
}
