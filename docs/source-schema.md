# Source schema notes

These mappings are based on the currently inspected production source tabs. They are used as references for the Apps Script header auto-detection layer.

## v6 — `V6/10-69`
- A คิว
- B แอด
- C สถานะ
- D mail
- E apple id
- F apple id ลูกค้า
- G ชื่อ
- H รุ่น
- I เบอร์โทร
- J ยอด
- K ค่าเช่า
- L วันขาย/ฝาก
- M วันจ่าย
- N โน๊ต
- O onward daily calendar columns

## v2 — `V2 ปี69`
- A คิว
- B แอด
- C โน็ต
- D สถานะ
- E apple id
- H ชื่อ
- I รุ่น
- J เบอร์โทร
- K ยอดที่โอน
- L ยอด
- M ค่าเช่า
- N วันรับ
- O วันส่ง

## v2 — `V2/15B ปี69`
- A คิว
- B แอดมิน
- C โน็ต
- D สถานะ
- E ชื่อ icloud
- F:G apple id
- H ชื่อ
- I รุ่น
- J เบอร์โทร
- K ยอดที่โอน
- L ยอด
- M ดอก
- N วันฝาก
- O กำหนดวันจ่ายถัดไปจ่าย
- P วันจ่าย
- Q ยอดปิด

## v7 — `V7-69`
- A คิว
- B แอด
- C โน็ต
- D สถานะ
- E วันรับ
- F:H apple id / apple id ลูกค้า
- I ชื่อ
- J รุ่น
- K เบอร์โทร
- L ยอด
- M ค่าเช่า
- N วันส่ง

## v8/15 — `V8-69`
- A คิว
- B แอดมิน
- C โน็ต
- D สถานะ
- E ชื่อ icloud
- F:G apple id
- H ชื่อ
- I รุ่น
- J เบอร์โทร
- K ยอด
- L ดอก
- M วันรับ
- N กำหนดจ่าย
- O:P วันส่ง

## v1/v3 — `v3 ปี2569`
- A คิว
- B แอด
- C โน็ต
- D สถานะ
- E วันรับ
- F รุ่น
- G ชื่อ
- H เบอร์โทร
- I ยอด
- J ดอก
- K วันส่ง
- L apple id
- M PW
- N PW ลูกค้า

## v9/15 — `V9/15-69`
- A คิว
- B แอดมิน
- C โน็ต
- D สถานะ
- E ชื่อ icloud
- F:G apple id
- H ชื่อ
- I รุ่น
- J เบอร์โทร
- K ยอดที่โอน
- L ยอด
- M ดอก
- N วันฝาก
- O กำหนดวันจ่ายถัดไปจ่าย
- P วันจ่าย

## v2/15K — `V2/15K-69`
- A คิว
- B แอดมิน
- C โน็ต
- D สถานะ
- E ชื่อ icloud
- F:G apple id
- H ชื่อ
- I รุ่น
- J เบอร์โทร
- K ยอดที่โอน
- L ยอด
- M เช่า
- N วันฝาก
- O กำหนดวันจ่ายถัดไปจ่าย
- P วันจ่าย

## v7/15 — `V7/15-69`
- A คิว
- B แอดมิน
- C โน็ต
- D สถานะ
- E ชื่อ icloud
- F:G apple id
- H ชื่อ
- I รุ่น
- J เบอร์โทร
- K ยอด
- L ดอก
- M วันฝาก
- O วันจ่าย
- P ยอดที่ต้องจ่าย

## Notes
- Queue values are only safe as exact matches because queue numbers can collide across source files and years.
- Name matches may be partial.
- Phone values must be normalized by removing non-digits.
- Apple ID matching is lowercase + trim.
- Helper tabs such as `LINE แจ้งค่าเช่า`, summary tabs, Mail tabs, and other operational tabs should eventually be excluded from production customer search.
- Some historical tabs use different due-date semantics; the bot should prefer explicit due/payment columns over weekday helper columns.
