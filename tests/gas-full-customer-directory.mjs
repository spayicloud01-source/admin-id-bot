import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const code=readFileSync(new URL("../apps-script/AdminIdBridge.gs",import.meta.url),"utf8");
const start=code.indexOf("function listAllCustomers_(body) {");
const end=code.indexOf("function listDueCustomers_(body) {",start);
assert.ok(start>0&&end>start,"full roster GAS read-only action exists");
assert.match(code,/case 'listAllCustomers':\s*result = listAllCustomers_\(body\)/);
assert.match(code,/source: 'v1\/v3', sheet: 'v3\/10-69'/);
assert.match(code,/source: 'v6', sheet: 'V6\/10-69'/);
const body=code.slice(start,end);
assert.doesNotMatch(body,/appendRow|setValue|setValues|pushMessage|sendNotification|\.setNote\(/);
const logs=[];
const mockSource={getLastRow(){return 3},getRange(){return {getValues(){return [
 ["v1/v3","https://docs.google.com/spreadsheets/d/v3-a/edit",true],
 ["v6","https://docs.google.com/spreadsheets/d/v6-b/edit",true]
]}}}};
const sources={
 "v3-a":[["310-5","ใช้งาน","ลูกค้าผูก LINE","3 พ.ย. 26","500"],
         ["310-9","ใช้งาน","ลูกค้ายังไม่ผูก LINE","7 พ.ย. 26","600"],
         ["310-11","ปิด","ลูกค้าปิดยอด","20 ต.ค. 26","0"]],
 "v6-b":[["610-4","ใช้งาน","ลูกค้า V6","2 พ.ย. 26","900"]]
};
function mockBook(id){
 const source=sources[id];if(!source)throw Error("unknown source "+id);
 return {getSheetByName(name){
   assert.equal(name,id==="v3-a"?"v3/10-69":"V6/10-69");
   return {isSheetHidden:()=>false,getLastRow:()=>source.length+2,
     getRange(start,col,count,width){
       assert.ok(start>=3&&width<=13);
       return {getDisplayValues:()=>source.slice(start-3,start-3+count).map(([q,s,n,d,f])=>{
         const row=Array(width).fill("");row[0]=q;row[2]=s;row[6]=n;row[10]=f;row[12]=d;return row;
       })};
     }};
 }};
}
const env={
 checkAccess_:()=>({allowed:true,role:"เจ้าของ"}),
 backendSpreadsheet_:()=>({getSheetByName:(name)=>name==="ลิ้งชีต"?mockSource:null}),
 normalizeGeneral_:x=>String(x||"").toLowerCase().replace(/\s+/g,""),
 isTrue_:v=>v===true,
 extractSpreadsheetId_:url=>(url.match(/\/d\/([^/]+)/)||[])[1],
 SpreadsheetApp:{openById:mockBook},
 detectHeaders_:()=>({headerRow:2,queue:1,name:7,status:3,dueDate:13,fee:11}),
 getCell_:(row,col)=>col?String(row[col-1]||""):"",
 CONFIG:{MAX_ROWS_PER_TAB:3000},
};
const list=vm.runInNewContext(body+"\nlistAllCustomers_",env);
let result=list({lineUserId:"Uowner",page:0});
assert.equal(result.ok,true);
assert.equal(result.items.length,4);
assert.equal(result.complete,true);
assert.equal(result.nextPage,null);
assert.ok(result.items.some(x=>x.queue==="310-9"&&x.name.includes("ยังไม่ผูก LINE")),"must include unlinked customer");
assert.ok(result.items.some(x=>x.queue==="310-11"&&x.status==="ปิด"),"must include closed customer");
assert.deepEqual([...new Set(result.items.map(x=>x.sheet))].sort(),["V6/10-69","v3/10-69"]);
assert.ok(result.items.every(x=>!x.phone&&!x.appleId),"don't expose unnecessary PII");
result=list({lineUserId:"Uowner",page:1});
assert.equal(result.items.length,0);assert.equal(result.complete,true);
assert.equal(list({lineUserId:"Uowner",page:101}).ok,false);
env.checkAccess_=()=>({allowed:true,role:"พนักงาน"});
assert.equal(list({lineUserId:"Ustaff",page:0}).ok,false);
console.log("PASS GAS all customers: exactly V3/V6, unlinked+closed included, owner-only, paginated and no sheet writes");
