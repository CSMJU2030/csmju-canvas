-- CreateTable
CREATE TABLE "subsystem_members" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "storage_quota_bytes" BIGINT,
    "last_core_role" VARCHAR(20),
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subsystem_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subsystem_members_core_user_id_key" ON "subsystem_members"("core_user_id");

-- CreateIndex
CREATE INDEX "subsystem_members_last_seen_at_idx" ON "subsystem_members"("last_seen_at");

-- Backfill: ผู้ใช้ที่มีงาน ไฟล์ หรือการตั้งค่าอยู่แล้วก่อนมีตารางนี้ (ข้อมูลจริงในฐาน ไม่ใช่ข้อมูลตัวอย่าง)
-- last_seen_at / last_core_role เป็น null จนกว่าเจ้าตัวจะเปิดแอปครั้งถัดไป
INSERT INTO "subsystem_members" ("id", "core_user_id", "created_at", "updated_at")
SELECT gen_random_uuid(), u.core_user_id, u.first_at, CURRENT_TIMESTAMP
FROM (
    SELECT core_user_id, MIN(first_at) AS first_at
    FROM (
        SELECT core_user_id, MIN(created_at) AS first_at FROM "designs" GROUP BY core_user_id
        UNION ALL
        SELECT core_user_id, MIN(created_at) FROM "assets" GROUP BY core_user_id
        UNION ALL
        SELECT core_user_id, MAX(updated_at) FROM "preferences" GROUP BY core_user_id
    ) AS seen
    GROUP BY core_user_id
) AS u
ON CONFLICT ("core_user_id") DO NOTHING;
