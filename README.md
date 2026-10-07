# csmju-canvas · CS Canvas

ระบบสร้างสื่อและกราฟิกบนเว็บของสาขาวิทยาการคอมพิวเตอร์ (ระบบย่อยของ CSMJU2030)
ใช้ทำสไลด์ ปกรายงาน โปสเตอร์ เกียรติบัตร อินโฟกราฟิก และ Resume แล้วบันทึกงานเป็น JSON state ที่ CMS ของคณะนำไป render ได้

- มาตรฐาน: `standards/` (submodule) · เวอร์ชันอยู่ใน `.standards-version` (1.8.2)
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
| API ของระบบ | `backend/src/modules/` (designs, templates, assets, folders, asset-folders, notifications, preferences, quotas, data-exports, feedbacks, reports, deleted-designs, members, admin-stats, audit) |
| แผงผู้ดูแล (`/admin` · staff/admin) | `frontend/src/components/admin/` |
| เทมเพลตตั้งต้น | `backend/src/scripts/builtin-templates.ts` |
| สัญญา API | `backend/openapi.json` (`pnpm --filter backend openapi`) |
| engine ของผืนผ้าใบ (Canvas 2D เขียนเอง) | `frontend/src/lib/editor/` |
| หน้าแก้ไข | `frontend/src/components/editor/` |
| รูปแบบ JSON state | `docs/design-document.md` |

## Deploy (standards `docs/deployment.md`)

ระบบนี้มี 2 image ที่ GitHub Actions build จาก `main` (`ghcr.io/csmju2030/csmju-canvas-web` · `-api`) — DevOps เป็นผู้ดึงไปรันบน server

| | web | api |
|---|---|---|
| Dockerfile | `frontend/Dockerfile` (Next.js standalone · `BACKEND_URL=http://api:4000` ฝังตอน build) | `backend/Dockerfile` + `backend/docker/entrypoint.sh` |
| พอร์ตใน container | 3000 | 4000 · `GET /api/health` |
| ตอนสตาร์ต | `node frontend/server.js` | `prisma migrate deploy` แล้ว `node dist/main.js` |
| env | `CORE_HUB_WEB_URL` · `SUBSYSTEM_ID` · `TZ` | ทุกตัวใน `backend/.env.example` (ค่าบน server: `NODE_ENV=production` · `PORT=4000` · `DATABASE_POOL_MAX=5`) |

ทดสอบในเครื่องแบบเดียวกับ server (ระบบไฟล์อ่านอย่างเดียว · ไม่มี capability · จำกัด RAM):

```bash
# ปิด pnpm dev ก่อน (ใช้พอร์ต 3207 เดียวกัน)
docker compose up -d --build                                  # db + api + web → http://localhost:3207
docker compose exec api node dist/scripts/seed-templates.js   # ใส่เทมเพลตตั้งต้นของทีม (ครั้งเดียว รันซ้ำได้)
docker compose down
```

ข้อมูลสำหรับ DevOps:

- **ไฟล์ที่ผู้ใช้อัปโหลด** (รูป วิดีโอ เสียง ฟอนต์) เก็บในฐานข้อมูลของระบบเอง (ตาราง `asset_contents`) ไฟล์ละไม่เกิน 10 MB ·
  โควตาเริ่มต้น 500 MB ต่อคน (ผู้ดูแลปรับได้ถึง 5 GB) — ขนาดรวมของฐานจึงโตตามจำนวนผู้ใช้ ต้องตกลงเพดานรวมกับ DevOps (deployment.md ข้อ 4.3)
- **ครั้งแรกหลังขึ้น server** สั่ง `node dist/scripts/seed-templates.js` ใน container ของ api หนึ่งครั้ง เพื่อใส่เทมเพลตตั้งต้นของทีม (ไม่ได้รันเองตอนสตาร์ต)
- งานตั้งเวลา: ลบงานที่ผู้ใช้ลบถาวรเกิน 30 วันทุกวันตี 3 (`Asia/Bangkok`) · ไม่เรียกบริการภายนอกนอกจาก Core Hub
- **ผู้ร่วมงานแบบสด** (เคอร์เซอร์พร้อมชื่อ): socket.io ที่ path `/realtime` — web rewrite ไป api เหมือน `/api/*` จึงใช้ได้ทันทีแบบ long-polling ผ่าน HTTP ·
  ถ้าต้องการ WebSocket จริง (เร็วกว่า) ให้ reverse proxy ส่ง `Upgrade` ของ `/realtime` ไปที่ container api:4000 · สถานะอยู่ในหน่วยความจำ ใช้กับ api instance เดียว
- migration ไม่มี `CREATE EXTENSION` (ใช้ได้กับ role ที่ไม่ใช่ superuser)

