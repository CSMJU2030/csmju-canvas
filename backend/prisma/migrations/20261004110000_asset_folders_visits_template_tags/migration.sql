-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "folder_id" UUID;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "color_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "language_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "asset_folders" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_visits" (
    "id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "visited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_folders_core_user_id_idx" ON "asset_folders"("core_user_id");

-- CreateIndex
CREATE INDEX "design_visits_core_user_id_visited_at_idx" ON "design_visits"("core_user_id", "visited_at");

-- CreateIndex
CREATE UNIQUE INDEX "design_visits_design_id_core_user_id_key" ON "design_visits"("design_id", "core_user_id");

-- CreateIndex
CREATE INDEX "assets_folder_id_idx" ON "assets"("folder_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "asset_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_visits" ADD CONSTRAINT "design_visits_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

