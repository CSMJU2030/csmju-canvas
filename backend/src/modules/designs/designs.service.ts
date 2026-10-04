import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { assertDocument, emptyDocument } from './design-document.js';
import type {
  CreateDesignDto,
  ListDesignsQuery,
  UpdateDesignDto,
} from './dto/design.dto.js';

/// งานในถังขยะถูกลบถาวรเมื่อครบกำหนดนี้ (ล้างตอนผู้ใช้เปิดดูถังขยะ ไม่ต้องมี cron)
export const TRASH_RETENTION_DAYS = 30;
/// เก็บเวอร์ชันอัตโนมัติไม่บ่อยกว่านี้ และเก็บไว้สูงสุดงานละกี่เวอร์ชัน
export const VERSION_INTERVAL_MS = 10 * 60_000;
export const MAX_VERSIONS = 50;

const EDITED_WITHIN_MS = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
} as const;

const SUMMARY_SELECT = {
  id: true,
  title: true,
  designType: true,
  width: true,
  height: true,
  thumbnail: true,
  folderId: true,
  sourceTemplateId: true,
  tags: true,
  linkAccess: true,
  starredAt: true,
  coreUserId: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DesignSelect;

type SummaryRow = Prisma.DesignGetPayload<{ select: typeof SUMMARY_SELECT }>;

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(coreUserId: string, query: ListDesignsQuery) {
    if (query.trashed) await this.purgeExpiredTrash(coreUserId);

    // งานที่แชร์กับฉัน = เจ้าของยังเปิดลิงก์อยู่ ไม่อยู่ในถังขยะ และฉันเคยเปิดดู (ถังขยะมีแต่งานของฉัน)
    const shared: Prisma.DesignWhereInput = {
      coreUserId: { not: coreUserId },
      linkAccess: { not: 'NONE' },
      trashedAt: null,
      visits: { some: { coreUserId } },
    };
    const mine: Prisma.DesignWhereInput = { coreUserId, trashedAt: query.trashed ? { not: null } : null };
    const scope = query.trashed ? 'mine' : (query.scope ?? 'mine');
    const where: Prisma.DesignWhereInput = {
      AND: [
        scope === 'mine' ? mine : scope === 'shared' ? shared : { OR: [mine, shared] },
        ...(query.starred ? [{ coreUserId, starredAt: { not: null } }] : []),
      ],
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.designType
        ? { designType: query.designType }
        : query.designTypes
          ? { designType: { in: query.designTypes.split(',') } }
          : {}),
      ...(query.folderId ? { folderId: query.folderId } : {}),
      ...(query.editedWithin
        ? { updatedAt: { gte: new Date(Date.now() - EDITED_WITHIN_MS[query.editedWithin]) } }
        : {}),
    };

    const orderBy: Prisma.DesignOrderByWithRelationInput =
      query.sort === 'title'
        ? { title: 'asc' }
        : query.sort === 'created'
          ? { createdAt: 'desc' }
          : { updatedAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.design.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.take,
        select: SUMMARY_SELECT,
      }),
      this.prisma.design.count({ where }),
    ]);

    return new Paginated(rows.map((row) => toSummary(row, coreUserId)), query.meta(total));
  }

  /// เจ้าของเห็นเสมอ · คนอื่นเห็นได้เมื่อเจ้าของเปิดแชร์ด้วยลิงก์และงานไม่อยู่ในถังขยะ
  /// (ไม่มีสิทธิ์ = 404 ไม่ใช่ 403 เพื่อไม่บอกว่ามีงาน id นี้อยู่)
  async get(coreUserId: string, id: string) {
    const row = await this.prisma.design.findUnique({ where: { id } });

    if (!row || accessOf(row, coreUserId) === null) throw new NotFoundException('ไม่พบงานนี้ อาจถูกลบไปแล้ว');

    // จดว่าเคยเปิดงานที่แชร์มา → ขึ้นใน "แชร์กับคุณ" ของแผงโปรเจกต์ และนับในสถิติของเจ้าของ
    if (row.coreUserId !== coreUserId) {
      await this.prisma.designVisit.upsert({
        where: { designId_coreUserId: { designId: row.id, coreUserId } },
        create: { designId: row.id, coreUserId },
        update: { visitedAt: new Date(), viewCount: { increment: 1 } },
      });
    }

    return { ...toSummary(row, coreUserId), document: row.document as Record<string, unknown> };
  }

  async create(coreUserId: string, dto: CreateDesignDto) {
    if (dto.folderId) await this.assertFolder(coreUserId, dto.folderId);

    if (dto.templateId) return this.createFromTemplate(coreUserId, dto);

    if (dto.copyFromDesignId) {
      const source = await this.get(coreUserId, dto.copyFromDesignId);
      const row = await this.prisma.design.create({
        data: {
          coreUserId,
          title: dto.title,
          designType: source.designType,
          width: source.width,
          height: source.height,
          document: source.document as Prisma.InputJsonValue,
          thumbnail: source.thumbnail,
          folderId: dto.folderId ?? source.folderId,
        },
      });

      return { ...toSummary(row, coreUserId), document: row.document as Record<string, unknown> };
    }

    const document = dto.document ?? emptyDocument();

    assertDocument(document);

    const row = await this.prisma.design.create({
      data: {
        coreUserId,
        title: dto.title,
        designType: dto.designType!,
        width: dto.width!,
        height: dto.height!,
        document: document as Prisma.InputJsonValue,
        folderId: dto.folderId ?? null,
      },
    });

    return { ...toSummary(row, coreUserId), document: row.document as Record<string, unknown> };
  }

  private async createFromTemplate(coreUserId: string, dto: CreateDesignDto) {
    const template = await this.prisma.template.findUnique({ where: { id: dto.templateId } });

    if (!template) throw new NotFoundException('ไม่พบเทมเพลตนี้ อาจถูกลบไปแล้ว');

    const [row] = await this.prisma.$transaction([
      this.prisma.design.create({
        data: {
          coreUserId,
          title: dto.title,
          designType: template.designType,
          width: template.width,
          height: template.height,
          document: template.document as Prisma.InputJsonValue,
          thumbnail: template.thumbnail,
          sourceTemplateId: template.id,
          folderId: dto.folderId ?? null,
        },
      }),
      this.prisma.template.update({
        where: { id: template.id },
        data: { usageCount: { increment: 1 } },
      }),
    ]);

    if (template.createdByCoreUserId && template.createdByCoreUserId !== coreUserId) {
      void this.notifications
        .notify(
          template.createdByCoreUserId,
          'TEMPLATE_USED',
          `มีผู้ใช้เทมเพลต "${template.title}" ของคุณ`,
          `/templates?id=${template.id}`,
        )
        .catch(() => undefined);
    }

    return { ...toSummary(row, coreUserId), document: row.document as Record<string, unknown> };
  }

  async update(coreUserId: string, id: string, dto: UpdateDesignDto) {
    const existing = await this.prisma.design.findUnique({ where: { id } });
    const access = existing ? accessOf(existing, coreUserId) : null;

    if (!existing || access === null) throw new NotFoundException('ไม่พบงานนี้ อาจถูกลบไปแล้ว');

    if (access === 'VIEW' || access === 'COMMENT') throw new ForbiddenException('ลิงก์นี้ไม่ได้ให้สิทธิ์แก้ไขงาน');

    // คนที่ได้ลิงก์แบบแก้ไขได้ แก้ได้เฉพาะเนื้องาน — ชื่อ โฟลเดอร์ ถังขยะ แท็ก ดาว และการแชร์เป็นของเจ้าของ
    if (access === 'EDIT') {
      const ownerOnly = ['title', 'folderId', 'trashed', 'tags', 'linkAccess', 'starred'] as const;

      if (ownerOnly.some((key) => dto[key] !== undefined)) {
        throw new ForbiddenException('เฉพาะเจ้าของงานเท่านั้นที่เปลี่ยนชื่อ ย้ายโฟลเดอร์ ลบ ตั้งแท็ก หรือเปลี่ยนการแชร์ได้');
      }
    }

    if (dto.document) assertDocument(dto.document);
    if (dto.folderId) await this.assertFolder(coreUserId, dto.folderId);

    // เก็บเวอร์ชันของเนื้องานก่อนเปลี่ยน (ไม่บ่อยกว่าทุก 10 นาที) — ประวัติเวอร์ชันในเมนูไฟล์
    if (dto.document) await this.snapshotIfDue(existing, coreUserId);

    const row = await this.prisma.design.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.document ? { document: dto.document as Prisma.InputJsonValue } : {}),
        ...(dto.width !== undefined ? { width: dto.width } : {}),
        ...(dto.height !== undefined ? { height: dto.height } : {}),
        ...(dto.thumbnail !== undefined ? { thumbnail: dto.thumbnail } : {}),
        ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}),
        ...(dto.tags !== undefined ? { tags: [...new Set(dto.tags.map((tag) => tag.trim()).filter(Boolean))] } : {}),
        ...(dto.linkAccess !== undefined ? { linkAccess: dto.linkAccess } : {}),
        ...(dto.starred !== undefined ? { starredAt: dto.starred ? (existing.starredAt ?? new Date()) : null } : {}),
        ...(dto.trashed !== undefined
          ? { trashedAt: dto.trashed ? (existing.trashedAt ?? new Date()) : null }
          : {}),
      },
    });

    if (dto.trashed && !existing.trashedAt) {
      void this.notifications
        .notify(
          coreUserId,
          'DESIGN_TRASHED',
          `ย้าย "${existing.title}" ไปถังขยะแล้ว · จะถูกลบถาวรใน ${TRASH_RETENTION_DAYS} วัน`,
          '/trash',
        )
        .catch(() => undefined);
    }

    return { ...toSummary(row, coreUserId), document: row.document as Record<string, unknown> };
  }

  /// ตรวจสิทธิ์แล้วคืนแถวงาน — ใช้กับเวอร์ชัน ความคิดเห็น และสถิติ
  async accessible(coreUserId: string, id: string, need: 'read' | 'comment' | 'edit' | 'owner') {
    const row = await this.prisma.design.findUnique({ where: { id } });
    const access = row ? accessOf(row, coreUserId) : null;

    if (!row || access === null) throw new NotFoundException('ไม่พบงานนี้ อาจถูกลบไปแล้ว');

    const allowed =
      need === 'read' ||
      access === 'OWNER' ||
      (need === 'edit' && access === 'EDIT') ||
      (need === 'comment' && (access === 'EDIT' || access === 'COMMENT'));

    if (!allowed) throw new ForbiddenException(need === 'owner' ? 'เฉพาะเจ้าของงานเท่านั้น' : 'ลิงก์นี้ไม่ได้ให้สิทธิ์ทำสิ่งนี้');

    return { row, access };
  }

  private async snapshotIfDue(existing: { id: string; document: Prisma.JsonValue; width: number; height: number }, coreUserId: string) {
    const last = await this.prisma.designVersion.findFirst({ where: { designId: existing.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });

    if (last && Date.now() - last.createdAt.getTime() < VERSION_INTERVAL_MS) return;

    await this.saveVersion(existing, coreUserId);
  }

  /// เก็บเวอร์ชันหนึ่งชุด แล้วตัดของเก่าให้เหลือไม่เกิน MAX_VERSIONS
  async saveVersion(design: { id: string; document: Prisma.JsonValue; width: number; height: number }, coreUserId: string) {
    const version = await this.prisma.designVersion.create({
      data: { designId: design.id, coreUserId, document: design.document as Prisma.InputJsonValue, width: design.width, height: design.height },
    });
    const stale = await this.prisma.designVersion.findMany({
      where: { designId: design.id },
      orderBy: { createdAt: 'desc' },
      skip: MAX_VERSIONS,
      select: { id: true },
    });

    if (stale.length > 0) await this.prisma.designVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });

    return version;
  }

  async stats(coreUserId: string, id: string) {
    await this.accessible(coreUserId, id, 'owner');

    const [visits, commentCount, versionCount] = await this.prisma.$transaction([
      this.prisma.designVisit.aggregate({ where: { designId: id }, _count: { _all: true }, _sum: { viewCount: true }, _max: { visitedAt: true } }),
      this.prisma.designComment.count({ where: { designId: id } }),
      this.prisma.designVersion.count({ where: { designId: id } }),
    ]);

    return {
      uniqueViewers: visits._count._all,
      totalViews: visits._sum.viewCount ?? 0,
      lastViewedAt: visits._max.visitedAt?.toISOString() ?? null,
      commentCount,
      versionCount,
    };
  }

  async remove(coreUserId: string, id: string) {
    const existing = await this.prisma.design.findFirst({ where: { id, coreUserId } });

    if (!existing) throw new NotFoundException('ไม่พบงานนี้ อาจถูกลบไปแล้ว');

    if (!existing.trashedAt) {
      throw new BadRequestException('ย้ายงานไปถังขยะก่อน แล้วจึงลบถาวรได้');
    }

    await this.prisma.design.delete({ where: { id } });

    return { id, deleted: true };
  }

  /// สถิติการใช้จริงของผู้ใช้ — แถว "ใช้บ่อย" ในหน้าแรก
  async typeUsage(coreUserId: string) {
    const groups = await this.prisma.design.groupBy({
      by: ['designType'],
      where: { coreUserId },
      _count: { _all: true },
      _max: { updatedAt: true },
    });

    return groups
      .map((group) => ({
        designType: group.designType,
        count: group._count._all,
        lastUsedAt: (group._max.updatedAt ?? new Date(0)).toISOString(),
      }))
      .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  private async purgeExpiredTrash(coreUserId: string) {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);

    await this.prisma.design.deleteMany({ where: { coreUserId, trashedAt: { lt: cutoff } } });
  }

  private async assertFolder(coreUserId: string, folderId: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, coreUserId } });

    if (!folder) throw new BadRequestException('ไม่พบโฟลเดอร์ที่เลือก');
  }
}

/// สิทธิ์ของผู้เรียกต่องาน: OWNER · EDIT/COMMENT/VIEW (ผ่านลิงก์) · null = ไม่มีสิทธิ์
export function accessOf(
  row: { coreUserId: string; linkAccess: string; trashedAt: Date | null },
  coreUserId: string,
): 'OWNER' | 'EDIT' | 'COMMENT' | 'VIEW' | null {
  if (row.coreUserId === coreUserId) return 'OWNER';
  if (row.trashedAt || row.linkAccess === 'NONE') return null;

  return row.linkAccess === 'EDIT' ? 'EDIT' : row.linkAccess === 'COMMENT' ? 'COMMENT' : 'VIEW';
}

export function toSummary(row: SummaryRow, coreUserId: string) {
  return {
    id: row.id,
    title: row.title,
    designType: row.designType,
    width: row.width,
    height: row.height,
    thumbnail: row.thumbnail,
    folderId: row.folderId,
    sourceTemplateId: row.sourceTemplateId,
    tags: row.tags,
    linkAccess: row.linkAccess,
    access: accessOf(row, coreUserId) ?? 'VIEW',
    // ดาวเป็นของเจ้าของ — คนที่ได้ลิงก์ไม่เห็น
    starred: row.coreUserId === coreUserId && row.starredAt !== null,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
