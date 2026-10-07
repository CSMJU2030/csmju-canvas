import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '../generated/prisma/client.js';

/// ย้ายไฟล์อัปโหลดรุ่นเก่าจากดิสก์ (LOCAL_STORAGE_DIR) เข้าตาราง asset_contents — ใช้ครั้งเดียวบนเครื่อง dev
///
///   pnpm --filter backend assets:import-disk
///
/// รันซ้ำได้: ข้ามไฟล์ที่ย้ายแล้ว · ไฟล์ที่หาไม่เจอบนดิสก์จะรายงานไว้ ไม่ลบแถวทิ้ง
/// ไม่ต้องใช้บน server (ฐานบน server เริ่มใหม่ ไฟล์อยู่ในฐานตั้งแต่อัปโหลด)
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) throw new Error('ไม่พบ DATABASE_URL — คัดลอก .env.example เป็น .env ก่อน');

  const root = resolve(process.env.LOCAL_STORAGE_DIR ?? './storage-dev');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  let moved = 0;
  const missing: string[] = [];

  try {
    const legacy = await prisma.asset.findMany({
      where: { storagePath: { not: null }, content: null },
      select: { id: true, storagePath: true },
    });

    for (const row of legacy) {
      let bytes: Buffer;

      try {
        bytes = await readFile(join(root, row.storagePath!));
      } catch {
        missing.push(row.id);
        continue;
      }

      await prisma.$transaction([
        prisma.assetContent.create({ data: { assetId: row.id, content: bytes as Uint8Array<ArrayBuffer> } }),
        prisma.asset.update({
          where: { id: row.id },
          data: { storagePath: null, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length },
        }),
      ]);
      moved++;
    }

    console.log(JSON.stringify({ event: 'assets.import_disk', moved, missing: missing.length, missingIds: missing }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
