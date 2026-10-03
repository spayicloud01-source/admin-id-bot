import assert from 'node:assert/strict';
import sharp from 'sharp';
import { customerMenuDefinition, linkVerifiedCustomerMenu } from '../lib/customerRichMenu.js';
import { CUSTOMER_MENU_IMAGE_BASE64 } from '../lib/customerRichMenuImage.js';
const definition = customerMenuDefinition();
assert.equal(definition.name, 'admin-id-customer-v3');
assert.equal(definition.selected, true);
const labels = ['ชำระยอด','ยอดปิด','สถานะ','ข้อมูล','สิทธิ์ส่วนลด','ติดต่อแอดมิน'];
assert.deepEqual(definition.areas.map(a=>a.action.text),labels);
assert.ok(definition.areas.every(a=>a.action.type==='message'));
for (let row=0;row<2;row++) {
  const cells=definition.areas.slice(row*3,row*3+3).map(a=>a.bounds);
  assert.equal(cells[0].x,0); assert.equal(cells[2].x+cells[2].width,2500);
  assert.equal(cells[0].x+cells[0].width,cells[1].x);
  assert.equal(cells[1].x+cells[1].width,cells[2].x);
  assert.ok(cells.every(c=>c.y===843*row&&c.height===843));
}
const png = Buffer.from(CUSTOMER_MENU_IMAGE_BASE64,'base64');
const meta = await sharp(png).metadata();
assert.equal(meta.width,2500);assert.equal(meta.height,1686);assert.ok(png.length<1000000);
process.env.LINE_CHANNEL_ACCESS_TOKEN='test-token';
let calls=[], hasImage=false;
globalThis.fetch=async(url,options={})=>{
  calls.push({url,...options});
  const data=url.endsWith('/list')?{richmenus:[{name:'admin-id-customer-v2',richMenuId:'old'}]}:
    url.endsWith('/richmenu')?{richMenuId:'new'}:{};
  if(url.endsWith('/content')&&!options.method&&!hasImage) return {ok:false,status:404};
  if(url.endsWith('/content')&&options.method==='POST') {assert.deepEqual(options.body,png);hasImage=true;}
  return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
};
await linkVerifiedCustomerMenu('U-customer');
assert.equal(calls.at(-1).url,'https://api.line.me/v2/bot/user/U-customer/richmenu/new');
assert.equal(JSON.parse(calls.find(c=>c.url.endsWith('/richmenu')&&c.method==='POST').body).name,definition.name);
assert.ok(!calls.some(c=>c.url.includes('/user/all/')||c.method==='DELETE'));
const count=calls.length;await linkVerifiedCustomerMenu('U-customer');assert.equal(calls.length,count);
await linkVerifiedCustomerMenu('U-second');assert.equal(calls.at(-1).url,'https://api.line.me/v2/bot/user/U-second/richmenu/new');
console.log('PASS: customer v3 layout, image upload, migration and per-user isolation');
