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
    const command = parseCommand(text);

    const access = await callSheetsBridge({
      action: "checkAccess",
      lineUserId,
      sourceType,
      groupId,
      permission: command?.permission || "ดูข้อมูลลูกค้า",
    });

    if (!access.allowed) {
      await replyMessage(event.replyToken, [
        {
          type: "text",
          text: access.message || "บัญชี LINE นี้ยังไม่มีสิทธิ์ใช้งาน Admin ID",
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
      if (!command.query) {
        const usage =
          command.action === "addNote"
            ? "รูปแบบ: โน้ต <คำค้น> <ข้อความ>"
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
      }

      await replyMessage(event.replyToken, [{ type: "text", text: responseText || "ดำเนินการแล้ว" }]);
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
