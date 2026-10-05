-- เรื่องร้องเรียน (reports) · ซ่อนเทมเพลต (templates.hidden_at) · เก็บงานที่ลบถาวรให้ผู้ดูแล 30 วัน (designs.purged_at)
-- ทุกคอลัมน์ใหม่เป็น nullable หรือมีค่าเริ่มต้น — แถวเดิมไม่เปลี่ยน

-- CreateEnum
CREATE TYPE "ReportTargetKind" AS ENUM ('DESIGN', 'TEMPLATE', 'COMMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('COPYRIGHT', 'INAPPROPRIATE', 'SPAM', 'PERSONAL_DATA', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportAction" AS ENUM ('HIDE_TARGET');

-- AlterEnum (PostgreSQL 12+ เพิ่มหลายค่าในไฟล์เดียวได้ · ระบบนี้ใช้ 16)
ALTER TYPE "NotificationKind" ADD VALUE 'REPORT_UPDATED';
ALTER TYPE "NotificationKind" ADD VALUE 'CONTENT_MODERATED';
ALTER TYPE "NotificationKind" ADD VALUE 'DESIGN_RESTORED';

-- AlterTable
ALTER TABLE "designs" ADD COLUMN     "purged_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "hidden_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_core_user_id" TEXT NOT NULL,
    "target_kind" "ReportTargetKind" NOT NULL,
    "target_id" UUID,
    "target_excerpt" VARCHAR(300),
    "link" VARCHAR(300),
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(2000) NOT NULL DEFAULT '',
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_core_user_id" TEXT,
    "resolution_note" VARCHAR(1000),
    "action_taken" "ReportAction",
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_kind_target_id_idx" ON "reports"("target_kind", "target_id");

-- CreateIndex
CREATE INDEX "reports_reporter_core_user_id_idx" ON "reports"("reporter_core_user_id");

-- CreateIndex
CREATE INDEX "designs_purged_at_idx" ON "designs"("purged_at");
