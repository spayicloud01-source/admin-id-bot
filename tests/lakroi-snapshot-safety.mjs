import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import handler from '../api/health.js';
import {LAKROI_SEED_BILLS as bills, LAKROI_SEED_SYNCED_AT} from '../lib/lakroiSeed.js';

process.env.LAKROI_DASHBOARD_PIN='test-pin';
process.env.BLOB_STORE_ID='store_test';
process.env.BLOB_READ_WRITE_TOKEN='test-token';
let writes=[];
let cloud={bills:[{id:'legacy-sale',amount:999,date:'2026-10-04'}],goal:15000};
globalThis.fetch=async(_url,options={})=>{
  if(options.method==='PUT'){
    cloud=JSON.parse(options.body);writes.push(cloud);
    return {ok:true,text:async()=>JSON.stringify({url:'https://example.test/data.json'})};
  }
  return {ok:true,status:200,json:async()=>structuredClone(cloud)};
};
async function request(method,body,pin='test-pin'){
  const res={setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};
  await handler({method,query:{lakroi:'1'},headers:{'x-lakroi-pin':pin},body},res);
  return res;
}
assert.equal((await request('GET',null,'wrong')).code,401);
const read=await request('GET');
assert.equal(read.data.sourceMode,'snapshot');
assert.equal(read.data.salesWritable,false);
assert.equal(read.data.updatedAt,LAKROI_SEED_SYNCED_AT);
assert.equal(writes.length,0,'GET must never erase previously saved cloud-only sales');
assert.equal(read.data.bills.length,127);
assert.equal(bills.reduce((s,b)=>s+b.amount,0),79600);
assert.equal(bills.reduce((s,b)=>s+b.cashAmount,0),19169);
assert.equal(bills.filter(b=>b.date==='2026-10-04').reduce((s,b)=>s+b.amount,0),4460);
assert.ok(bills.every(b=>b.cashAmount+b.transferAmount+b.thaiAmount===b.amount));
for(const changed of [bills.slice(1),[...bills,{id:'new',amount:10}],bills.map((b,i)=>i?b:{...b,amount:999})]){
  assert.equal((await request('POST',{action:'save',bills:changed})).code,409);
}
assert.equal(writes.length,0);
const updated=bills.map((b,i)=>i?b:{...b,photo:'https://example.test/bill.jpg'});
assert.equal((await request('POST',{action:'save',bills:updated,goal:20000})).code,200);
assert.ok(cloud.bills.some(b=>b.id==='legacy-sale'),'metadata updates preserve old sales');
assert.equal((await request('GET')).data.bills[0].photo,'https://example.test/bill.jpg');
assert.equal((await request('GET')).data.goal,20000);
const html=readFileSync(new URL('../lakroi-dashboard/index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
// Exercise save failure through the actual inline script: state/local cache must not advance.
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='goalInput'?'15000':'',classList:{add(){},remove(){},contains(){return false}},focus(){}});return elements.get(id)};
const cached=[];
const context=vm.createContext({document:{getElementById:element},localStorage:{getItem(){return null},setItem(...v){cached.push(v)}},Intl,Date,Number,String,console,setInterval(){},fetch:async()=>({ok:false,json:async()=>({ok:false,error:'save failed'})})});
vm.runInContext(script.replace('load();\nsetInterval','globalThis.testSave=save;\nload();\nsetInterval'),context);
await assert.rejects(context.testSave([{id:'unsaved'}]),/save failed/);
assert.equal(cached.length,0,'failed saves cannot be marked locally as saved');
console.log('Lakroi: snapshot totals, mixed payments, read-only sales, cloud preservation and failed-save behavior passed');
