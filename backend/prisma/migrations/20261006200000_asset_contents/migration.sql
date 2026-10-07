-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "sha256" CHAR(64),
ALTER COLUMN "storage_path" DROP NOT NULL;

-- CreateTable
CREATE TABLE "asset_contents" (
    "asset_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "asset_contents_pkey" PRIMARY KEY ("asset_id")
);

-- AddForeignKey
ALTER TABLE "asset_contents" ADD CONSTRAINT "asset_contents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

