// Render a strictly recognizable source-sheet note without writing to the payment ledger.
// This supplements the approved audit log; it is NOT proof of a new approved transaction.
const notePattern=/^รับ\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+ตัดต้น\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*\(\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*\)/u;
const norm=n=>Number(String(n||"").replace(/,/g,""));
const dateKey=(day,month,year)=>String(year)+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
function yearValue(raw) {
  const n=Number(raw);
  if(!Number.isInteger(n))return 0;
  if(n>=2500 && n<=2700)return n-543;
  if(n>=2000 && n<=2100)return n;
  if(n>=0&&n<=35)return n+2000;
  if(n>=60&&n<=99)return n+1957;
  return 0; // ambiguous two-digit year, do not infer
}
function customerYear(customer) {
  for(const field of [customer?.dueDate,customer?.saleDate]){
    const match=String(field||"").trim().match(/(\d{2,4})\s*$/);
    if(match){const y=yearValue(match[1]);if(y)return y;}
  }
  return 0;
}
function validDate(day,month,year) {
  if(!year||month<1||month>12||day<1||day>31)return false;
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}
export function sourceNoteEntry(customer){
  const match=String(customer?.note||"").trim().match(notePattern);
  if(!match)return null;
  const amount=norm(match[1]),principal=norm(match[2]);
  if(!Number.isFinite(amount)||!Number.isFinite(principal)||amount<=0||principal<=0||principal>=amount)return null;
  const day=Number(match[3]),month=Number(match[4]);
  const year=match[5]?yearValue(match[5]):customerYear(customer);
  if(!validDate(day,month,year))return null;
  const rent=Math.round((amount-principal)*100)/100;
  return {
    dateTime:String(day).padStart(2,"0")+"/"+String(month).padStart(2,"0")+"/"+year,
    eventType:"รับยอด + ตัดต้น (จากบันทึกต้นทาง)",
    amount,
    detail:"ค่าเช่า "+rent.toLocaleString("th-TH")+" บาท · ตัดต้น "+principal.toLocaleString("th-TH")+" บาท · จากโน้ตในชีตต้นทาง ยังไม่พบในประวัติอนุมัติ",
    sourceNote:true,
    dayKey:dateKey(day,month,year),
  };
}
function itemDay(raw) {
  const match=String(raw||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(!match)return "";
  const year=yearValue(match[3]);
  return validDate(Number(match[1]),Number(match[2]),year)?dateKey(Number(match[1]),Number(match[2]),year):"";
}
function sortStamp(raw){
  const key=itemDay(raw);
  if(!key)return 0;
  const m=String(raw).match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return Date.parse(key+"T"+(m?m[1].padStart(2,"0")+":"+m[2]+":"+(m[3]||"00"):"00:00:00")+"Z")||0;
}
export function mergeCustomerHistory(approved,customer){
  const existing=Array.isArray(approved)?approved:[];
  const note=sourceNoteEntry(customer);
  if(!note)return existing.slice(0,12);
  // The customer note may refer to an approved payment already in the audit log.
  // Hide the note on ANY same-day approved entry rather than risk double counting.
  if(existing.some(x=>itemDay(x.dateTime)===note.dayKey))return existing.slice(0,12);
  const {dayKey,...publicEntry}=note;
  return [...existing,publicEntry].sort((a,b)=>sortStamp(b.dateTime)-sortStamp(a.dateTime)).slice(0,12);
}
