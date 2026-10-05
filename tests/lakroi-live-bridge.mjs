import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import handler from '../lakroi-dashboard/api/data.js';
import {LAKROI_SEED_BILLS} from '../lakroi-dashboard/lib/seed.js';
const code=readFileSync(new URL('../lakroi-dashboard/apps-script/LakroiBridge.gs',import.meta.url),'utf8');
const headers=['วันที่','เวลา','สาขา','ชื่อสินค้า','ยอดขาย','คนขาย','เงินสด','โอน','รายละเอียดส่ง','หมายเหตุ','ไทยช่วยไทย','จุดรับสินค้า','ค่าส่ง','LINE Message ID'];
let rows=[headers],locked=false,writeCount=0;
const props={LAKROI_BRIDGE_SECRET:'a'.repeat(64),LAKROI_WRITES_ENABLED:'true'};
const sheet={appendRow(values){assert.ok(locked);writeCount++;rows.push(values.map(v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v));},getLastRow:()=>rows.length,getRange(row,col,n=1,m=1){return {getValues:()=>rows.slice(row-1,row-1+n).map(r=>Array.from({length:m},(_,i)=>r[col-1+i]??'')),setValues(values){assert.ok(locked);writeCount++;for(let i=0;i<values.length;i++){rows[row-1+i]??=[];values[i].forEach((v,j)=>rows[row-1+i][col-1+j]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v);}return this;},setNumberFormat(){}};}};
const context=vm.createContext({Date,JSON,Number,String,Math,Error,Object,Array,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
  SpreadsheetApp:{openById(id){assert.equal(id,'1m8HfLnsrtf3TGFPeJOAfSfSZlBTQyZ6mN4WU_QrIruA');return {getSheetByName:n=>n==='บิลขาย'?sheet:null};},flush(){}},
  LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
  Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,s)=>[...createHash(a).update(s).digest()],computeHmacSha256Signature:(s,key)=>[...createHmac('sha256',key).update(s).digest()],formatDate:(d,tz,format)=>format==='HH:mm:ss'?'12:30:00':new Intl.DateTimeFormat('en-CA',{timeZone:tz}).format(d)}
});
vm.runInContext(code,context);
function call(action,data={},extra={}){const payload=JSON.stringify({action,data,timestamp:Date.now(),nonce:'0123456789abcdef',...extra});return context.doPost({postData:{contents:JSON.stringify({payload,signature:createHmac('sha256',props.LAKROI_BRIDGE_SECRET).update(payload).digest('hex')})}});}
assert.equal(context.doPost({postData:{contents:JSON.stringify({payload:'{}',signature:'wrong'})}}).ok,false);
assert.equal(call('list',{}, {timestamp:0}).ok,false);
assert.equal(call('list').bills.length,0);assert.equal(writeCount,0,'reads are side-effect free');
const bill={id:'app_abcdefgh123',date:'2026-10-05',branch:'ลพบุรี',product:'=HYPERLINK("x")',seller:'owner',cashAmount:100,transferAmount:50,thaiAmount:25};
assert.equal(call('createBill',bill).ok,true);assert.equal(rows.length,2);assert.equal(locked,false);
assert.equal(call('createBill',bill).duplicate,true);assert.equal(rows.length,2,'retry cannot duplicate a sale');
assert.equal(call('createBill',{...bill,cashAmount:101}).code,'CONFLICT');assert.equal(rows.length,2);
for(const invalid of [{...bill,id:'app_bad1xxx',date:'2026-02-30'},{...bill,id:'app_bad2xxx',cashAmount:-1},{...bill,id:'app_bad3xxx',cashAmount:0.001},{...bill,id:'app_bad4xxx',branch:'อื่นๆ'},{...bill,id:'app_bad5xxx',shipping:50}])assert.equal(call('createBill',invalid).ok,false);
const listed=call('list');assert.equal(listed.bills[0].amount,175);assert.equal(listed.bills[0].cashAmount,100);assert.equal(writeCount,1);
rows.push(['04/10/2026','9:01:02','โคกสำโรง','โต๊ะ',200,'seller',200,0,'','',0,'',0,'']);
const legacy=call('list').bills.find(b=>b.id.startsWith('legacy_')).id;
[rows[1],rows[2]]=[rows[2],rows[1]];
assert.equal(call('list').bills.find(b=>b.id.startsWith('legacy_')).id,legacy,'legacy ID survives row sorting');
props.LAKROI_WRITES_ENABLED='false';assert.equal(call('list').salesWritable,false);assert.equal(call('createBill',bill).ok,false);
// Exercise actual Vercel handler with signed bridge transport and fail-closed reads.
process.env.LAKROI_DASHBOARD_PIN='test';process.env.LAKROI_BRIDGE_URL='https://script.google.com/macros/s/test/exec';process.env.LAKROI_BRIDGE_SECRET='a'.repeat(64);
process.env.BLOB_STORE_ID='store_test';
let fail=false,wrongSource=false,cloud={bills:[]};
globalThis.fetch=async(url,options={})=>{
 if(String(url).startsWith('https://script.google.com')){
  if(fail)throw new Error('bridge down');
  const e=JSON.parse(options.body);assert.equal(e.signature,createHmac('sha256',props.LAKROI_BRIDGE_SECRET).update(e.payload).digest('hex'));
  const result=context.doPost({postData:{contents:options.body}});if(wrongSource)result.spreadsheetId='wrong';
  return {ok:true,json:async()=>result};
 }
 assert.ok(String(url).includes('lakroi/data.json'));assert.notEqual(options.method,'PUT');return {ok:true,json:async()=>structuredClone(cloud)};
};
async function request(method='GET',body){const res={setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};await handler({method,headers:{'x-lakroi-pin':'test'},body},res);return res;}
let response=await request();assert.equal(response.code,200);assert.equal(response.data.sourceMode,'live');assert.equal(response.data.bills.length,2);
cloud.bills=[{id:'cloud-only',amount:999}];response=await request();assert.equal(response.data.reconciliation.unmatchedCount,1);assert.equal(response.data.salesWritable,false);
assert.equal((await request('POST',{action:'save',bills:[]})).code,409);
fail=true;assert.equal((await request()).code,500,'no snapshot fallback presented as live');fail=false;wrongSource=true;assert.equal((await request()).code,500);
delete process.env.LAKROI_BRIDGE_SECRET;assert.equal((await request()).code,500,'partial configuration must fail closed');
console.log('Lakroi live bridge: signed authentication, expiry, idempotency, conflict, validation, lock release, stable IDs, live reads and reconciliation passed');
