import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CoreHubUser } from '../../common/auth/core-user.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { AuditService } from '../audit/audit.js';
import { purgeDateOf } from '../designs/designs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type Actor = Pick<CoreHubUser, 'coreUserId' | 'coreRole'>;

const DAY_MS = 86_400_000;

const SELECT = {
  id: true,
  title: true,
  designType: true,
  width: true,
  height: true,
  thumbnail: true,
  coreUserId: true,
  trashedAt: true,
  purgedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DesignSelect;

type Row = Prisma.DesignGetPayload<{ select: typeof SELECT }>;

/// งานที่เจ้าของลบถาวรแล้ว (purgedAt) — ผู้ดูแลตรวจ กู้คืน หรือลบทันทีได้ภายใน 30 วัน
@Injectable()
export class DeletedDesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQuery & { q?: string }) {
    const q = query.q?.trim();
    const where: Prisma.DesignWhereInput = {
      purgedAt: { not: null },
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { coreUserId: q }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.design.findMany({ where, orderBy: { purgedAt: 'desc' }, skip: query.skip, take: query.take, select: SELECT }),
      this.prisma.design.count({ where }),
    ]);
    // จำนวนหน้านับใน Postgres ไม่ต้องดึง JSON state ทั้งก้อน (แบบรายการเทมเพลต)
    const counts = rows.length
      ? await this.prisma.$queryRaw<{ id: string; pages: number }[]>`
          SELECT id::text AS id, COALESCE(jsonb_array_length(document->'pages'), 1)::int AS pages
          FROM designs WHERE id = ANY(${rows.map((row) => row.id)}::uuid[])`
      : [];
    const pagesById = new Map(counts.map((c) => [c.id, c.pages]));

    return new Paginated(
      rows.map((row) => toDto(row, pagesById.get(row.id) ?? 1)),
      query.meta(total),
    );
  }

  async get(id: string) {
    const row = await this.prisma.design.findFirst({ where: { id, purgedAt: { not: null } }, select: { ...SELECT, document: true } });

    if (!row) throw new NotFoundException('ไม่พบงานที่ถูกลบนี้ อาจครบกำหนดและถูกลบจริงไปแล้ว');

    return { ...toDto(row, pageCountOf(row.document)), document: row.document as Record<string, unknown> };
  }

  /// กู้กลับไปไว้ในถังขยะของเจ้าของ — นับ 30 วันของถังขยะใหม่ ไม่อย่างนั้นงานที่อยู่ในถังเกิน 30 วันจะถูกลบถาวรซ้ำทันที
  async restore(user: Actor, id: string) {
    const row = await this.prisma.design.findFirst({ where: { id, purgedAt: { not: null } }, select: SELECT });

    if (!row) throw new NotFoundException('ไม่พบงานที่ถูกลบนี้ อาจครบกำหนดและถูกลบจริงไปแล้ว');

    const trashedAt = new Date();

    await this.prisma.design.update({ where: { id }, data: { purgedAt: null, trashedAt } });
    await this.audit.record(user, {
      action: 'design.restore_by_admin',
      targetKind: 'DESIGN',
      targetId: id,
      metadata: { ownerCoreUserId: row.coreUserId, title: row.title, deletedAt: row.purgedAt!.toISOString() },
    });
    void this.notifications
      .notify(row.coreUserId, 'DESIGN_RESTORED', `ผู้ดูแลระบบกู้คืน "${row.title}" ไปไว้ในถังขยะของคุณแล้ว`, '/trash')
      .catch(() => undefined);

    return { id, title: row.title, ownerCoreUserId: row.coreUserId, trashedAt: trashedAt.toISOString() };
  }

  /// ลบจริงทันที — เวอร์ชัน ความคิดเห็น และสถิติการเปิดถูกลบตาม (onDelete: Cascade) · รูปที่อัปโหลดไม่ถูกแตะ
  async purgeNow(user: Actor, id: string) {
    const row = await this.prisma.design.findFirst({ where: { id, purgedAt: { not: null } }, select: SELECT });

    if (!row) throw new NotFoundException('ไม่พบงานที่ถูกลบนี้ อาจครบกำหนดและถูกลบจริงไปแล้ว');

    await this.prisma.design.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'design.purge',
      targetKind: 'DESIGN',
      targetId: id,
      metadata: { reason: 'admin', ownerCoreUserId: row.coreUserId, title: row.title, deletedAt: row.purgedAt!.toISOString() },
    });

    return { id, deleted: true };
  }
}

function pageCountOf(document: unknown): number {
  const pages = (document as { pages?: unknown } | null)?.pages;

  return Array.isArray(pages) ? pages.length : 1;
}

export function daysUntil(date: Date, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((date.getTime() - now) / DAY_MS));
}

function toDto(row: Row, pageCount: number) {
  const purgeAt = purgeDateOf(row.purgedAt!);

  return {
    id: row.id,
    title: row.title,
    designType: row.designType,
    width: row.width,
    height: row.height,
    thumbnail: row.thumbnail,
    pageCount,
    ownerCoreUserId: row.coreUserId,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    deletedAt: row.purgedAt!.toISOString(),
    purgeAt: purgeAt.toISOString(),
    daysLeft: daysUntil(purgeAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
