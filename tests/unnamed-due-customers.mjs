import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const rows = Array.from({length:55},(_,i)=>[String(i+1),i%2?'   ':'-', '', '01/01/2020']);
rows.push(['310-1',' สมชาย ใจดี ','','01/01/2020'],['310-2','ปาย','','01/01/2020']);
let cached;
const tab={getName:()=> 'v3/10-69',getLastRow:()=>rows.length+1,
  getRange:()=>({getDisplayValues:()=>rows})};
const source={getLastRow:()=>2,getRange:()=>({getValues:()=>[['v1/v3','source-id',true,'','','','']]})};
const context=vm.createContext({console,Date,CacheService:{getScriptCache:()=>({get:()=>null,put:(_k,v)=>{cached=JSON.parse(v)}})},
  SpreadsheetApp:{openById:()=>({})}});
vm.runInContext(readFileSync('apps-script/AdminIdBridge.gs','utf8'),context);
Object.assign(context,{checkAccess_:()=>({allowed:true}),getSettingValue_:()=>3,
  backendSpreadsheet_:()=>({getSheetByName:()=>source}),extractSpreadsheetId_:()=> 'source-id',
  activeCustomerTab_:()=>tab,detectHeaders_:()=>({headerRow:1,queue:1,name:2,status:3,dueDate:4}),
  isTrue_:()=>true,parseDateFlexible_:()=>new Date(2020,0,1)});
for(const mode of ['overdue','today','upcoming']){
  context.daysBetween_=()=> mode==='overdue'?-1:mode==='today'?0:1;
  const result=context.listDueCustomers_({lineUserId:'owner',dueMode:mode});
  assert.equal(result.items.length,2,mode);
  assert.equal(result.totalShown,2);
  assert.deepEqual(Array.from(result.items,x=>x.name),['สมชาย ใจดี','ปาย']);
  assert.equal(cached.items.length,2);
}
console.log('PASS: unnamed template rows excluded before limits/counts in all due modes');
