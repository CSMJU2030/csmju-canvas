-- CreateEnum
CREATE TYPE "Layer2Role" AS ENUM ('CREATOR', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DESIGN_TRASHED', 'TEMPLATE_USED');

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designs" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "design_type" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "thumbnail" TEXT,
    "folder_id" UUID,
    "source_template_id" UUID,
    "trashed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "created_by_core_user_id" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "design_type" VARCHAR(40) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "thumbnail" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "mime_type" VARCHAR(60) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" VARCHAR(200) NOT NULL,
    "trashed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "link" VARCHAR(200),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferences" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "about_me" VARCHAR(300) NOT NULL DEFAULT '',
    "reduce_motion" BOOLEAN NOT NULL DEFAULT false,
    "high_contrast" BOOLEAN NOT NULL DEFAULT false,
    "large_text" BOOLEAN NOT NULL DEFAULT false,
    "notify_template_used" BOOLEAN NOT NULL DEFAULT true,
    "notify_trash" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_core_user_id_idx" ON "folders"("core_user_id");

-- CreateIndex
CREATE INDEX "designs_core_user_id_trashed_at_updated_at_idx" ON "designs"("core_user_id", "trashed_at", "updated_at");

-- CreateIndex
CREATE INDEX "templates_design_type_idx" ON "templates"("design_type");

-- CreateIndex
CREATE INDEX "templates_usage_count_idx" ON "templates"("usage_count");

-- CreateIndex
CREATE INDEX "assets_core_user_id_trashed_at_idx" ON "assets"("core_user_id", "trashed_at");

-- CreateIndex
CREATE INDEX "notifications_core_user_id_created_at_idx" ON "notifications"("core_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "preferences_core_user_id_key" ON "preferences"("core_user_id");

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
