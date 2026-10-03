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

    const where: Prisma.DesignWhereInput = {
      coreUserId,
      trashedAt: query.trashed ? { not: null } : null,
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

    if (access === 'VIEW') throw new ForbiddenException('ลิงก์นี้ให้สิทธิ์ดูอย่างเดียว');

    // คนที่ได้ลิงก์แบบแก้ไขได้ แก้ได้เฉพาะเนื้องาน — ชื่อ โฟลเดอร์ ถังขยะ แท็ก และการแชร์เป็นของเจ้าของ
    if (access === 'EDIT') {
      const ownerOnly = ['title', 'folderId', 'trashed', 'tags', 'linkAccess'] as const;

      if (ownerOnly.some((key) => dto[key] !== undefined)) {
        throw new ForbiddenException('เฉพาะเจ้าของงานเท่านั้นที่เปลี่ยนชื่อ ย้ายโฟลเดอร์ ลบ ตั้งแท็ก หรือเปลี่ยนการแชร์ได้');
      }
    }

    if (dto.document) assertDocument(dto.document);
    if (dto.folderId) await this.assertFolder(coreUserId, dto.folderId);

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

/// สิทธิ์ของผู้เรียกต่องาน: OWNER · EDIT/VIEW (ผ่านลิงก์) · null = ไม่มีสิทธิ์
export function accessOf(
  row: { coreUserId: string; linkAccess: string; trashedAt: Date | null },
  coreUserId: string,
): 'OWNER' | 'EDIT' | 'VIEW' | null {
  if (row.coreUserId === coreUserId) return 'OWNER';
  if (row.trashedAt || row.linkAccess === 'NONE') return null;

  return row.linkAccess === 'EDIT' ? 'EDIT' : 'VIEW';
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
    trashedAt: row.trashedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
