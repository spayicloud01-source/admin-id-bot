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

async function handleEvent(event) {
  if (event.type !== "message" || event.message?.type !== "text") return;

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

    const access = await callSheetsBridge({
      action: "checkAccess",
      lineUserId,
      sourceType,
      groupId,
      permission: command?.permission || "ดูข้อมูลลูกค้า",
    });

    if (!access.allowed) {
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
          ].join("\n");

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

    if (text === "ช่วยเหลือ") {
      await replyMessage(event.replyToken, [
        {
          type: "text",
          text: [
            "คำสั่ง Admin ID",
            "• พิมพ์ชื่อ / เบอร์ / คิว / Apple ID เพื่อค้นหา",
            "• ประวัติ <คำค้น>",
            "• ดูโน้ต <คำค้น>",
            "• โน้ต <คำค้น> <ข้อความ>",
            "• ยอดปิด <คำค้น>",
            "• ค่าเช่า <คำค้น>",
            "• วันจ่าย <คำค้น>",
            "• ยอดค้าง <คำค้น>",
            "• สถานะ <คำค้น>"
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
              : `รูปแบบ: ${command.prefix} <คำค้น>`;
        await replyMessage(event.replyToken, [{ type: "text", text: usage }]);
        return;
      }

      const payload = {
        action: command.action,
        query: command.query,
        lineUserId,
        sourceType,
        groupId,
        staffName: access.staffName || "",
        role: access.role || "",
      };

      if (command.eventType) payload.eventType = command.eventType;
      if (command.note) payload.note = command.note;
      if (command.amount != null) payload.amount = command.amount;
      if (command.decision) payload.decision = command.decision;
      if (command.enabled != null) payload.enabled = command.enabled;

      const result = await callSheetsBridge(payload);

      let responseText = "";
      if (result.needsSelection) {
        responseText =
          "พบหลายรายการ กรุณาใช้คำค้นที่เจาะจงขึ้น เช่น เบอร์โทร / Apple ID / คิว พร้อมแหล่งข้อมูล\n\n" +
          formatCustomerMatches(result.matches || []);
      } else if (command.action === "getCustomerInfo") {
        responseText = result.info
          ? formatCustomerInfo(result.info, command.field)
          : "ไม่พบข้อมูลลูกค้า";
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
            ? "คิว #" + result.rowNo + " ผ่านการตรวจสอบแล้ว\nยังไม่มีการแก้ยอดในชีตต้นทาง"
            : "คิว #" + result.rowNo + " ไม่ผ่านการตรวจสอบ";
          await pushMessage(result.requesterLineUserId, [
            { type: "text", text: staffText }
          ]).catch((error) => {
            console.warn("Review result notification failed", error);
          });
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
