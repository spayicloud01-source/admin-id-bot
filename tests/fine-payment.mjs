import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseCommand } from '../lib/commands.js';
const script = readFileSync(new URL('../apps-script/AdminIdBridge.gs', import.meta.url), 'utf8');
function fixture() {
  const props = new Map(), notes = new Map();
  const values = new Map([['8:13', new Date('2026-10-09T00:00:00+07:00')], ['8:44', 800]]);
  const range = (r,c) => ({ getRow:()=>r,getColumn:()=>c,getA1Notation:()=>`${r}:${c}`,
    getValue:()=>values.get(`${r}:${c}`)||'',getFormula:()=>'',getNumberFormat:()=>'',getBackground:()=>'',
    getNote:()=>notes.get(`${r}:${c}`)||'',setNote:n=>notes.set(`${r}:${c}`,n),
    setValue:n=>values.set(`${r}:${c}`,n),setNumberFormat(){},setBackground(){} });
  const context=vm.createContext({Date,console,SpreadsheetApp:{flush(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})}});
  vm.runInContext(script,context);
  Object.assign(context,{getSettingValue_:()=>true,
    dateKey_:d=>new Date(d.getTime()+7*3600000).toISOString().slice(0,10),
    findCustomerIdentity_:()=>({row:8,queue:'310-3',name:'นิภาพรรณ'}),
    sourceSpreadsheetFor_:()=>({getId:()=> 'source',getSheetByName:()=>({getRange:range})}),
    detectHeaders_:()=>({dueDate:13,note:14,headerRow:2}),
    findCalendarDateColumn_:(_s,_r,_c,d)=>context.dateKey_(d)==='2026-09-29'?43:44,
    persistPaymentBackupLog_:()=>true});
  const review=['','รับค่าปรับ','310-3','นิภาพรรณ','v1/v3 / v3/10-69','ค่าปรับ | วันที่รับเงินจริง: 2026-09-29',100];
  return {context,values,notes,props,review};
}
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
 assert.equal(JSON.stringify([...f.values]),before);
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
