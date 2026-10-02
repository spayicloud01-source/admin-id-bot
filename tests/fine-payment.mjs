import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseCommand } from '../lib/commands.js';
const script = readFileSync(new URL('../apps-script/AdminIdBridge.gs', import.meta.url), 'utf8');
function fixture() {
  const props = new Map(), notes = new Map(), formulas = new Map();
  const values = new Map([['8:13', new Date('2026-10-09T00:00:00+07:00')], ['8:44', 800]]);
  const range = (r,c) => ({ getRow:()=>r,getColumn:()=>c,getA1Notation:()=>`${r}:${c}`,
    getValue:()=>values.get(`${r}:${c}`)||'',getFormula:()=>formulas.get(`${r}:${c}`)||'',getNumberFormat:()=>'',getBackground:()=>'',
    getDisplayValues:()=>Array.from({length:27},(_,i)=>[i===26?'ค่าปรับ':'']),
    getNote:()=>notes.get(`${r}:${c}`)||'',setNote:n=>notes.set(`${r}:${c}`,n),
    setValue:n=>values.set(`${r}:${c}`,n),setNumberFormat(){},setBackground(){} });
  const context=vm.createContext({Date,console,SpreadsheetApp:{flush(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})}});
  vm.runInContext(script,context);
  Object.assign(context,{getSettingValue_:()=>true,
    dateKey_:d=>new Date(d.getTime()+7*3600000).toISOString().slice(0,10),
    findCustomerIdentity_:()=>({row:8,queue:'310-3',name:'นิภาพรรณ'}),
    sourceSpreadsheetFor_:()=>({getId:()=> 'source',getSheetByName:()=>({getRange:range,getLastRow:()=>27})}),
    detectHeaders_:()=>({dueDate:13,note:14,headerRow:2}),
    findCalendarDateColumn_:(_s,_r,_c,d)=>context.dateKey_(d)==='2026-09-29'?43:44,
    persistPaymentBackupLog_:()=>true});
  const review=['','รับค่าปรับ','310-3','นิภาพรรณ','v1/v3 / v3/10-69','ค่าปรับ | วันที่รับเงินจริง: 2026-09-29',100];
  return {context,values,notes,props,review,range,formulas};
}
test('legacy fine migration preserves customer cells, supports rollback, and never duplicates totals',()=>{
 const f=fixture();
 f.context.applyApprovedFineToSource_(f.review,f.review,6);
 const key='payment-source-write:6';
 const old=JSON.parse(f.props.get(key));delete old.fineTotal;
 old.before=old.before.slice(0,1);old.after=old.after.slice(0,1);
 f.props.set(key,JSON.stringify(old));f.values.delete('27:43');f.notes.delete('27:43');
 const customerBefore=JSON.stringify([...f.values]);const noteBefore=f.notes.get('8:43');
 const sheet={getName:()=> 'v3/10-69',getRange:f.range,getLastRow:()=>27};
 f.context.sourceSpreadsheetFor_=()=>({getId:()=> 'source',getSheetByName:()=>sheet});
 f.context.backendSpreadsheet_=()=>({getSheetByName:()=>({getRange:()=>({getDisplayValues:()=>[[...f.review,'','ผ่าน']]})})});
 let released=0,logs=0;
 f.context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})};
 f.context.persistPaymentBackupLog_=()=>{logs++;return true;};
 vm.runInContext(readFileSync(new URL('../apps-script/RepairLegacyFine.gs',import.meta.url),'utf8'),f.context);
 f.context.repairLegacyFine6DailyTotal();
 assert.equal(f.values.get('27:43'),100);assert.equal(f.notes.get('8:43'),noteBefore);
 assert.equal(JSON.stringify([...f.values].filter(([k])=>!k.startsWith('27:'))),customerBefore);
 f.context.repairLegacyFine6DailyTotal();assert.equal(logs,1);assert.equal(released,2);
 assert.equal(f.context.rollbackFineSource_(sheet,JSON.parse(f.props.get(key)),6).ok,true);
 assert.equal(f.values.get('27:43'),0);
});
test('fine command parses BE and CE dates without changing ordinary rent commands',()=>{
 const c=parseCommand('รับค่าปรับ 310-3 100 29/9/2569');
 assert.equal(c.action,'queuePayment');assert.equal(c.paymentKind,'fine');assert.equal(c.paidOn,'2026-09-29');
 assert.equal(parseCommand('รับค่าปรับ 310-3 100 29/9/2026').paidOn,c.paidOn);
 assert.equal(parseCommand('รับค่าปรับ 310-3 100 nonsense').amount,null);
 assert.equal(parseCommand('รับชำระ 310-3 800').paymentKind,undefined);
});
test('backdated fine writes one note and leaves rent, due date and cycle totals untouched',()=>{
 const f=fixture(), before=JSON.stringify([...f.values]);
 const r=f.context.applyApprovedFineToSource_(f.review,f.review,6);
 assert.equal(r.ok,true,r.message);assert.equal(r.fineOnly,true);assert.equal(r.paidDate,'2026-09-29');
 assert.equal(JSON.stringify([...f.values].filter(([k])=>!k.startsWith('27:'))),before);
 assert.equal(f.values.get('27:43'),100);
 assert.match(f.notes.get('8:43'),/100 บาท วันที่ 2026-09-29/);
 assert.equal([...f.props.keys()].some(k=>k.startsWith('payment-cycle:')),false);
 assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,true);
 assert.equal(f.notes.get('8:43').split('\n').length,1);
 const backup=JSON.parse(f.props.get('payment-source-write:6'));
 f.context.restoreCellSnapshot_({getRange:(r,c)=>({setValue(){},setNote:n=>f.notes.set(`${r}:${c}`,n)})},backup.before[0]);
 assert.equal(f.notes.get('8:43'),'');
});
test('invalid dates, future dates, zero amounts and changed identities do not write',()=>{
 const f=fixture();
 for(const date of ['2026-02-31','2099-09-29','bad']) {
  f.review[5]='ค่าปรับ | วันที่รับเงินจริง: '+date;
  assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,false);
 }
 f.review[5]='ค่าปรับ | วันที่รับเงินจริง: 2026-09-29';f.review[6]=0;
 assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,false);
 f.review[6]=100;f.review[3]='wrong';
 assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,false);
 assert.equal(f.notes.size,0);
});
test('fine history uses the actual receipt date and a distinct fine event',()=>{
 const f=fixture(), rows=[];
 f.context.SpreadsheetApp.getActiveSpreadsheet=()=>({getSheetByName:()=>({appendRow:r=>rows.push(r)})});
 assert.equal(f.context.appendHistoryFromApprovedReview_(f.review,6,'ภาณุพันธ์',true),true);
 assert.equal(f.context.dateKey_(rows[0][0]),'2026-09-29');assert.equal(rows[0][8],'ค่าปรับ');assert.equal(rows[0][13],100);
});


test('same-day fines accumulate, retries do not double count, and old receipt rollback preserves later receipts',()=>{
 const f=fixture(); f.values.set('27:43',25);
 assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,true);
 const other=[...f.review];other[2]='310-4';other[3]='ลูกค้าอีกคน';other[6]=50;
 f.context.findCustomerIdentity_=(_s,_t,q)=>q==='310-4'?{row:9,queue:q,name:other[3]}:{row:8,queue:q,name:f.review[3]};
 assert.equal(f.context.applyApprovedFineToSource_(other,other,7).ok,true);
 assert.equal(f.values.get('27:43'),175);
 assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,true);
 assert.equal(f.values.get('27:43'),175);
 const backup=JSON.parse(f.props.get('payment-source-write:6'));
 assert.equal(f.context.rollbackFineSource_({getRange:f.range,getLastRow:()=>27},backup,6).ok,true);
 assert.equal(f.values.get('27:43'),75);
 assert.match(f.notes.get('27:43'),/ค่าปรับ #7/);
 assert.doesNotMatch(f.notes.get('27:43'),/ค่าปรับ #6/);
 assert.equal(f.context.rollbackFineSource_({getRange:f.range,getLastRow:()=>27},backup,6).ok,false);
 assert.equal(f.values.get('27:43'),75);
});
test('dates and sheets have separate daily totals; formula and invalid total cells fail before writes',()=>{
 const f=fixture();
 f.review[5]='ค่าปรับ | วันที่รับเงินจริง: 2026-09-30';
 assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,true);
 assert.equal(f.values.get('27:44'),100);assert.equal(f.values.has('27:43'),false);
 const g=fixture();g.review[4]='v6 / V6/10-69';
 assert.equal(g.context.applyApprovedFineToSource_(g.review,g.review,6).ok,true);
 assert.equal(g.values.get('27:43'),100);
 for (const value of ['bad',-1]) {
  const h=fixture();h.values.set('27:43',value);
  assert.equal(h.context.applyApprovedFineToSource_(h.review,h.review,6).ok,false);
  assert.equal(h.notes.size,0);
 }
 const h=fixture();h.formulas.set('27:43','=SUM(A1:A2)');
 assert.equal(h.context.applyApprovedFineToSource_(h.review,h.review,6).ok,false);
 assert.equal(h.notes.size,0);
});
test('missing and ambiguous fine summary rows do not write',()=>{
 for (const rows of [[['']], [['ค่าปรับ'],['ค่าปรับ']]]) {
  const f=fixture(); f.context.findFineTotalRow_=()=>rows.filter(r=>r[0]==='ค่าปรับ').length===1?27:0;
  assert.equal(f.context.applyApprovedFineToSource_(f.review,f.review,6).ok,false);
  assert.equal(f.notes.size,0);
 }
});
