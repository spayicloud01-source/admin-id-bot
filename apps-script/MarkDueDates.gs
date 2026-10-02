// One-time maintenance: current due dates become yellow blank schedule markers.
// Actual approved receipts and green receipt cells are never erased.
function markCurrentDueDatesYellow() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Payment is busy');
  const changes = [];
  try {
    const backend = backendSpreadsheet_();
    const review = backend.getSheetByName(CONFIG.REVIEW_QUEUE_SHEET);
    const receipts = review.getLastRow() > 1 ? review.getRange(2,1,review.getLastRow()-1,12).getValues() : [];
    const log = backend.getSheetByName(CONFIG.LOG_SHEET);
    if (!log) throw new Error('Audit log missing');
    const targets = [{source:'v1/v3',sheet:'v3/10-69'},{source:'v6',sheet:'V6/10-69'}];
    for (const target of targets) {
      const ss = sourceSpreadsheetFor_(target.source), sheet = ss.getSheetByName(target.sheet);
      const h = detectHeaders_(sheet);
      if (!h || !h.queue || !h.name || !h.dueDate || !h.fee) throw new Error('Headers missing');
      const rows = sheet.getRange(h.headerRow+1,1,sheet.getLastRow()-h.headerRow,Math.max(h.queue,h.name,h.dueDate,h.fee,h.status||0)).getValues();
      rows.forEach(function(row,index) {
        if (!String(row[h.name-1]||'').trim() || !String(row[h.queue-1]||'').trim() ||
            /^(ปิด|ปิดยอด|ลบ)$/.test(String(row[(h.status||1)-1]||'').trim())) return;
        const due = row[h.dueDate-1], fee = paymentNumber_(row[h.fee-1]);
        if (!(due instanceof Date) || isNaN(due.getTime()) || !(fee>0)) return;
        const col = findCalendarDateColumn_(sheet,h.headerRow,h.note+1,due);
        if (!col) return;
        const range = sheet.getRange(h.headerRow+1+index,col);
        const receipt = receipts.some(function(r) {
          return String(r[1])==='บันทึกชำระ' && String(r[8])==='ผ่าน' &&
            String(r[2])===String(row[h.queue-1]) && String(r[4])===target.source+' / '+target.sheet &&
            r[0] instanceof Date && dateKey_(r[0])===dateKey_(due);
        });
        if (receipt || String(range.getBackground()).toUpperCase()==='#CCFF00' || /^\[ชำระ #/m.test(range.getNote()||'')) return;
        const value = range.getValue();
        if (String(value||'').trim() && paymentNumber_(value)!==fee) return;
        const before = snapshotCell_(range);
        changes.push({sheet:sheet,snapshot:before});
        if (String(value||'').trim()) range.clearContent();
        range.setBackground('#FFF2CC');
      });
    }
    SpreadsheetApp.flush();
    // Store exact before-state so the view migration is reversible.
    log.appendRow([new Date(),'','ระบบ','ระบบ','เปลี่ยนช่องเตือนกำหนด','','','สำเร็จ','dueDateMarkerMigration','สำเร็จ',
      JSON.stringify(changes.map(function(c){return {spreadsheetId:c.sheet.getParent().getId(),sheet:c.sheet.getName(),before:c.snapshot};}))]);
    console.log(JSON.stringify({ok:true,changed:changes.length,color:'#FFF2CC',forecastAmounts:false}));
  } catch(err) {
    changes.reverse().forEach(function(c){restoreCellSnapshot_(c.sheet,c.snapshot);});
    SpreadsheetApp.flush();throw err;
  } finally {lock.releaseLock();}
}
