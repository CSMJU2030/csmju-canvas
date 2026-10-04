import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { createHash } from 'node:crypto';
import type { DesignComment, Prisma } from '../../generated/prisma/client.js';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { Paginated } from '../../common/http/envelope.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { DesignsService } from './designs.service.js';
import { DeletedDto } from './dto/design.dto.js';

/// ความคิดเห็นบนงาน — อ่านได้ทุกคนที่เปิดงานได้ · เขียนได้เฉพาะเจ้าของและลิงก์ที่ "แสดงความคิดเห็นได้"/"แก้ไขได้"
///
/// ระบบไม่เก็บชื่อหรืออีเมล: ผู้เขียนแสดงเป็น "คุณ" "เจ้าของงาน" หรือ "ผู้ร่วมงาน" + รหัสสั้นที่คำนวณจาก core_user_id

export const REACTIONS = ['❤️', '👍', '👏', '😂', '😮', '🤔'] as const;

export class CreateCommentDto {
  @ApiProperty({ example: 'ตัวอักษรหัวข้อใหญ่ไปนิด' })
  @IsString()
  @MinLength(1, { message: 'พิมพ์ความคิดเห็นก่อนส่ง' })
  @MaxLength(2000)
  body!: string;

  @ApiProperty({ example: 'page-1a2b3c4d', description: 'id ของหน้าใน JSON state' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  pageId!: string;

  @ApiPropertyOptional({ example: 'el-1a2b3c4d', description: 'id ของชิ้นงาน · ไม่ส่ง = ทั้งหน้า' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  elementId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ตอบกลับความคิดเห็นนี้' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}

export class UpdateCommentDto {
  @ApiPropertyOptional({ description: 'แก้ข้อความ (ผู้เขียนเท่านั้น)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({ description: 'true = ทำเครื่องหมายว่าแก้ไขแล้ว · false = เปิดใหม่' })
  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @ApiPropertyOptional({ enum: REACTIONS, description: 'กดอีโมจิ (กดซ้ำ = ยกเลิก)' })
  @IsOptional()
  @IsIn(REACTIONS, { message: 'อีโมจินี้ใช้รีแอกชันไม่ได้' })
  reaction?: (typeof REACTIONS)[number];
}

export class CommentReactionDto {
  @ApiProperty() emoji!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'ผู้เรียกกดอีโมจินี้แล้ว' }) mine!: boolean;
}

export class CommentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) designId!: string;
  @ApiProperty() pageId!: string;
  @ApiPropertyOptional({ nullable: true }) elementId!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) parentId!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: ['me', 'owner', 'collaborator'] }) author!: string;
  @ApiProperty({ description: 'รหัสสั้นของผู้เขียน (ไม่ระบุตัวตน) ใช้แยกผู้ร่วมงานแต่ละคน', example: 'A1B2' }) authorTag!: string;
  @ApiProperty({ type: [CommentReactionDto] }) reactions!: CommentReactionDto[];
  @ApiPropertyOptional({ nullable: true }) resolvedAt!: string | null;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canDelete!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

const UUID = new ParseUUIDPipe({ version: '4' });

function tagOf(coreUserId: string): string {
  return createHash('sha256').update(`csc-comment:${coreUserId}`).digest('hex').slice(0, 4).toUpperCase();
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly designs: DesignsService,
    private readonly notifications: NotificationsService,
  ) {}

  toDto(row: DesignComment, ownerId: string, me: string) {
    const reactions = (row.reactions ?? {}) as Record<string, string[]>;

    return {
      id: row.id,
      designId: row.designId,
      pageId: row.pageId,
      elementId: row.elementId,
      parentId: row.parentId,
      body: row.body,
      author: row.coreUserId === me ? 'me' : row.coreUserId === ownerId ? 'owner' : 'collaborator',
      authorTag: tagOf(row.coreUserId),
      reactions: Object.entries(reactions)
        .filter(([, users]) => users.length > 0)
        .map(([emoji, users]) => ({ emoji, count: users.length, mine: users.includes(me) })),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      canEdit: row.coreUserId === me,
      canDelete: row.coreUserId === me || ownerId === me,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(me: string, designId: string, query: PaginationQuery) {
    const { row } = await this.designs.accessible(me, designId, 'read');
    const where = { designId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.designComment.findMany({ where, orderBy: { createdAt: 'asc' }, skip: query.skip, take: query.take }),
      this.prisma.designComment.count({ where }),
    ]);

    return new Paginated(rows.map((c) => this.toDto(c, row.coreUserId, me)), query.meta(total));
  }

  async create(me: string, designId: string, dto: CreateCommentDto) {
    const { row } = await this.designs.accessible(me, designId, 'comment');
    let parentAuthor: string | null = null;

    if (dto.parentId) {
      const parent = await this.prisma.designComment.findFirst({ where: { id: dto.parentId, designId } });

      if (!parent) throw new NotFoundException('ไม่พบความคิดเห็นที่จะตอบกลับ');
      if (parent.parentId) throw new BadRequestException('ตอบกลับได้เฉพาะความคิดเห็นหลัก');

      parentAuthor = parent.coreUserId;
    }

    const comment = await this.prisma.designComment.create({
      data: {
        designId,
        coreUserId: me,
        pageId: dto.pageId,
        elementId: dto.elementId ?? null,
        parentId: dto.parentId ?? null,
        body: dto.body.trim(),
      },
    });

    // แจ้งเจ้าของงาน และผู้เขียนความคิดเห็นหลักเมื่อมีคนตอบ (ไม่แจ้งตัวเอง)
    const recipients = new Set([row.coreUserId, ...(parentAuthor ? [parentAuthor] : [])]);

    recipients.delete(me);
    for (const recipient of recipients) {
      void this.notifications
        .notify(recipient, 'COMMENT_ADDED', `มีความคิดเห็นใหม่ใน "${row.title}"`, `/design/${designId}`)
        .catch(() => undefined);
    }

    return this.toDto(comment, row.coreUserId, me);
  }

  private async find(me: string, id: string) {
    const comment = await this.prisma.designComment.findUnique({ where: { id } });

    if (!comment) throw new NotFoundException('ไม่พบความคิดเห็นนี้');

    const { row, access } = await this.designs.accessible(me, comment.designId, 'read');

    return { comment, row, access };
  }

  async update(me: string, id: string, dto: UpdateCommentDto) {
    const { comment, row, access } = await this.find(me, id);
    const canWrite = access === 'OWNER' || access === 'EDIT' || access === 'COMMENT';

    if (!canWrite) throw new ForbiddenException('ลิงก์นี้ให้สิทธิ์ดูอย่างเดียว');
    if (dto.body !== undefined && comment.coreUserId !== me) throw new ForbiddenException('แก้ได้เฉพาะความคิดเห็นของคุณ');

    const data: Prisma.DesignCommentUpdateInput = {};

    if (dto.body !== undefined) data.body = dto.body.trim();
    if (dto.resolved !== undefined) data.resolvedAt = dto.resolved ? (comment.resolvedAt ?? new Date()) : null;
    if (dto.reaction) {
      const reactions = { ...((comment.reactions ?? {}) as Record<string, string[]>) };
      const users = new Set(reactions[dto.reaction] ?? []);

      if (users.has(me)) users.delete(me);
      else users.add(me);
      reactions[dto.reaction] = [...users];
      data.reactions = reactions;
    }

    const updated = await this.prisma.designComment.update({ where: { id }, data });

    return this.toDto(updated, row.coreUserId, me);
  }

  async remove(me: string, id: string) {
    const { comment, row } = await this.find(me, id);

    if (comment.coreUserId !== me && row.coreUserId !== me) throw new ForbiddenException('ลบได้เฉพาะความคิดเห็นของคุณ หรือเจ้าของงาน');

    await this.prisma.designComment.delete({ where: { id } });

    return { id, deleted: true };
  }
}

@ApiTags('comments')
@Controller('designs/:designId/comments')
export class DesignCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'ความคิดเห็นทั้งหมดของงาน (เก่าสุดก่อน)' })
  @ApiEnvelopeList(CommentDto)
  list(@CurrentUser() user: CoreHubUser, @Param('designId', UUID) designId: string, @Query() query: PaginationQuery) {
    return this.comments.list(user.coreUserId, designId, query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'เพิ่มความคิดเห็นหรือตอบกลับ' })
  @ApiEnvelope(CommentDto, { status: 201 })
  create(@CurrentUser() user: CoreHubUser, @Param('designId', UUID) designId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(user.coreUserId, designId, dto);
  }
}

@ApiTags('comments')
@Controller('design-comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'แก้ข้อความ · ทำเครื่องหมายว่าแก้ไขแล้ว · กดอีโมจิ' })
  @ApiEnvelope(CommentDto)
  update(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string, @Body() dto: UpdateCommentDto) {
    return this.comments.update(user.coreUserId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบความคิดเห็น (ผู้เขียนหรือเจ้าของงาน) — การตอบกลับถูกลบตาม' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.comments.remove(user.coreUserId, id);
  }
}
