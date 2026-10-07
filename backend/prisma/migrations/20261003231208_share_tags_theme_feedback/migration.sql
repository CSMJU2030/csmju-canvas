-- CreateEnum
CREATE TYPE "ThemeMode" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LinkAccess" AS ENUM ('NONE', 'VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('SUGGESTION', 'REPORT');

-- AlterTable
ALTER TABLE "designs" ADD COLUMN     "link_access" "LinkAccess" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "preferences" ADD COLUMN     "theme" "ThemeMode" NOT NULL DEFAULT 'SYSTEM';

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" UUID NOT NULL,
    "core_user_id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "link" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedbacks_created_at_idx" ON "feedbacks"("created_at");
