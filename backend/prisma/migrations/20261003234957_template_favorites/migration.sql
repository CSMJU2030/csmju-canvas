-- CreateTable
CREATE TABLE "template_favorites" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "template_favorites_core_user_id_template_id_key" ON "template_favorites"("core_user_id", "template_id");

-- AddForeignKey
ALTER TABLE "template_favorites" ADD CONSTRAINT "template_favorites_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
