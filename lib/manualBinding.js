/**
 * Admin ID - manual LINE customer binding adapter.
 * Bridge adapter: (action, payload) => Promise<result> using existing callSheetsBridge.
 * IMPORTANT: invoke only after verification of LINE webhook signature.
 * Staff actor identity MUST be derived from LINE's signed incoming event, never from command text.
 */

import { parseCustomerBindingInput, parseAdminBindingCommand } from './customerBindingParser.js';
export { parseCustomerBindingInput, parseAdminBindingCommand } from './customerBindingParser.js';

/**
 * A LINE message action makes the staff account send a real signed incoming
 * message to the bot. It does not depend on LINE OA Manager outgoing webhooks.
 * Only display verified pending requests; GAS always re-authorizes approval.
 */
export function buildPendingBindingFlex(items = []) {
  const listed = (Array.isArray(items) ? items : []).filter(x =>
    ['รอตรวจ', 'รอข้อมูล'].includes(x?.status) &&
    /^[a-f0-9]{8}$/i.test(String(x.requestId || ''))
  ).slice(0, 5);
  if (!listed.length) return null;
  const contents = listed.map(x => {
    const eligible = x.status === 'รอตรวจ' &&
      /^[A-Z0-9-]{2,24}$/i.test(String(x.queue || '')) &&
      typeof x.name === 'string' && x.name.trim().length >= 2;
    return ({
    type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
    contents: [
      { type:'text',text:(eligible ? `${x.queue} ${x.name}` : 'รอข้อมูลคิวและชื่อลูกค้า').slice(0, 80),wrap:true,weight:'bold',size:'md' },
      { type:'text',text:`คำขอ ${x.requestId}`,size:'xs',color:'#666666' },
      ...(x.maskedLine ? [{type:'text',text:`LINE ${String(x.maskedLine).slice(0,18)}`,size:'xs',color:'#666666'}] : []),
      ...(x.receivedAt ? [{type:'text',text:`รับข้อความ ${String(x.receivedAt).slice(0,35)}`,size:'xs',color:'#666666'}] : []),
      ...(eligible ? [{ type:'button',style:'primary',height:'sm',action:{
        type:'message',label:'ตรวจสอบและผูก',
        text:`ผูกคิว ${x.requestId} ${x.queue} ${x.name}`.slice(0,300)
      }}] : [{type:'text',text:'ยังผูกไม่ได้ ต้องให้ลูกค้าส่งคิวและชื่อก่อน',size:'xs',wrap:true,color:'#B06000'}])
    ]
  });
  });
  return {
    type: 'flex', altText: `รายการรอผูก LINE ${listed.length} รายการ`,
    contents: {type:'bubble',size:'mega',body:{type:'box',layout:'vertical',contents:[
      {type:'text',text:'รายการรอผูก LINE',weight:'bold',size:'lg'},
      {type:'text',text:'กดปุ่มเพื่อส่งคำสั่งผูก ระบบจะตรวจสิทธิ์และข้อมูลก่อนบันทึก',wrap:true,size:'xs',color:'#666666',margin:'md'},
      ...contents
    ]}}
  };
}

function isOk(result) {
  return result?.ok === true || result?.success === true;
}

/** Enqueue a verified LINE user after the ordinary auto-binding flow fails. */
export async function queueFailedCustomerBinding({ customerLineId, text, bridge, notifyStaff, replyCustomer }) {
  if (typeof customerLineId !== 'string' || !/^U[a-f\d]{32}$/i.test(customerLineId)) {
    return { handled: false, reason: 'invalid_line_id' };
  }
  const input = parseCustomerBindingInput(text);
  if (!input) return { handled: false, reason: 'invalid_customer_input' };
  // Any reported success requires a persisted row, not merely a received LINE webhook.
  try {
    const saved = await bridge('manualBindingRequest', { customerLineId, ...input });
    if (!isOk(saved) || !saved.requestId) return { handled: false, reason: 'bridge_not_persisted' };
    const notice = `รับคำขอผูกบัญชีแล้ว (รหัส ${saved.requestId.slice(0, 8)}) แอดมินจะตรวจสอบให้`;
    let customerReplySent = false;
    try {
      await replyCustomer(notice);
      customerReplySent = true;
    } catch (_) {
      // The pending request is already committed. LINE reply token expiry,
      // delivery failure, etc. must not be reported as a storage failure.
    }
    if (notifyStaff) {
      try {
        await notifyStaff(
          `มีลูกค้ารอผูก LINE\nรหัส ${saved.requestId}\nคิว ${input.queue}\nชื่อ ${input.name}\nส่ง "รายการรอผูก" เพื่อดูรายการ`,
          Array.isArray(saved.recipients) ? saved.recipients : [],
        );
      }
      catch (_) { /* A notification failure must not erase the pending request. */ }
    }
    return { handled: true, requestId: saved.requestId, customerReplySent };
  } catch (error) {
    // Never promise pending status if Google Sheets could not store it.
    return { handled: false, reason: 'bridge_unavailable', error: String(error?.message || error) };
  }
}

/** Process admin messages in the STAFF's own OA chat, not LINE OA Manager outbound messages. */
export async function handleAdminManualBinding({ text, actorLineId, bridge, replyStaff, replyStaffFlex, pushCustomer }) {
  const cmd = parseAdminBindingCommand(text);
  if (!cmd) return { handled: false };
  if (!/^U[a-f\d]{32}$/i.test(String(actorLineId || ''))) {
    await replyStaff('ไม่สามารถยืนยัน LINE ID ผู้สั่งงานได้');
    return { handled: true, ok: false };
  }
  try {
    if (cmd.kind === 'list') {
      const result = await bridge('manualBindingList', { actorLineId });
      if (!isOk(result)) throw new Error(result?.message || 'ไม่สามารถอ่านรายการได้');
      const items = Array.isArray(result.items) ? result.items.slice(0, 10) : [];
      const flex = buildPendingBindingFlex(items);
      if (flex && typeof replyStaffFlex === 'function') {
        await replyStaffFlex(flex);
        return { handled: true, ok: true, count: items.length };
      }
      await replyStaff(items.length
        ? `รายการรอผูก LINE\n${items.map(x => x.status === 'รอข้อมูล' ? `${x.requestId} | รอข้อมูลคิว/ชื่อ (ตรวจสอบในชีต)` : `${x.requestId} | ${x.queue} ${x.name}`).join('\n')}\n\nผูกคิว <รหัส> <คิว> <ชื่อ นามสกุล>\nรายการรอข้อมูลต้องให้ลูกค้าส่งคิวและชื่อก่อน`
        : 'ไม่มีรายการรอผูก LINE');
      return { handled: true, ok: true, count: items.length };
    }
    const result = await bridge('manualBindingApprove', {
      actorLineId, requestId: cmd.requestId, queue: cmd.queue, name: cmd.name,
    });
    if (!isOk(result)) {
      await replyStaff(`ผูกไม่สำเร็จ: ${result?.message || 'ข้อมูลไม่ตรงหรือไม่มีสิทธิ์'}`);
      return { handled: true, ok: false };
    }
    await replyStaff(`ผูก LINE สำเร็จ\nคิว ${result.queue}\n${result.name}\nชีต ${result.sheet}${result.alreadyBound ? '\n(เคยผูกอยู่แล้ว)' : ''}`);
    try {
      await pushCustomer(result.customerLineId,
        `ยืนยันผูกบัญชี LINE สำเร็จ\nคิว ${result.queue}\nชื่อ ${result.name}\nสามารถใช้เมนูลูกค้าได้แล้ว`);
    } catch (_) { /* Link is committed already; no retry of binding. */ }
    return { handled: true, ok: true, queue: result.queue };
  } catch (error) {
    await replyStaff('ระบบผูก LINE ขัดข้อง กรุณาตรวจสอบในชีตก่อนส่งคำสั่งซ้ำ');
    return { handled: true, ok: false, reason: String(error?.message || error) };
  }
}
