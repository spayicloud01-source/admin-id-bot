import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import handler from '../api/line/webhook.js';
process.env.LINE_CHANNEL_SECRET='test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN='test-token';
// This suite covers the legacy welcome/reply flow, which Production intentionally disables.
process.env.LINE_CUSTOMER_AUTO_REPLY_ENABLED='true';
process.env.SHEETS_BRIDGE_SECRET='bridge-secret';
process.env.GOOGLE_APPS_SCRIPT_URL='https://example.test/bridge';
process.env.PUBLIC_BASE_URL='https://admin-id-bot.example';
let binding;
let selfResult={bound:false};
let staffAccess={ok:true,allowed:false,message:'บัญชี LINE นี้ยังไม่มีสิทธิ์ใช้งาน Admin ID'};
const replies=[];
const loadingRequests=[];
const progressMessages=[];
const bindingRequests=[];
const auditLogs=[];
const menuLinks=[];
const json=(body,status=200)=>({ok:status<400,status,json:async()=>body,text:async()=>JSON.stringify(body)});
globalThis.fetch=async(url,options={})=>{
 const method=options.method||'GET';
 if(url.endsWith('/chat/loading/start')) {loadingRequests.push(JSON.parse(options.body));return json({});}
 if(url.endsWith('/message/push')) {progressMessages.push(...JSON.parse(options.body).messages);return json({});}
 if(url.startsWith('https://example.test/bridge')) {
 const input=JSON.parse(options.body);
  if(input.action==='logAction') {auditLogs.push(input);return json({ok:true,logged:true});}
  if(input.action==='requestCustomerBinding') {bindingRequests.push(input);return json({ok:true,...binding});}
  if(input.action==='getCustomerSelf') return json({ok:true,...selfResult});
  if(input.action==='checkAccess') return json(staffAccess);
  return json({ok:true,bound:false});
 }
 if(url.endsWith('/message/reply')) {replies.push(JSON.parse(options.body).messages);return json({});}
 if(url.endsWith('/richmenu/list')) return json({richmenus:[{name:'admin-id-customer-v4-web',richMenuId:'richmenu-test'}]});
 if(url.includes('/richmenu/richmenu-test')) {menuLinks.push(url);return json({});}
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
assert.deepEqual(loadingRequests.at(-1),{chatId:'U-customer',loadingSeconds:60});
assert.equal(progressMessages.at(-1).text,'กำลังตรวจสอบ');
assert.equal(messages.length,3);
const card=messages[0];assert.equal(card.type,'flex');
const fields=card.contents.body.contents.filter(x=>x.type==='box').map(x=>x.contents.map(y=>y.text));
assert.deepEqual(fields,[['ชื่อ','สมชาย ใจดี'],['คิว','6121'],['รุ่น','iPhone 15 Pro Max'],['เบอร์โทร','ไม่มีข้อมูล'],['ยอด','15,000 บาท'],['ค่าเช่า','1,500 บาท'],['วันขาย/ฝาก','24/09/2026']]);
assert.equal(card.quickReply,undefined,'welcome now uses persistent footer actions instead of quickReply');
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
// Legacy customer self-service LINE text responses are intentionally unavailable
// in the deployed quota-saving mode. Payment/discount web actions have dedicated
// endpoint tests; below we verify no-message safe menu migration instead.
// With customer auto replies off, tapping the OLD LINE message menu must
// refresh the verified customer's URI menu without replying or sending Push.
process.env.LINE_CUSTOMER_AUTO_REPLY_ENABLED='false';
staffAccess={ok:true,allowed:false,message:'บัญชี LINE นี้ยังไม่มีสิทธิ์ใช้งาน Admin ID'};
selfResult={bound:true,items:[{queue:'6121',status:'ใช้งาน',inactive:false}]};
const replyBeforeSilent=replies.length;
const pushBeforeSilent=progressMessages.length;
await send('U-silent','สถานะ');
assert.equal(replies.length,replyBeforeSilent,'no auto reply during LINE quota silence');
assert.equal(progressMessages.length,pushBeforeSilent,'no LINE push during menu relink');
assert.ok(menuLinks.some(url=>url.includes('/user/U-silent/')),'bound customer Rich Menu updates');
selfResult={bound:true,items:[{queue:'6121',status:'ปิดยอดแล้ว',inactive:true}]};
await send('U-closed','สถานะ');
assert.ok(!menuLinks.some(url=>url.includes('/user/U-closed/')),'closed customer never receives payment menu');
staffAccess={ok:true,allowed:false,message:'บัญชีเจ้าหน้าที่ถูกระงับ'};
selfResult={bound:true,items:[{queue:'6121',status:'ใช้งาน'}]};
await send('U-disabled-silent','สถานะ');
assert.ok(!menuLinks.some(url=>url.includes('/user/U-disabled-silent/')),'disabled staff menu must not be replaced');
console.log('PASS: verified welcome and silent, no-quota LINE Rich Menu migration; closed/staff customers excluded');
