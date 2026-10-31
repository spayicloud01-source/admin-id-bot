import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import handler from '../api/line/webhook.js';

process.env.LINE_CHANNEL_SECRET='test';
process.env.LINE_CHANNEL_ACCESS_TOKEN='test';
process.env.SHEETS_BRIDGE_SECRET='test';
process.env.GOOGLE_APPS_SCRIPT_URL='https://bridge.test';

let role='เจ้าของ', allowed=true;
let paymentResult={queued:true,message:'ส่งเข้าคิวตรวจสอบแล้ว'};
let duplicateAcrossAllowedTabs=false;
let calls=[], replies=[];

globalThis.fetch=async(url, options={})=>{
  const body=JSON.parse(options.body||'{}');
  let data={ok:true};

  if(url.startsWith('https://bridge.test')) {
    calls.push(body);

    if(body.action==='checkAccess') {
      data={ok:true,allowed:body.permission==='บันทึกชำระ'?allowed:true,role,staffName:'staff'};
    }

    if(body.action==='searchCustomer') {
      const v6={source:'v6',sheet:'V6/10-69',row:3,queue:'101',name:'ลูกค้า A',
        phone:'0811111111',appleId:'a@example.com'};
      const v3={source:'v1/v3',sheet:'v3/10-69',row:3,queue:'101',name:'ลูกค้า B',
        phone:'0822222222',appleId:'b@example.com'};
      // One unqualified GAS search now scans BOTH allowed tabs in one invocation.
      data={ok:true,matches:body.query==='v6:101'?[v6]:
        body.query==='v1/v3:101'?(duplicateAcrossAllowedTabs?[v3]:[]):
        body.query==='101'?(duplicateAcrossAllowedTabs?[v6,v3]:[v6]):[]};
    }

    if(body.action==='queuePayment') data=allowed
      ? {ok:true,...paymentResult}
      : {ok:true,queued:false,message:'บัญชีนี้ไม่มีสิทธิ์ บันทึกชำระ'};

    if(body.action==='getReviewQueueItem') {
      data={ok:true,item:{rowNo:2,type:'บันทึกชำระ',queue:'101',name:'ลูกค้า A',amount:500}};
    }
    if(body.action==='rollbackReviewGroup') {
      data={ok:true,rolledBack:true,rowNos:[2],
        message:'ยกเลิกรายการ #2 แล้ว และคืนค่าชีตต้นทาง'};
    }
  }

  if(url.endsWith('/message/reply')) replies.push(body.messages);
  return {ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data};
};

async function send(text, type='user') {
  calls=[]; replies=[];
  const raw=Buffer.from(JSON.stringify({
    events:[{
      type:'message',
      message:{type:'text',text},
      replyToken:'test',
      source:{type,userId:'U-test-'+role+'-'+(allowed?'permitted':'denied')}
    }]
  }));
  const req=Readable.from([raw]);
  req.method='POST';
  req.headers={'x-line-signature':crypto.createHmac('sha256','test').update(raw).digest('base64')};
  const res={status(code){assert.equal(code,200);return this},json(){}};
  await handler(req,res);
  return replies.at(-1);
}

const oldBase=[
  'ค้นลูกค้า','ครบกำหนดวันนี้','ใกล้ครบกำหนด','ค้างชำระทั้งหมด',
  'คิวตรวจสอบ','อ่านบัตรล่าสุด','กรอกชื่อเอง','รายงานวันนี้'
];

for(role of ['เจ้าของ','แอดมิน','พนักงาน','เจ้าหน้าที่']) {
  const menu=await send('เมนู');
  assert.equal(menu[0].template.actions[0].label,'รับชำระ');

  const expected=role==='เจ้าของ'
    ? oldBase.concat(['ส่งแจ้งเตือนทันที','จัดการระบบ','ลูกค้ารออนุมัติ','กิจกรรมวันนี้','สถานะระบบ'])
    : oldBase;
  assert.deepEqual(menu.at(-1).quickReply.items.map(x=>x.action.text),expected);

  const help=await send('รับชำระ');
  assert.match(help[0].text,/ยอดชำระจริง/);
  assert.ok(!calls.some(x=>x.action==='queuePayment'));

  await send('รับชำระ 101 500');
  const searches=calls.filter(x=>x.action==='searchCustomer');
  assert.equal(searches.length,1,'unqualified lookup scans two allowed tabs in one GAS request');
  assert.deepEqual(searches.map(x=>x.query),['101']);

  const payments=calls.filter(x=>x.action==='queuePayment');
  assert.equal(payments.length,1);
  assert.equal(payments[0].amount,500);
  assert.equal(payments[0].query,'v6:a@example.com');
  assert.deepEqual(payments[0].exactCustomer,{
    source:'v6',sheet:'V6/10-69',row:3,queue:'101',name:'ลูกค้า A'
  });
  assert.ok(calls.some(x=>x.action==='checkAccess'&&x.permission==='บันทึกชำระ'));
}

await send('รับชำระ v6:101 500');
assert.equal(calls.filter(x=>x.action==='searchCustomer').length,1);
assert.equal(calls.find(x=>x.action==='searchCustomer').query,'v6:101');
assert.equal(calls.filter(x=>x.action==='queuePayment').length,1);

for(const text of ['รับชำระ 101 0','รับชำระ 101 -10','รับชำระ 101 abc','รับชำระ 101 Infinity']) {
  await send(text);
  assert.ok(!calls.some(x=>x.action==='queuePayment'));
}

allowed=false;
assert.equal((await send('เมนู')).length,1);
const deniedPayment=await send('รับชำระ 101 500');
assert.equal(calls.filter(x=>x.action==='queuePayment').length,1);
assert.match(deniedPayment[0].text,/ไม่มีสิทธิ์/);
allowed=true;

assert.equal((await send('เมนู','group')).length,1);
await send('รับชำระ 101 500','group');
assert.ok(!calls.some(x=>x.action==='queuePayment'));

paymentResult={queued:false,duplicate:true,message:'มีคิวซ้ำที่ยังรอตรวจ #9'};
assert.match((await send('รับชำระ 101 500'))[0].text,/คิวซ้ำ/);

paymentResult={queued:false,needsSelection:true,matches:[{name:'A',queue:'101',source:'v6'}]};
assert.match((await send('รับชำระ 101 500'))[0].text,/ข้อมูลซ้ำกับชีตเก่า/);

paymentResult={queued:true,message:'ส่งเข้าคิวตรวจสอบแล้ว'};
duplicateAcrossAllowedTabs=true;
assert.match((await send('รับชำระ 101 500'))[0].text,/พบหลายรายการ/);
assert.ok(!calls.some(x=>x.action==='queuePayment'));
duplicateAcrossAllowedTabs=false;

const cancelReply=await send('ยกเลิกรายการ 2');
assert.ok(calls.some(x=>x.action==='getReviewQueueItem'&&x.query==='2'),
  'cancel preview must read the queued item before asking for confirmation');
assert.ok(!calls.some(x=>x.action==='rollbackReviewGroup'),
  'cancel preview must NEVER write or roll back automatically');
assert.match(cancelReply[0].text,/ตรวจสอบก่อนยกเลิก/);
assert.equal(cancelReply[0].quickReply.items[0].action.label,'ยืนยันยกเลิก');
assert.equal(cancelReply[0].quickReply.items[0].action.text,'ยืนยันยกเลิก 2');
const confirmed=await send('ยืนยันยกเลิก 2');
assert.ok(calls.some(x=>x.action==='rollbackReviewGroup'&&x.query==='2'),
  'only the confirmation command may roll back a payment');
assert.match(confirmed[0].text,/ยกเลิกรายการ #2/);

console.log('Staff payment tests passed');
