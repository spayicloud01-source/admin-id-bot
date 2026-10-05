// Add this file to the EXISTING หลักร้อย Dashboard project. Keep รหัส.gs and index.html.
// Set LAKROI_BRIDGE_SECRET in Script Properties and the dedicated Vercel project.
// LAKROI_WRITES_ENABLED must equal "true" only after read/reconciliation verification.
var LB_SHEET = '1m8HfLnsrtf3TGFPeJOAfSfSZlBTQyZ6mN4WU_QrIruA';
var LB_VERSION = '2026.10.05-1';
var LB_HEADERS = ['วันที่','เวลา','สาขา','ชื่อสินค้า','ยอดขาย','คนขาย','เงินสด','โอน','รายละเอียดส่ง','หมายเหตุ','ไทยช่วยไทย','จุดรับสินค้า','ค่าส่ง','LINE Message ID'];
function doPost(e) {
  try {
    var envelope = JSON.parse(e.postData.contents), props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('LAKROI_BRIDGE_SECRET');
    if (!secret || secret.length < 32 || typeof envelope.payload !== 'string' || envelope.payload.length > 20000) throw new Error('Unauthorized');
    var expected = lbHex_(Utilities.computeHmacSha256Signature(envelope.payload, secret, Utilities.Charset.UTF_8));
    var actual = String(envelope.signature || ''), difference = expected.length ^ actual.length;
    for (var i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
    if (difference) throw new Error('Unauthorized');
    var request = JSON.parse(envelope.payload);
    if (!Number.isFinite(request.timestamp) || Math.abs(Date.now() - request.timestamp) > 120000 || !/^[a-zA-Z0-9-]{16,100}$/.test(request.nonce || '')) throw new Error('Unauthorized');
    var result;
    if (request.action === 'list') result = lbList_();
    else {
      if (props.getProperty('LAKROI_WRITES_ENABLED') !== 'true') throw new Error('ยังไม่เปิดบันทึกชีต');
      if (request.action === 'createBill') result = lbCreate_(request.data);
      else if (request.action === 'setPhoto') result = lbMetadata_('photo', request.data);
      else if (request.action === 'setGoal') result = lbMetadata_('goal', request.data);
      else throw new Error('Unknown action');
    }
    return lbJson_(Object.assign({ok:true,version:LB_VERSION},result));
  } catch (err) {
    return lbJson_({ok:false,error:String(err.message || err),code:err.code || 'BRIDGE_ERROR'});
  }
}
function lbJson_(x) { return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON); }
function lbHex_(bytes) { return bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''); }
function lbError_(message,code) { var e=new Error(message); e.code=code||'VALIDATION'; throw e; }
function lbSheet_() {
  var sh=SpreadsheetApp.openById(LB_SHEET).getSheetByName('บิลขาย');
  if(!sh||JSON.stringify(sh.getRange(1,1,1,14).getValues()[0])!==JSON.stringify(LB_HEADERS)) throw new Error('โครงสร้างบิลขายเปลี่ยน กรุณาตรวจสอบ');
  return sh;
}
function lbDate_(v) {
  if(v instanceof Date) return Utilities.formatDate(v,'Asia/Bangkok','yyyy-MM-dd');
  var s=String(v||''),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)s=(Number(m[3])>2400?Number(m[3])-543:m[3])+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s) lbError_('วันที่ไม่ถูกต้อง');
  return s;
}
function lbMoney_(v) {
  var n=Number(String(v==null?'':v).replace(/,/g,''));
  if(!Number.isFinite(n)||n<0||n>10000000||Math.abs(n*100-Math.round(n*100))>0.00001) lbError_('ยอดเงินไม่ถูกต้อง');
  return n;
}
function lbRows_(sh) {
  if(sh.getLastRow()<2)return [];
  var values=sh.getRange(2,1,sh.getLastRow()-1,14).getValues(), seen={};
  return values.map(function(r,i){
    if(r.every(function(v){return v===''||v==null;}))return null;
    if(!r[0]||!r[3]) throw new Error('บิลแถว '+(i+2)+' ข้อมูลไม่ครบ');
    var date=lbDate_(r[0]),time=r[1] instanceof Date?Utilities.formatDate(r[1],'Asia/Bangkok','HH:mm:ss'):String(r[1]||'00:00:00').padStart(8,'0');
    var identity=[date,time].concat(r.slice(2,13).map(String));
    var id=String(r[13]||('legacy_'+lbHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(identity),Utilities.Charset.UTF_8))));
    if(seen[id])lbError_('พบรหัสบิลซ้ำ ต้องตรวจชีตก่อน: แถว '+(i+2),'CONFLICT'); seen[id]=true;
    var cash=lbMoney_(r[6]),transfer=lbMoney_(r[7]),thai=lbMoney_(r[10]);
    var methods=[]; if(cash)methods.push('เงินสด');if(transfer)methods.push('โอน');if(thai)methods.push('ไทยช่วยไทย');
    return {id:id,createdAt:date+'T'+time+'+07:00',date:date,branch:String(r[2]),product:String(r[3]),note:String(r[3]),seller:String(r[5]),amount:lbMoney_(r[4]),cashAmount:cash,transferAmount:transfer,thaiAmount:thai,shipping:lbMoney_(r[12]),memo:String(r[9]||''),pickup:String(r[11]||''),method:methods.join(' + '),photo:'',sourceRow:i+2};
  }).filter(Boolean);
}
function lbMetaRead_() {
  var sh=SpreadsheetApp.openById(LB_SHEET).getSheetByName('หลักร้อยแอป metadata'), map={};
  if(sh&&sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,2).getValues().forEach(function(r){map[String(r[0])]=String(r[1]);});
  return map;
}
function lbList_() {
  var bills=lbRows_(lbSheet_()),meta=lbMetaRead_();
  bills.forEach(function(b){b.photo=meta['photo:'+b.id]||'';});
  return {bills:bills,goal:Number(meta.goal||15000),updatedAt:new Date().toISOString(),sourceMode:'live',salesWritable:PropertiesService.getScriptProperties().getProperty('LAKROI_WRITES_ENABLED')==='true',spreadsheetId:LB_SHEET,sheetId:68391922};
}
function lbText_(v,max,required) {
  var s=String(v||'').trim(); if(s.length>max||(required&&!s))lbError_('กรอกสินค้าและคนขายให้ครบ และไม่เกินความยาวที่กำหนด');return s;
}
function lbValidate_(b) {
  if(!b||!/^app_[A-Za-z0-9_-]{8,100}$/.test(b.id||''))lbError_('รหัสบิลไม่ถูกต้อง');
  if(['ลพบุรี','โคกสำโรง'].indexOf(b.branch)<0)lbError_('สาขาไม่ถูกต้อง');
  var x={id:b.id,date:lbDate_(b.date),branch:b.branch,product:lbText_(b.product,300,true),seller:lbText_(b.seller,100,true),memo:lbText_(b.memo,1000),pickup:lbText_(b.pickup,100)};
  ['cashAmount','transferAmount','thaiAmount'].forEach(function(k){x[k]=lbMoney_(b[k]);});
  x.amount=Math.round((x.cashAmount+x.transferAmount+x.thaiAmount)*100)/100;
  if(x.amount<=0||x.amount>10000000)lbError_('กรอกยอดชำระให้ถูกต้อง');
  // Shipping entry is intentionally unavailable until its receipt allocation is confirmed.
  if(Number(b.shipping||0)!==0)lbError_('ยังไม่รองรับค่าส่งแยกในแบบฟอร์มนี้');
  return x;
}
function lbSafe_(s){return /^[=+\-@]/.test(s)?"'"+s:s;}
function lbCreate_(input) {
  var b=lbValidate_(input),lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var sh=lbSheet_(),rows=lbRows_(sh),old=rows.find(function(x){return x.id===b.id;});
    if(old){
      var keys=['date','branch','product','seller','memo','pickup','amount','cashAmount','transferAmount','thaiAmount'];
      if(keys.some(function(k){return old[k]!==b[k];}))lbError_('บิลรหัสนี้บันทึกข้อมูลต่างกันแล้ว กรุณารีเฟรช','CONFLICT');
      return {id:b.id,duplicate:true};
    }
    sh.appendRow([new Date(b.date+'T00:00:00+07:00'),Utilities.formatDate(new Date(),'Asia/Bangkok','HH:mm:ss'),b.branch,lbSafe_(b.product),b.amount,lbSafe_(b.seller),b.cashAmount,b.transferAmount,'',lbSafe_(b.memo),b.thaiAmount,lbSafe_(b.pickup),0,b.id]);
    SpreadsheetApp.flush();
    return {id:b.id,duplicate:false};
  } finally {lock.releaseLock();}
}
function lbMetadata_(kind,data) {
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var key,value;
    if(kind==='goal'){key='goal';value=lbMoney_(data.goal);if(value<=0)lbError_('เป้าหมายต้องมากกว่า 0');}
    else {
      if(!lbRows_(lbSheet_()).some(function(b){return b.id===data.id;}))lbError_('ไม่พบบิล');
      if(!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/lakroi\/bills\/[a-zA-Z0-9_.-]+$/.test(data.url||''))lbError_('ที่อยู่รูปไม่ถูกต้อง');
      key='photo:'+data.id;value=data.url;
    }
    var ss=SpreadsheetApp.openById(LB_SHEET),sh=ss.getSheetByName('หลักร้อยแอป metadata');
    if(!sh){sh=ss.insertSheet('หลักร้อยแอป metadata');sh.appendRow(['key','value','updatedAt']);}
    var rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,1).getValues():[],at=rows.findIndex(function(r){return r[0]===key;});
    sh.getRange(at<0?sh.getLastRow()+1:at+2,1,1,3).setValues([[key,value,new Date()]]);SpreadsheetApp.flush();return {saved:true};
  } finally {lock.releaseLock();}
}
