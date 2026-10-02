// Manual, narrowly scoped migration for the approved pre-daily-total receipt.
// Run in the Payment project; never redeclare or reapprove the receipt.
function repairLegacyFine6DailyTotal() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Payment is busy');
  try {
    const backend = backendSpreadsheet_();
    const review = backend.getSheetByName(CONFIG.REVIEW_QUEUE_SHEET);
    const row = review.getRange(6, 1, 1, 12).getDisplayValues()[0];
    if (row[1] !== 'รับค่าปรับ' || row[2] !== '310-3' || row[4] !== 'v1/v3 / v3/10-69' ||
        row[8] !== 'ผ่าน' || paymentNumber_(row[6]) !== 100 ||
        dateKey_(finePaidDate_(row[5])) !== '2026-09-29') throw new Error('Receipt changed');
    const customer = findCustomerIdentity_('v1/v3', 'v3/10-69', row[2]);
    if (!customer || normalizeGeneral_(customer.name) !== normalizeGeneral_(row[3])) throw new Error('Customer changed');
    const ss = sourceSpreadsheetFor_('v1/v3');
    const sheet = ss.getSheetByName('v3/10-69');
    const headers = detectHeaders_(sheet);
    const col = findCalendarDateColumn_(sheet, headers.headerRow, headers.note + 1, finePaidDate_(row[5]));
    if (col !== 43 || findFineTotalRow_(sheet, headers) !== 27) throw new Error('Total coordinates changed');
    const customerCell = sheet.getRange(Number(customer.row), col);
    const total = sheet.getRange(27, col);
    const line = '[ค่าปรับ #6] รับ 100 บาท วันที่ 2026-09-29';
    if (!(customerCell.getNote() || '').split('\n').includes(line)) throw new Error('Original fine note missing');
    const props = PropertiesService.getScriptProperties();
    const key = paymentSourceWriteKey_(6);
    const priorRaw = props.getProperty(key);
    let backup = priorRaw ? JSON.parse(priorRaw) : null;
    if (!backup) {
      const log = backend.getSheetByName(CONFIG.LOG_SHEET);
      const rows = log.getRange(2, 1, log.getLastRow() - 1, 11).getDisplayValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][5] === '6' && /^paymentSourceBackup(After)?$/.test(rows[i][8])) {
          const candidate = JSON.parse(rows[i][10]);
          if (candidate.writtenAt) { backup = candidate; break; }
        }
      }
    }
    if (!backup || backup.kind !== 'fine' || !backup.writtenAt || backup.reversedAt ||
        backup.amount !== 100 || backup.queue !== '310-3' || backup.sheet !== sheet.getName() ||
        backup.spreadsheetId !== ss.getId() || backup.sourceRow !== Number(customer.row) ||
        dateKey_(new Date(backup.paidAt)) !== '2026-09-29') throw new Error('Original backup missing or changed');
    const ownTotalLine = line + ' คิว 310-3';
    if (backup.dailyTotalBackfilledAt && backup.fineTotal && backup.fineTotal.row === 27 &&
        backup.fineTotal.col === 43 && (total.getNote() || '').split('\n').includes(ownTotalLine) &&
        fineTotalValue_(total) >= 100) {
      console.log(JSON.stringify({ok:true,already:true,cell:'AQ27',total:fineTotalValue_(total)}));
      return;
    }
    if (backup.fineTotal || fineTotalValue_(total) !== 0 || (total.getNote() || '').trim()) throw new Error('Total is not an untouched legacy blank');
    const beforeTotal = snapshotCell_(total);
    backup.before = (backup.before || []).concat([beforeTotal]);
    backup.fineTotal = {row:27,col:43};
    backup.dailyTotalBackfilledAt = new Date().toISOString();
    try {
      total.setValue(100);
      total.setNote(ownTotalLine);
      SpreadsheetApp.flush();
      backup.after = [snapshotCell_(customerCell), snapshotCell_(total)];
      props.setProperty(key, JSON.stringify(backup));
      // Recovery loader reads paymentSourceBackup entries, so store the complete updated record.
      if (!persistPaymentBackupLog_(backup, 'paymentSourceBackup', 'สำเร็จ', JSON.stringify(backup))) throw new Error('Could not persist recovery log');
    } catch (err) {
      restoreCellSnapshot_(sheet, beforeTotal);
      if (priorRaw) props.setProperty(key, priorRaw); else props.deleteProperty(key);
      SpreadsheetApp.flush();
      throw err;
    }
    console.log(JSON.stringify({ok:true,backfilled:true,queue:'310-3',amount:100,cell:'AQ27',total:total.getValue()}));
  } finally { lock.releaseLock(); }
}
