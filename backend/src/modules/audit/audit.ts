import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CoreHubUser } from '../../common/auth/core-user.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/// ชนิดของสิ่งที่ถูกกระทำ (ใช้กรองใน Audit log)
export type AuditTargetKind = 'DESIGN' | 'TEMPLATE' | 'ASSET' | 'REPORT' | 'MEMBER' | 'COMMENT';

export interface AuditEntry {
  action: string;
  targetKind: AuditTargetKind;
  targetId?: string | null;
  /// บริบทตอนเกิดเหตุ — ห้ามใส่ชื่อจริง อีเมล หรือ token (เก็บได้แค่ coreUserId)
  metadata?: Record<string, unknown> | null;
}

/// บันทึก audit log — โมดูลอื่นเรียก `audit.record(user, {...})` หลังทำรายการสำเร็จ
///
/// บันทึกไม่สำเร็จต้องไม่ทำให้รายการหลักล้ม (log แล้วไปต่อ) เพราะ audit เป็นของประกอบ
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(actor: Pick<CoreHubUser, 'coreUserId' | 'coreRole'>, entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorCoreUserId: actor.coreUserId,
          actorCoreRole: actor.coreRole,
          action: entry.action,
          targetKind: entry.targetKind,
          targetId: entry.targetId ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      console.error(JSON.stringify({ event: 'audit.record_failed', action: entry.action, message: (error as Error).message }));
    }
  }

  /// งานอัตโนมัติของระบบ (เช่นลบงานที่ครบกำหนดเก็บ) — ผู้กระทำคือ "system"
  recordSystem(entry: AuditEntry): Promise<void> {
    return this.record({ coreUserId: 'system', coreRole: 'admin' }, entry);
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
