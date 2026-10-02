import assert from 'node:assert/strict';
import sharp from 'sharp';
import { extendMenu, syncStaffPaymentMenu } from '../lib/staffRichMenu.js';
import { STAFF_MENU_IMAGE } from '../lib/staffMenuImage.js';
import { parseCommand } from '../lib/commands.js';
const original={richMenuId:'old',name:'existing'};
const menu=extendMenu(original);
assert.equal(menu.areas.length,6);
assert.deepEqual(menu.areas.map(x=>x.action.label),['รับชำระ','รับค่าปรับ','คิวตรวจสอบ','ค้นหาลูกค้า','สรุปยอดวันนี้','เปิดระบบ']);
assert.equal(menu.areas[5].action.type,'uri');
assert.equal(menu.areas[5].action.uri,'https://admin-id-bot.vercel.app');
assert.equal(parseCommand(menu.areas[4].action.text).action,'dailyOwnerReport');
const image=Buffer.from(STAFF_MENU_IMAGE,'base64');
const meta=await sharp(image).metadata();assert.equal(meta.width,2500);assert.equal(meta.height,1686);assert.ok(image.length<1000000);
for(let row=0;row<2;row++) {
 const cells=menu.areas.slice(row*3,row*3+3).map(x=>x.bounds);
 assert.equal(cells[0].x,0);assert.equal(cells[2].x+cells[2].width,2500);
 assert.equal(cells[0].x+cells[0].width,cells[1].x);assert.equal(cells[1].x+cells[1].width,cells[2].x);
 assert.ok(cells.every(x=>x.y===row*843&&x.height===843));
}
let calls=[],current=original,uploaded;
globalThis.fetch=async(url,options={})=>{
 calls.push({url,...options});let data={};
 if(url.endsWith('/user/U/richmenu')) {if(!current) return {ok:false,status:404};data={richMenuId:current.richMenuId};}
 else if(url.endsWith('/user/all/richmenu')) return {ok:false,status:404};
 else if(url.endsWith('/richmenu/old')&&!options.method) data=original;
 else if(url.endsWith('/richmenu/new')&&!options.method) data={...menu,richMenuId:'new'};
 else if(url.endsWith('/richmenu/list')) data={richmenus:[]};
 else if(url.endsWith('/richmenu')&&options.method==='POST') data={richMenuId:'new'};
 else if(url.endsWith('/content')&&options.method==='POST') uploaded=options.body;
 return {ok:true,status:200,json:async()=>data};
};
assert.equal(await syncStaffPaymentMenu('U',true),true);assert.equal(calls.at(-1).url,'https://api.line.me/v2/bot/user/U/richmenu/new');assert.deepEqual(uploaded,image);
current={...menu,richMenuId:'new'};calls=[];await syncStaffPaymentMenu('U',false);assert.equal(calls.at(-1).url,'https://api.line.me/v2/bot/user/U/richmenu/old');
current=original;calls=[];await syncStaffPaymentMenu('U',false);assert.ok(!calls.some(x=>x.method));
current=null;calls=[];assert.equal(await syncStaffPaymentMenu('U',true),true);assert.ok(!calls.some(x=>x.url.includes('/user/all/richmenu')&&x.method));
calls=[];await syncStaffPaymentMenu('U',false);assert.ok(!calls.some(x=>x.method));
console.log('PASS: six staff buttons, image, command routing, per-user linking and restoration');
