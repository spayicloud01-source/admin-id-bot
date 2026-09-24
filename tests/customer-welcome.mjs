import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import handler from '../api/line/webhook.js';
process.env.LINE_CHANNEL_SECRET='test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN='test-token';
process.env.SHEETS_BRIDGE_SECRET='bridge-secret';
process.env.GOOGLE_APPS_SCRIPT_URL='https://example.test/bridge';
let binding;
const replies=[];
const json=(body,status=200)=>({ok:status<400,status,json:async()=>body,text:async()=>JSON.stringify(body)});
globalThis.fetch=async(url,options={})=>{
 const method=options.method||'GET';
 if(url.startsWith('https://example.test/bridge')) {
  const input=JSON.parse(options.body);
  if(input.action==='requestCustomerBinding') return json({ok:true,...binding});
  if(input.action==='checkAccess') return json({ok:true,allowed:false,message:'บัญชี LINE นี้ยังไม่มีสิทธิ์ใช้งาน Admin ID'});
  return json({ok:true,bound:false});
 }
 if(url.endsWith('/message/reply')) {replies.push(JSON.parse(options.body).messages);return json({});}
 if(url.endsWith('/richmenu/list')) return json({richmenus:[{name:'admin-id-customer-v1',richMenuId:'richmenu-test'}]});
 if(url.endsWith('/content')) return json({});
 return json({});
};
async function send(id){
 const raw=Buffer.from(JSON.stringify({events:[{type:'message',message:{type:'text',text:'6121 สมชาย ใจดี'},replyToken:'reply',source:{type:'user',userId:id}}]}));
 const req=Readable.from([raw]);req.method='POST';req.headers={'x-line-signature':crypto.createHmac('sha256',process.env.LINE_CHANNEL_SECRET).update(raw).digest('base64')};
 const res={status(status){this.code=status;return this},json(data){this.body=data;return this}};
 await handler(req,res);assert.equal(res.code,200);
 return replies.at(-1);
}
binding={bound:true,message:'ตรวจสอบข้อมูลถูกต้องแล้ว',customerOverview:{name:'สมชาย ใจดี',queue:'6121',model:'iPhone 15 Pro Max',principal:'15,000',fee:'1,500',saleDate:'24/09/2026'}};
const messages=await send('U-customer');
assert.equal(messages.length,1);
const card=messages[0];assert.equal(card.type,'flex');
const fields=card.contents.body.contents.filter(x=>x.type==='box').map(x=>x.contents.map(y=>y.text));
assert.deepEqual(fields,[['ชื่อ','สมชาย ใจดี'],['คิว','6121'],['รุ่น','iPhone 15 Pro Max'],['ยอด','15,000 บาท'],['ค่าเช่า','1,500 บาท'],['วันขาย/ฝาก','24/09/2026']]);
assert.deepEqual(card.quickReply.items.map(x=>x.action.text),['ยอดปิด','วันครบกำหนดชำระ','ยอดค้าง','สถานะ','สิทธิ์ส่วนลด','ติดต่อแอดมิน']);
binding={bound:false,message:'ข้อมูลไม่ตรง'};
const rejected=await send('U-other');assert.equal(rejected.length,1);assert.equal(rejected[0].type,'text');assert.equal(rejected[0].text,'ข้อมูลไม่ตรง');
console.log('PASS: verified overview card, exact fields, six buttons; rejected binding has no card');
