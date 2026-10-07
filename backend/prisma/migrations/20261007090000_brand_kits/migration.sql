-- CreateTable
CREATE TABLE "brand_kits" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heading_font" VARCHAR(120),
    "body_font" VARCHAR(120),
    "logo_asset_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_kits_core_user_id_idx" ON "brand_kits"("core_user_id");

