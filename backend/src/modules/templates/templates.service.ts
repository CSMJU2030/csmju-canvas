import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (query.category) and.push({ category: query.category });
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
      }),
      this.prisma.template.count({ where }),
    ]);

    return new Paginated(
      rows.map((row) => toSummary(row, user.coreUserId)),
      query.meta(total),
    );
  }

  async get(user: CoreHubUser, id: string) {
    const row = await this.prisma.template.findUnique({ where: { id } });

    if (!row) throw new NotFoundException('ไม่พบเทมเพลตนี้ อาจถูกลบไปแล้ว');

    return { ...toSummary(row, user.coreUserId), document: row.document as Record<string, unknown> };
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

function toSummary(row: Omit<Template, 'document'>, coreUserId: string) {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
