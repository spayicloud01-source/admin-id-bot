import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import handler from '../api/line/webhook.js';
process.env.LINE_CHANNEL_SECRET='test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN='test-token';
process.env.SHEETS_BRIDGE_SECRET='bridge-secret';
process.env.GOOGLE_APPS_SCRIPT_URL='https://example.test/bridge';
process.env.PUBLIC_BASE_URL='https://admin-id-bot.example';
let binding;
let selfResult={bound:false};
const replies=[];
const bindingRequests=[];
const auditLogs=[];
const json=(body,status=200)=>({ok:status<400,status,json:async()=>body,text:async()=>JSON.stringify(body)});
globalThis.fetch=async(url,options={})=>{
 const method=options.method||'GET';
 if(url.startsWith('https://example.test/bridge')) {
 const input=JSON.parse(options.body);
  if(input.action==='logAction') {auditLogs.push(input);return json({ok:true,logged:true});}
  if(input.action==='requestCustomerBinding') {bindingRequests.push(input);return json({ok:true,...binding});}
  if(input.action==='getCustomerSelf') return json({ok:true,...selfResult});
  if(input.action==='checkAccess') return json({ok:true,allowed:false,message:'บัญชี LINE นี้ยังไม่มีสิทธิ์ใช้งาน Admin ID'});
  return json({ok:true,bound:false});
 }
 if(url.endsWith('/message/reply')) {replies.push(JSON.parse(options.body).messages);return json({});}
 if(url.endsWith('/richmenu/list')) return json({richmenus:[{name:'admin-id-customer-v2',richMenuId:'richmenu-test'}]});
 if(url.endsWith('/content')) return json({});
 return json({});
};
async function send(id,text='6121 สมชาย ใจดี'){
 const raw=Buffer.from(JSON.stringify({events:[{type:'message',message:{type:'text',text},replyToken:'reply',source:{type:'user',userId:id}}]}));
 const req=Readable.from([raw]);req.method='POST';req.headers={'x-line-signature':crypto.createHmac('sha256',process.env.LINE_CHANNEL_SECRET).update(raw).digest('base64')};
 const res={status(status){this.code=status;return this},json(data){this.body=data;return this}};
 await handler(req,res);assert.equal(res.code,200);
 return replies.at(-1);
}
binding={bound:true,message:'ตรวจสอบข้อมูลถูกต้องแล้ว',customerOverview:{name:'สมชาย ใจดี',queue:'6121',model:'iPhone 15 Pro Max',principal:'15,000',fee:'1,500',saleDate:'24/09/2026'}};
const messages=await send('U-customer');
assert.equal(messages.length,3);
const card=messages[0];assert.equal(card.type,'flex');
const fields=card.contents.body.contents.filter(x=>x.type==='box').map(x=>x.contents.map(y=>y.text));
assert.deepEqual(fields,[['ชื่อ','สมชาย ใจดี'],['คิว','6121'],['รุ่น','iPhone 15 Pro Max'],['เบอร์โทร','ไม่มีข้อมูล'],['ยอด','15,000 บาท'],['ค่าเช่า','1,500 บาท'],['วันขาย/ฝาก','24/09/2026']]);
assert.deepEqual(card.quickReply.items.map(x=>x.action.text),['ชำระยอด','ยอดปิด','สถานะ','ข้อมูล','สิทธิ์ส่วนลด','ติดต่อแอดมิน']);
assert.deepEqual(card.contents.footer.contents.filter(x=>x.type==='box').flatMap(x=>x.contents.map(y=>y.action.text)),['ชำระยอด','ยอดปิด','สถานะ','ข้อมูล','สิทธิ์ส่วนลด','ติดต่อแอดมิน']);
assert.equal(messages[1].type,'image');
assert.match(messages[1].originalContentUrl,/api\/assets\/customer-terms$/);
assert.equal(messages[2].quickReply.items[0].action.text,'ยืนยันรับทราบเงื่อนไข');
binding={bound:false,message:'ข้อมูลไม่ตรง'};
const rejected=await send('U-other');assert.equal(rejected.length,1);assert.equal(rejected[0].type,'text');assert.equal(rejected[0].text,'ข้อมูลไม่ตรง');
binding={bound:true,message:'ตรวจสอบข้อมูลถูกต้องแล้ว',customerOverview:{name:'ภาณุ พันธ์',queue:'610-21',model:'iPhone 15',principal:'12,000',fee:'1,200',saleDate:'24/09/2026'}};
const hyphenated=await send('U-hyphen','610-21 ภาณุ พันธ์');
assert.equal(bindingRequests.at(-1).queue,'610-21');
assert.equal(bindingRequests.at(-1).fullName,'ภาณุ พันธ์');
assert.equal(hyphenated[0].type,'flex');
const invalid=await send('U-invalid','ผูกบัญชี 610-21');
assert.match(invalid[0].text,/กรุณาแจ้ง คิว/);
assert.equal(auditLogs.at(-1).status,'รูปแบบไม่ถูกต้อง');
const unbound=await send('U-unbound','สถานะ');
assert.equal(unbound[0].type,'text');
assert.equal(auditLogs.at(-1).status,'ไม่มีสิทธิ์');
assert.equal(auditLogs.at(-1).command,'สถานะ');
const denied=await send('U-unknown','ช่วยเหลือ');
assert.equal(denied[0].type,'text');
assert.equal(auditLogs.at(-1).status,'ไม่มีสิทธิ์');
assert.equal(auditLogs.at(-1).actionName,'checkAccess');
selfResult={bound:true,items:[{name:'ภาณุ',queue:'610-21',dueDate:'01/10/2026',overdueDays:0}]};
const naturalDue=await send('U-hyphen','จ่ายวันไหนดี');
assert.equal(naturalDue[0].type,'flex');
assert.match(naturalDue[0].contents.body.contents[1].text,/01\/10\/2026/);
assert.deepEqual(naturalDue[0].quickReply.items.map(x=>x.action.text),['ชำระยอด','ยอดปิด','สถานะ','ข้อมูล','สิทธิ์ส่วนลด','ติดต่อแอดมิน']);
assert.deepEqual(naturalDue[0].contents.footer.contents.filter(x=>x.type==='box').flatMap(x=>x.contents.map(y=>y.action.text)),['ชำระยอด','ยอดปิด','สถานะ','ข้อมูล','สิทธิ์ส่วนลด','ติดต่อแอดมิน']);
selfResult={bound:true,items:[{name:'ภาณุ',queue:'610-21',source:'v1/v3',principal:100,fee:15,accumulatedFee:15,lateFee:10,paymentTotal:25,calculatedClose:125,dueDate:'01/10/2026'}]};
const payment=await send('U-hyphen','ชำระยอด');
assert.equal(payment[0].type,'flex');
assert.match(payment[0].contents.hero.url,/source=v1%2Fv3/);
assert.match(payment[0].contents.hero.url,/amount=25\.00/);
assert.equal(payment[0].contents.footer.contents[0].action.label,'เปิด/บันทึก QR');
const fallback=await send('U-hyphen','มีเรื่องอยากถาม');
assert.equal(fallback[0].type,'flex');
assert.match(fallback[0].contents.body.contents[1].text,/ติดต่อแอดมิน/);
console.log('PASS: verified overview card, exact fields, six buttons; rejected binding has no card');
