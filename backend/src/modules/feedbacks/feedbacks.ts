import { Body, Controller, Get, HttpCode, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { Layer2Roles } from '../../common/auth/layer2-roles.decorator.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { Paginated } from '../../common/http/envelope.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

export const FEEDBACK_KINDS = ['SUGGESTION', 'REPORT'] as const;

export class CreateFeedbackDto {
  @ApiProperty({ enum: FEEDBACK_KINDS, description: 'SUGGESTION = แนะนำการปรับปรุง · REPORT = รายงานเนื้อหา' })
  @IsIn(FEEDBACK_KINDS, { message: 'kind ต้องเป็น SUGGESTION หรือ REPORT' })
  kind!: (typeof FEEDBACK_KINDS)[number];

  @ApiProperty({ example: 'อยากให้มีเทมเพลตโปสเตอร์งานรับน้องเพิ่ม' })
  @IsString()
  @MinLength(5, { message: 'เขียนรายละเอียดอย่างน้อย 5 ตัวอักษร' })
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({ example: '/templates?q=โปสเตอร์', description: 'หน้าที่เกี่ยวข้อง (path ภายในระบบเท่านั้น)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/(?!\/)/, { message: 'link ต้องเป็น path ภายในระบบ เช่น /templates' })
  link?: string;
}

export class FeedbackDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: FEEDBACK_KINDS }) kind!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ nullable: true }) link!: string | null;
  @ApiProperty() createdAt!: string;
}

@Injectable()
export class FeedbacksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(coreUserId: string, dto: CreateFeedbackDto) {
    const row = await this.prisma.feedback.create({
      data: { coreUserId, kind: dto.kind, message: dto.message.trim(), link: dto.link ?? null },
    });

    return toDto(row);
  }

  async list(query: PaginationQuery) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({ orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
      this.prisma.feedback.count(),
    ]);

    return new Paginated(rows.map(toDto), query.meta(total));
  }
}

/// ไม่ส่ง coreUserId ของผู้แจ้งออกไป — ผู้ดูแลเห็นแค่เนื้อหา (ลดข้อมูลบุคคลที่ไม่จำเป็น)
function toDto(row: { id: string; kind: string; message: string; link: string | null; createdAt: Date }) {
  return { id: row.id, kind: row.kind, message: row.message, link: row.link, createdAt: row.createdAt.toISOString() };
}

@ApiTags('feedbacks')
@Controller('feedbacks')
export class FeedbacksController {
  constructor(private readonly feedbacks: FeedbacksService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'ส่งข้อเสนอแนะหรือรายงานเนื้อหา' })
  @ApiEnvelope(FeedbackDto, { status: 201 })
  create(@CurrentUser() user: CoreHubUser, @Body() dto: CreateFeedbackDto) {
    return this.feedbacks.create(user.coreUserId, dto);
  }

  @Get()
  @Layer2Roles('ADMIN')
  @ApiOperation({ summary: 'ข้อเสนอแนะทั้งหมด (ผู้ดูแลระบบเท่านั้น)' })
  @ApiEnvelopeList(FeedbackDto)
  list(@Query() query: PaginationQuery) {
    return this.feedbacks.list(query);
  }
}

@Module({ controllers: [FeedbacksController], providers: [FeedbacksService] })
export class FeedbacksModule {}
