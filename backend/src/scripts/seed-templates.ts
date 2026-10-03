import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { BUILTIN_TEMPLATES } from './builtin-templates.js';

/// ใส่เทมเพลตตั้งต้นของทีม CS Canvas ลงฐานข้อมูล (รันซ้ำได้ — upsert ตาม id คงที่)
///
///   pnpm --filter backend db:seed
///
/// แก้เนื้อหาของเทมเพลตเดิมด้วย แต่ไม่แตะ usageCount (สถิติการใช้จริง)
/// ภาพย่อเว้นว่างไว้ — หน้าบ้านวาดตัวอย่างจาก JSON state ให้เองเมื่อไม่มีภาพย่อ
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) throw new Error('ไม่พบ DATABASE_URL — คัดลอก .env.example เป็น .env ก่อน');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    for (const t of BUILTIN_TEMPLATES) {
      const data = {
        title: t.title,
        description: t.description,
        designType: t.designType,
        category: t.category,
        width: t.width,
        height: t.height,
        document: t.document as Prisma.InputJsonValue,
      };

      await prisma.template.upsert({
        where: { id: t.id },
        create: { id: t.id, createdByCoreUserId: null, ...data },
        update: data,
      });
    }

    console.log(`ใส่เทมเพลตตั้งต้นแล้ว ${BUILTIN_TEMPLATES.length} ชิ้น`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
