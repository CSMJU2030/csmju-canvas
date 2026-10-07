-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "source_site" VARCHAR(60),
ADD COLUMN     "source_url" VARCHAR(500);

-- CreateIndex
CREATE INDEX "assets_core_user_id_source_site_idx" ON "assets"("core_user_id", "source_site");

