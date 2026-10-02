import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const values=new Map([['source:6:41',1000],['source:6:42',1000],['source:6:52',1000],['history:2:16','อนุมัติจากคิวตรวจสอบ #2 / ซิงก์ชีตต้นทางแล้ว']]);
const notes=new Map(),colors=new Map([['source:6:42','#CCFF00']]),props=new Map();
function sheet(name){return {getParent:()=>({getId:()=>name}),getName:()=>name,getRange:(r,c)=>{
 const key=name+':'+r+':'+c;
 return {getRow:()=>r,getColumn:()=>c,getValue:()=>values.get(key)||'',getFormula:()=>'',getNote:()=>notes.get(key)||'',getBackground:()=>colors.get(key)||'#ffffff',setValue:v=>values.set(key,v),setNote:v=>notes.set(key,v),setBackground:v=>colors.set(key,v),clearContent:()=>values.delete(key)};
}};}
const source=sheet('source'),history=sheet('history'),review=sheet('review');
const receipt=[new Date('2026-09-28T01:00:00Z'),'บันทึกชำระ','q','name','v1/v3 / v3/10-69','',1000,'','ผ่าน'];
const backup={reviewRowNo:2,source:'v1/v3',sheet:'v3/10-69',queue:'q',sourceRow:6,amount:1000,fee:1000,oldDue:'2026-09-27T00:00:00Z',paidAt:receipt[0].toISOString(),nextDue:'2026-10-07T00:00:00Z',writtenAt:'2026-09-28',after:[]};
const rawRange=review.getRange;review.getLastRow=()=>3;review.getRange=(r,c,...rest)=>c===1&&rest.length?{getValues:()=>[receipt,[...receipt.slice(0,8),'รอตรวจ']]}:rawRange(r,c);
const historyRange=history.getRange;history.getLastRow=()=>2;history.getRange=(r,c,...rest)=>rest.length?{getDisplayValues:()=>[Array(15).fill('').concat(values.get('history:2:16'))]}:historyRange(r,c);
const log={getLastRow:()=>2,getRange:()=>({getDisplayValues:()=>[Array(8).fill('').concat('paymentSourceBackupAfter','สำเร็จ',JSON.stringify(backup))]}),appendRow(){}};
const ctx=vm.createContext({Date,console,CONFIG:{REVIEW_QUEUE_SHEET:'review',HISTORY_SHEET:'history',LOG_SHEET:'log'},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},SpreadsheetApp:{flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},backendSpreadsheet_:()=>({getSheetByName:n=>({review,history,log}[n])}),sourceSpreadsheetFor_:()=>({getSheetByName:()=>source}),detectHeaders_:()=>({headerRow:2,note:14}),findCustomerIdentity_:()=>({row:6,name:'name'}),normalizeGeneral_:v=>String(v).trim(),paymentNumber_:v=>Number(v||0),paymentSourceWriteKey_:n=>'backup:'+n,dateKey_:d=>d.toISOString().slice(0,10),paymentTiming_:(due,paid)=>({daysFromDue:1,timingDetail:'กำหนดเดิม 2026-09-27 / รับเงินจริง 2026-09-28 / ชำระช้า 1 วัน'}),findCalendarDateColumn_:(_s,_h,_c,d)=>({'2026-09-27':41,'2026-09-28':42,'2026-10-07':52}[d.toISOString().slice(0,10)]),snapshotCell_:r=>({row:r.getRow(),col:r.getColumn(),value:{type:'number',value:r.getValue()}}),persistPaymentBackupLog_:()=>true});
vm.runInContext(readFileSync(new URL('../apps-script/BackfillPaymentTiming.gs',import.meta.url),'utf8'),ctx);
ctx.backfillApprovedPaymentTiming();ctx.backfillApprovedPaymentTiming();
assert.equal(values.get('source:6:42'),1000);assert.equal(values.has('source:6:41'),false);assert.equal(values.has('source:6:52'),false);
assert.equal(notes.get('source:6:42').split('\n').length,1);
assert.equal(values.get('history:2:16').match(/ชำระช้า/g).length,1);
assert.equal(values.get('history:2:1').toISOString(),receipt[0].toISOString());
assert.equal(props.has('backup:3'),false);
console.log('Historical timing migration is idempotent and leaves receipts and pending requests intact: passed');
