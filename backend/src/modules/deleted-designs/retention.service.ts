import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.js';
import { expireTrash, PURGE_RETENTION_DAYS } from '../designs/designs.service.js';

const DAY_MS = 86_400_000;

/// งานรายวันของการเก็บรักษางานที่ถูกลบ (การตัดสินใจของ PL: ผู้ดูแลเห็นงานที่ลบถาวรได้ 30 วัน)
///
///   1. งานที่อยู่ในถังขยะครบ 30 วัน → ตั้ง purgedAt (ถือว่าเจ้าของลบถาวร)
///   2. งานที่ purgedAt เกิน 30 วัน → ลบจริง (เวอร์ชัน ความคิดเห็น สถิติการเปิด ถูกลบตามด้วย cascade)
///
/// รูปที่อัปโหลด (assets) เป็นของผู้ใช้แยกจากงาน ไม่ถูกลบตามงาน — งานอื่นอาจใช้รูปเดียวกันอยู่
@Injectable()
export class RetentionService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// เครื่องที่ไม่ได้เปิดตอนตีสามก็ยังล้างได้ — รันหนึ่งครั้งหลังบูตหนึ่งนาที (ไม่รันในเทสต์)
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;

    setTimeout(() => void this.runDaily(), 60_000).unref();
  }

  @Cron('0 3 * * *', { name: 'design-retention', timeZone: 'Asia/Bangkok' })
  async runDaily(): Promise<void> {
    try {
      const expired = await expireTrash(this.prisma, this.audit);
      const purged = await this.purgeExpired();

      console.log(JSON.stringify({ event: 'retention.run', expiredFromTrash: expired, purged }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'retention.failed', message: (error as Error).message }));
    }
  }

  /// ลบจริงเฉพาะงานที่ purgedAt เก่ากว่า PURGE_RETENTION_DAYS · คืนจำนวนที่ลบ
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PURGE_RETENTION_DAYS * DAY_MS);
    const rows = await this.prisma.design.findMany({
      where: { purgedAt: { lt: cutoff } },
      select: { id: true, coreUserId: true, title: true, purgedAt: true },
    });

    if (rows.length === 0) return 0;

    // ใส่เงื่อนไข purgedAt ซ้ำ — งานที่ผู้ดูแลเพิ่งกู้คืนระหว่างนี้จะไม่ถูกลบ
    const result = await this.prisma.design.deleteMany({ where: { id: { in: rows.map((row) => row.id) }, purgedAt: { lt: cutoff } } });

    for (const row of rows) {
      await this.audit.recordSystem({
        action: 'design.purge',
        targetKind: 'DESIGN',
        targetId: row.id,
        metadata: { reason: 'retention', ownerCoreUserId: row.coreUserId, title: row.title, deletedAt: row.purgedAt!.toISOString() },
      });
    }

    return result.count;
  }
}
