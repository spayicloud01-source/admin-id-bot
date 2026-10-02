// Manual migration of proven approved receipts. Does not create/approve receipts.
function backfillApprovedPaymentTiming() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000)) throw new Error('Payment is busy');
  const changes=[];
  try {
    const ss=backendSpreadsheet_(), review=ss.getSheetByName(CONFIG.REVIEW_QUEUE_SHEET);
    const history=ss.getSheetByName(CONFIG.HISTORY_SHEET), log=ss.getSheetByName(CONFIG.LOG_SHEET);
    const reviews=review.getRange(2,1,review.getLastRow()-1,12).getValues();
    const histories=history.getRange(2,1,history.getLastRow()-1,16).getDisplayValues();
    const logs=log.getRange(2,1,log.getLastRow()-1,11).getDisplayValues();
    const latest={};
    logs.forEach(function(r){
      if(/^paymentSourceBackup(After)?$/.test(r[8])) {
        try {const b=JSON.parse(r[10]); if(b.writtenAt) latest[b.reviewRowNo]=b;} catch(e){}
      }
    });
    const props=PropertiesService.getScriptProperties(), skipped=[], results=[];
    function remember(sheet,range){changes.push({sheet:sheet,snapshot:snapshotCell_(range)});}
    reviews.forEach(function(r,index){
      const rowNo=index+2;
      if(String(r[1])!=='บันทึกชำระ'||String(r[8])!=='ผ่าน')return;
      const key=paymentSourceWriteKey_(rowNo), prior=props.getProperty(key);
      const b=prior?JSON.parse(prior):latest[rowNo];
      if(!b||!b.writtenAt||b.reversedAt||!b.oldDue||!b.paidAt||b.amount!==paymentNumber_(r[6])||
          String(b.queue)!==String(r[2])||b.source+' / '+b.sheet!==String(r[4])) {skipped.push(rowNo);return;}
      const source=sourceSpreadsheetFor_(b.source), sheet=source.getSheetByName(b.sheet), h=detectHeaders_(sheet);
      const customer=findCustomerIdentity_(b.source,b.sheet,b.queue);
      if(!customer||Number(customer.row)!==b.sourceRow||normalizeGeneral_(customer.name)!==normalizeGeneral_(r[3])) {skipped.push(rowNo);return;}
      const timing=paymentTiming_(new Date(b.oldDue),new Date(b.paidAt));
      const paidCol=findCalendarDateColumn_(sheet,h.headerRow,h.note+1,new Date(b.paidAt));
      const cell=sheet.getRange(b.sourceRow,paidCol);
      if(!paidCol||cell.getFormula()||paymentNumber_(cell.getValue())<b.amount) {skipped.push(rowNo);return;}
      const historyIndex=histories.findIndex(function(hr){return String(hr[15]||'').indexOf('อนุมัติจากคิวตรวจสอบ #'+rowNo+' /')===0;});
      if(historyIndex<0){skipped.push(rowNo);return;}
      const line='[ชำระ #'+rowNo+'] รับ '+b.amount+' บาท / '+timing.timingDetail;
      const note=(cell.getNote()||'').split('\n').filter(function(n){return n.indexOf('[ชำระ #'+rowNo+'] ')!==0;}).filter(Boolean);
      remember(sheet,cell);cell.setNote(note.concat(line).join('\n'));cell.setBackground('#CCFF00');
      [new Date(b.oldDue),new Date(b.nextDue)].forEach(function(day){
        const col=findCalendarDateColumn_(sheet,h.headerRow,h.note+1,day);if(!col||col===paidCol)return;
        const range=sheet.getRange(b.sourceRow,col);
        const actual=reviews.some(function(rr){return String(rr[1])==='บันทึกชำระ'&&String(rr[8])==='ผ่าน'&&
          String(rr[2])===String(b.queue)&&String(rr[4])===b.source+' / '+b.sheet&&rr[0] instanceof Date&&dateKey_(rr[0])===dateKey_(day);});
        if(actual||String(range.getBackground()).toUpperCase()==='#CCFF00'||/^\[ชำระ #/m.test(range.getNote()||''))return;
        if(String(range.getValue()||'').trim()&&paymentNumber_(range.getValue())!==b.fee)return;
        remember(sheet,range);range.clearContent();range.setBackground('#FFF2CC');
      });
      const historyNote=history.getRange(historyIndex+2,16), historyDate=history.getRange(historyIndex+2,1), reviewNote=review.getRange(rowNo,12);
      remember(history,historyNote);remember(history,historyDate);remember(review,reviewNote);
      if(String(historyNote.getValue()||'').indexOf(timing.timingDetail)<0) historyNote.setValue(String(historyNote.getValue()||'')+' / '+timing.timingDetail);
      historyDate.setValue(new Date(b.paidAt));
      if(String(reviewNote.getValue()||'').indexOf(timing.timingDetail)<0) reviewNote.setValue(String(reviewNote.getValue()||'')+' / '+timing.timingDetail);
      // Update snapshots only for the receipt note and proven forecast markers.
      b.after=(b.after||[]).map(function(snap){
        if(snap.row!==b.sourceRow)return snap;
        if(snap.col===paidCol)return snapshotCell_(cell);
        const range=sheet.getRange(snap.row,snap.col);
        if(snap.value&&snap.value.type==='number'&&snap.value.value===b.fee&&
            !String(range.getValue()||'').trim()&&String(range.getBackground()).toUpperCase()==='#FFF2CC') return snapshotCell_(range);
        return snap;
      });
      b.paymentTiming=timing;
      // Logs are the recovery source for the legacy receipts; keep the upgraded snapshot.
      if(!persistPaymentBackupLog_(b,'paymentSourceBackup','สำเร็จ',JSON.stringify(b)))throw new Error('Audit failed');
      props.setProperty(key,JSON.stringify(b));
      results.push({reviewRow:rowNo,queue:b.queue,daysFromDue:timing.daysFromDue});
    });
    SpreadsheetApp.flush();
    log.appendRow([new Date(),'','ระบบ','ระบบ','เพิ่มรายละเอียดชำระย้อนหลัง','','','สำเร็จ','paymentTimingMigration','สำเร็จ',
      JSON.stringify(changes.map(function(c){return {spreadsheetId:c.sheet.getParent().getId(),sheet:c.sheet.getName(),before:c.snapshot};}))]);
    console.log(JSON.stringify({ok:true,updated:results.length,items:results,skipped:skipped}));
  } finally {lock.releaseLock();}
}
