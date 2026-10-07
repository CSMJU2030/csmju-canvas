import { Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { Paginated } from '../../common/http/envelope.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { DesignsService } from './designs.service.js';

/// ประวัติเวอร์ชันของงาน (เมนูไฟล์ → ประวัติเวอร์ชัน) — ดูได้เฉพาะเจ้าของและคนที่ได้ลิงก์แก้ไขได้

export class DesignVersionSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) designId!: string;
  @ApiProperty({ enum: ['me', 'owner', 'collaborator'], description: 'ใครเป็นคนแก้จนเกิดเวอร์ชันนี้ (เทียบกับผู้เรียก)' }) author!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiProperty({ description: 'จำนวนหน้าในเวอร์ชันนี้' }) pageCount!: number;
  @ApiProperty() createdAt!: string;
}

export class DesignVersionDto extends DesignVersionSummaryDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) document!: Record<string, unknown>;
}

const UUID = new ParseUUIDPipe({ version: '4' });

function authorOf(versionUser: string, ownerId: string, me: string): 'me' | 'owner' | 'collaborator' {
  if (versionUser === me) return 'me';

  return versionUser === ownerId ? 'owner' : 'collaborator';
}

function pageCount(document: unknown): number {
  const pages = (document as { pages?: unknown } | null)?.pages;

  return Array.isArray(pages) ? pages.length : 1;
}

@ApiTags('designs')
@Controller('designs/:designId/versions')
export class DesignVersionsController {
  constructor(
    private readonly designs: DesignsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'เวอร์ชันที่เก็บไว้ของงาน (ใหม่สุดก่อน)' })
  @ApiEnvelopeList(DesignVersionSummaryDto)
  async list(@CurrentUser() user: CoreHubUser, @Param('designId', UUID) designId: string, @Query() query: PaginationQuery) {
    const { row } = await this.designs.accessible(user.coreUserId, designId, 'edit');
    const where = { designId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.designVersion.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
      this.prisma.designVersion.count({ where }),
    ]);

    return new Paginated(
      rows.map((v) => ({
        id: v.id,
        designId: v.designId,
        author: authorOf(v.coreUserId, row.coreUserId, user.coreUserId),
        width: v.width,
        height: v.height,
        pageCount: pageCount(v.document),
        createdAt: v.createdAt.toISOString(),
      })),
      query.meta(total),
    );
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'เก็บเวอร์ชันของเนื้องานปัจจุบันทันที (เมนูไฟล์ → บันทึก · ก่อนกู้คืนเวอร์ชันเก่า)' })
  @ApiEnvelope(DesignVersionSummaryDto, { status: 201 })
  async create(@CurrentUser() user: CoreHubUser, @Param('designId', UUID) designId: string) {
    const { row } = await this.designs.accessible(user.coreUserId, designId, 'edit');
    const v = await this.designs.saveVersion(row, user.coreUserId);

    return {
      id: v.id,
      designId: v.designId,
      author: 'me',
      width: v.width,
      height: v.height,
      pageCount: pageCount(v.document),
      createdAt: v.createdAt.toISOString(),
    };
  }

  @Get(':versionId')
  @ApiOperation({ summary: 'เวอร์ชันหนึ่งพร้อม JSON state (ดูตัวอย่าง ทำสำเนา หรือกู้คืน)' })
  @ApiEnvelope(DesignVersionDto)
  async get(@CurrentUser() user: CoreHubUser, @Param('designId', UUID) designId: string, @Param('versionId', UUID) versionId: string) {
    const { row } = await this.designs.accessible(user.coreUserId, designId, 'edit');
    const v = await this.prisma.designVersion.findFirst({ where: { id: versionId, designId } });

    if (!v) throw new NotFoundException('ไม่พบเวอร์ชันนี้');

    return {
      id: v.id,
      designId: v.designId,
      author: authorOf(v.coreUserId, row.coreUserId, user.coreUserId),
      width: v.width,
      height: v.height,
      pageCount: pageCount(v.document),
      createdAt: v.createdAt.toISOString(),
      document: v.document as Record<string, unknown>,
    };
  }
}
