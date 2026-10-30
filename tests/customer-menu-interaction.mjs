import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../customer.html", import.meta.url),"utf8");
const rawScript=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(rawScript);
const finalLoad="\n    load();";
assert.ok(rawScript.includes(finalLoad),"replace initial fetch call for isolated UI test");
const script=rawScript.replace(finalLoad,"\n    return {render,selectAction};");
const els=new Map();
const buttons=["payment","close","fine","info","discount","admin"].map(action=>makeEl(action));
function makeEl(action=""){
  const styles=new Set(["hidden"]);
  const el={
    dataset:{action},
    value:"",textContent:"",innerHTML:"",className:"",
    classList:{
      add(name){styles.add(name);},
      remove(name){styles.delete(name);},
      contains(name){return styles.has(name);},
      toggle(name,on){const enabled=on===undefined?!styles.has(name):Boolean(on);if(enabled)styles.add(name);else styles.delete(name);return enabled;},
    },
    scrollIntoView(){},addEventListener(){},
  };
  return el;
}
const document={
  getElementById(id){if(!els.has(id))els.set(id,makeEl());return els.get(id);},
  querySelectorAll(selector){assert.equal(selector,".customer-btn");return buttons;},
};
const calls=[];
let discountResponse={eligible:true,discountAmount:400,discountPercent:50,
  calculatedClose:4300,feeBefore:800,discountStartDate:"25/10/2569",crossCycleOutstanding:false};
const {render,selectAction}=new Function("document","window","location","fetch",script)(
  document, {}, {search:""}, async(url) => {
    calls.push(url);
    assert.equal(url,"/api/customer/discount");
    return {ok:true,json:async()=>discountResponse};
  }
);
const settled=()=>new Promise(resolve=>setImmediate(resolve));
const customer={
  queue:"310-4",name:"สมชาย ทดสอบ",status:"ใช้งาน",
  lateFee:150,closeAmount:5300,paymentTotal:1150,
  dueDate:"27 ต.ค. 26",dueMessage:"เกินกำหนด 3 วันแล้ว",
  principal:4000,fee:1000,overdueDays:3,inactive:false,
};
render({customer,history:[]});
assert.equal(buttons.find(x=>x.dataset.action==="fine").disabled,false,"fine payment available when calculated fine exists");
selectAction("discount");
assert.equal(els.get("discountPanel").classList.contains("hidden"),false,"discount panel must appear");
await settled();
assert.equal(els.get("discountStatus").textContent,"มีสิทธิ์รับส่วนลดค่าเช่ารอบนี้");
assert.equal(els.get("discountCloseAmount").textContent,"4,300 บาท");
assert.equal(els.get("discountPercent").textContent,"50%");
assert.equal(els.get("discountAmount").textContent,"400 บาท");
assert.equal(els.get("discountStartDate").textContent,"25/10/2569");
assert.deepEqual(calls,["/api/customer/discount"]);
discountResponse={eligible:false,discountAmount:0,discountPercent:0,
  calculatedClose:4800,feeBefore:800,discountStartDate:"15/10/2569",crossCycleOutstanding:true};
selectAction("discount");
await settled();
assert.equal(els.get("discountStatus").textContent,"ไม่มีสิทธิ์ส่วนลดค่าเช่ารอบนี้");
assert.equal(els.get("discountAmount").textContent,"0 บาท");
assert.match(els.get("discountReason").textContent,/ค้างชำระข้ามรอบ/);
assert.equal(els.get("paymentBox").classList.contains("hidden"),true);
assert.match(html,/คำนวณตามกฎส่วนลดเดิมของ Admin ID/);
assert.equal(typeof els.get("discountContactBtn").onclick,"function");
els.get("discountContactBtn").onclick();
assert.equal(els.get("contactPanel").classList.contains("hidden"),false,"contact panel is shown, no automatic push");
assert.equal(els.get("discountPanel").classList.contains("hidden"),true);
selectAction("fine");
assert.equal(els.get("paymentBox").classList.contains("hidden"),false);
assert.equal(els.get("amount").value,150);
assert.equal(els.get("amountLabel").textContent,"ยอดชำระค่าปรับ");
assert.match(els.get("payAlert").textContent,/ยังไม่ยืนยันยอดค่าปรับคงค้าง/);
render({customer:{...customer,lateFee:0},history:[]});
assert.equal(buttons.find(x=>x.dataset.action==="fine").disabled,true,"fine payment disabled when no calculated fine exists");
selectAction("fine");
assert.equal(els.get("paymentBox").classList.contains("hidden"),true);
assert.match(els.get("appAlert").textContent,/ยังไม่มีค่าปรับ/);
console.log("PASS customer discount opens a visible panel and fine menu uses review workflow with amount warning");
