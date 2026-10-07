-- AlterEnum
ALTER TYPE "LinkAccess" ADD VALUE 'COMMENT';

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'COMMENT_ADDED';

-- AlterTable
ALTER TABLE "design_visits" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "designs" ADD COLUMN     "starred_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "design_versions" (
    "id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_comments" (
    "id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "page_id" VARCHAR(80) NOT NULL,
    "element_id" VARCHAR(80),
    "parent_id" UUID,
    "body" VARCHAR(2000) NOT NULL,
    "reactions" JSONB NOT NULL DEFAULT '{}',
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "design_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_versions_design_id_created_at_idx" ON "design_versions"("design_id", "created_at");

-- CreateIndex
CREATE INDEX "design_comments_design_id_created_at_idx" ON "design_comments"("design_id", "created_at");

-- AddForeignKey
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_comments" ADD CONSTRAINT "design_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "design_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

