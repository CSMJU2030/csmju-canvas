# csmju-canvas · CS Canvas

ระบบสร้างสื่อและกราฟิกบนเว็บของสาขาวิทยาการคอมพิวเตอร์ (ระบบย่อยของ CSMJU2030)
ใช้ทำสไลด์ ปกรายงาน โปสเตอร์ เกียรติบัตร อินโฟกราฟิก และ Resume แล้วบันทึกงานเป็น JSON state ที่ CMS ของคณะนำไป render ได้

- มาตรฐาน: `standards/` (submodule) · เวอร์ชันอยู่ใน `.standards-version` (1.7.1)
- เข้าสู่ระบบด้วย SSO 1.1 ของ Core Hub (`https://csmju2030.jowave.com`) · ระบบนี้ไม่มีหน้า login ของตัวเอง
- พอร์ต: frontend **3207** · backend **4207** · PostgreSQL ในเครื่อง **55207**

## เริ่มทำงาน

ต้องมี Node 22, pnpm 9 และ Docker

```bash
git submodule update --init standards
pnpm install

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

pnpm --filter backend db:up        # เปิด PostgreSQL ของระบบนี้
pnpm --filter backend db:migrate   # สร้างตาราง (prisma migrate deploy)
pnpm --filter backend db:seed      # ใส่เทมเพลตตั้งต้นของทีม (รันซ้ำได้)

pnpm --filter backend start:dev    # http://localhost:4207
pnpm --filter frontend dev         # http://localhost:3207
```

เปิดเว็บที่ `http://localhost:3207` เท่านั้น (ไม่ใช่ `127.0.0.1`) เพราะ callback ลงทะเบียนไว้เป็น localhost และคุกกี้ผูกกับชื่อ host

## ตรวจก่อนเปิด PR

```bash
bash standards/scripts/run-all-checks.sh .
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter backend test:e2e     # ต้องเปิดฐานข้อมูลก่อน
CONFORMANCE_ACCOUNTS_FILE=$HOME/.csmju/conformance-accounts.json node standards/conformance/run.js
```

## โครงสร้าง

| ส่วน | ที่อยู่ |
|---|---|
| ชั้น auth (คัดลอกจาก csmju-nexus · ห้ามแก้ตรรกะ) | `backend/src/auth/` |
| API ของระบบ | `backend/src/modules/` (designs, templates, assets, folders, notifications, preferences, quotas, data-exports) |
| เทมเพลตตั้งต้น | `backend/src/scripts/builtin-templates.ts` |
| สัญญา API | `backend/openapi.json` (`pnpm --filter backend openapi`) |
| engine ของผืนผ้าใบ (Canvas 2D เขียนเอง) | `frontend/src/lib/editor/` |
| หน้าแก้ไข | `frontend/src/components/editor/` |
| รูปแบบ JSON state | `docs/design-document.md` |
