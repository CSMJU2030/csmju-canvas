import { ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { Prisma, Template } from '../../generated/prisma/client.js';
import { subsystemRoleFor } from '../../auth/role-mapping.js';
import type { CoreHubUser } from '../../common/auth/core-user.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { assertDocument } from '../designs/design-document.js';
import type {
  CreateTemplateDto,
  ListTemplatesQuery,
  UpdateTemplateDto,
} from './dto/template.dto.js';
import { templateTags } from './template-tags.js';

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /// เทมเพลตที่มีอยู่ก่อนมีตัวกรองสี/ภาษา (หรือเพิ่มตรงลงฐาน) — คำนวณป้ายให้ตอนบูต
  async onModuleInit() {
    const rows = await this.prisma.template.findMany({
      where: { colorTags: { isEmpty: true }, languageTags: { isEmpty: true } },
      select: { id: true, document: true },
    });

    for (const row of rows) {
      const tags = templateTags(row.document);

      if (tags.colorTags.length > 0 || tags.languageTags.length > 0) {
        await this.prisma.template.update({ where: { id: row.id }, data: tags });
      }
    }
  }

  async list(user: CoreHubUser, query: ListTemplatesQuery) {
    const and: Prisma.TemplateWhereInput[] = [];

    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.designType) and.push({ designType: query.designType });
    if (query.starred) and.push({ favorites: { some: { coreUserId: user.coreUserId } } });
    if (query.builtIn) and.push({ createdByCoreUserId: null });
    if (query.category) and.push({ category: query.category });
    if (query.colors) and.push({ colorTags: { hasSome: query.colors.split(',') } });
    if (query.language) and.push({ languageTags: { has: query.language } });
    if (query.owner === 'me') and.push({ createdByCoreUserId: user.coreUserId });
    if (query.owner === 'others') {
      and.push({
        OR: [
          { createdByCoreUserId: null },
          { createdByCoreUserId: { not: user.coreUserId } },
        ],
      });
    }

    const where: Prisma.TemplateWhereInput = { AND: and };

    const orderBy: Prisma.TemplateOrderByWithRelationInput[] =
      query.sort === 'recent'
        ? [{ createdAt: 'desc' }]
        : [{ usageCount: 'desc' }, { createdAt: 'desc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.template.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.take,
        omit: { document: true },
        include: { favorites: { where: { coreUserId: user.coreUserId }, select: { id: true } } },
      }),
      this.prisma.template.count({ where }),
    ]);

    // จำนวนหน้าใช้แสดงป้ายบนการ์ด — นับใน Postgres ไม่ต้องดึง JSON state ทั้งก้อนมา
    const counts = rows.length
      ? await this.prisma.$queryRaw<{ id: string; pages: number }[]>`
          SELECT id::text AS id, COALESCE(jsonb_array_length(document->'pages'), 1)::int AS pages
          FROM templates WHERE id = ANY(${rows.map((row) => row.id)}::uuid[])`
      : [];
    const pagesById = new Map(counts.map((c) => [c.id, c.pages]));

    return new Paginated(
      rows.map((row) => ({ ...toSummary(row, user.coreUserId), pageCount: pagesById.get(row.id) ?? 1 })),
      query.meta(total),
    );
  }

  async get(user: CoreHubUser, id: string) {
    const row = await this.prisma.template.findUnique({
      where: { id },
      include: { favorites: { where: { coreUserId: user.coreUserId }, select: { id: true } } },
    });

    if (!row) throw new NotFoundException('ไม่พบเทมเพลตนี้ อาจถูกลบไปแล้ว');

    return { ...toSummary(row, user.coreUserId), pageCount: pageCountOf(row.document), document: row.document as Record<string, unknown> };
  }

  async create(user: CoreHubUser, dto: CreateTemplateDto) {
    assertDocument(dto.document);

    const row = await this.prisma.template.create({
      data: {
        createdByCoreUserId: user.coreUserId,
        title: dto.title,
        description: dto.description ?? '',
        designType: dto.designType,
        category: dto.category,
        width: dto.width,
        height: dto.height,
        document: dto.document as Prisma.InputJsonValue,
        thumbnail: dto.thumbnail ?? null,
        ...templateTags(dto.document),
      },
    });

    return { ...toSummary(row, user.coreUserId), document: row.document as Record<string, unknown> };
  }

  async update(user: CoreHubUser, id: string, dto: UpdateTemplateDto) {
    await this.assertCanManage(user, id);

    const row = await this.prisma.template.update({ where: { id }, data: dto });

    return { ...toSummary(row, user.coreUserId), document: row.document as Record<string, unknown> };
  }

  async remove(user: CoreHubUser, id: string) {
    await this.assertCanManage(user, id);
    await this.prisma.template.delete({ where: { id } });

    return { id, deleted: true };
  }

  async favorite(user: CoreHubUser, templateId: string) {
    const template = await this.prisma.template.findUnique({ where: { id: templateId }, select: { id: true } });

    if (!template) throw new NotFoundException('ไม่พบเทมเพลตนี้ อาจถูกลบไปแล้ว');

    const row = await this.prisma.templateFavorite.upsert({
      where: { coreUserId_templateId: { coreUserId: user.coreUserId, templateId } },
      create: { coreUserId: user.coreUserId, templateId },
      update: {},
    });

    return { templateId: row.templateId, createdAt: row.createdAt.toISOString() };
  }

  async unfavorite(user: CoreHubUser, templateId: string) {
    const removed = await this.prisma.templateFavorite.deleteMany({ where: { coreUserId: user.coreUserId, templateId } });

    if (removed.count === 0) throw new NotFoundException('เทมเพลตนี้ไม่ได้ติดดาวไว้');

    return { id: templateId, deleted: true };
  }

  /// แก้/ลบได้เฉพาะคนที่เผยแพร่ หรือ ADMIN · เทมเพลตตั้งต้นของทีมแก้ได้เฉพาะ ADMIN
  private async assertCanManage(user: CoreHubUser, id: string) {
    const row = await this.prisma.template.findUnique({
      where: { id },
      select: { createdByCoreUserId: true },
    });

    if (!row) throw new NotFoundException('ไม่พบเทมเพลตนี้ อาจถูกลบไปแล้ว');

    const isAdmin = subsystemRoleFor(user.coreRole) === 'ADMIN';

    if (!isAdmin && row.createdByCoreUserId !== user.coreUserId) {
      throw new ForbiddenException('แก้ไขได้เฉพาะเทมเพลตที่คุณเผยแพร่เอง');
    }
  }
}

function pageCountOf(document: unknown): number {
  const pages = (document as { pages?: unknown } | null)?.pages;

  return Array.isArray(pages) ? pages.length : 1;
}

function toSummary(row: Omit<Template, 'document'> & { favorites?: { id: string }[] }, coreUserId: string) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    designType: row.designType,
    category: row.category,
    width: row.width,
    height: row.height,
    thumbnail: row.thumbnail,
    usageCount: row.usageCount,
    isBuiltIn: row.createdByCoreUserId === null,
    isMine: row.createdByCoreUserId === coreUserId,
    isStarred: (row.favorites?.length ?? 0) > 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
