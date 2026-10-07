-- ค่าเริ่มต้นของธีมเป็น "สว่าง" ตามหน้าตาของ Core Hub (PL 8 ต.ค. 2569)
ALTER TABLE "preferences" ALTER COLUMN "theme" SET DEFAULT 'LIGHT';

-- แถวที่ยังเป็นค่าเริ่มต้นเดิม (ตามระบบ) เปลี่ยนเป็นสว่าง — ผู้ใช้เลือก "ตามการตั้งค่าอุปกรณ์" ใหม่ได้ในเมนูบัญชี
UPDATE "preferences" SET "theme" = 'LIGHT' WHERE "theme" = 'SYSTEM';
