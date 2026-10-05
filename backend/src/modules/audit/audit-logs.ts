import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ADMIN_CORE_ROLES, CoreRoles } from '../../common/auth/core-roles.decorator.js';
import { ApiEnvelopeError, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { Paginated } from '../../common/http/envelope.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { TrimQuery } from '../../common/http/query-transforms.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuditLog } from '../../generated/prisma/client.js';

/// ฝั่งอ่านของ audit log (แผงผู้ดูแล → Audit log) — ฝั่งเขียนคือ AuditService ใน audit.ts

export class ListAuditLogsQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: 'member.quota_change', description: 'กรองตามการกระทำ เช่น design.purge, report.resolved' })
  @IsOptional()
  @TrimQuery()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, { message: 'action ต้องเป็นรูปแบบ <สิ่งของ>.<กริยา>' })
  @Length(1, 60)
  action?: string;

  @ApiPropertyOptional({ example: 'user-002', description: 'กรองตามผู้กระทำ (coreUserId หรือ system)' })
  @IsOptional()
  @TrimQuery()
  @IsString()
  @Length(1, 100)
  actorCoreUserId?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00+07:00', description: 'ตั้งแต่เวลานี้ (ISO 8601)' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'since ต้องเป็นวันเวลาแบบ ISO 8601' })
  since?: string;

  @ApiPropertyOptional({ example: '2026-10-06T23:59:59+07:00', description: 'จนถึงเวลานี้ (ISO 8601)' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'until ต้องเป็นวันเวลาแบบ ISO 8601' })
  until?: string;
}

export class AuditLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'user-001' }) actorCoreUserId!: string;
  @ApiProperty({ example: 'staff' }) actorCoreRole!: string;
  @ApiProperty({ example: 'member.quota_change' }) action!: string;
  @ApiProperty({ example: 'MEMBER' }) targetKind!: string;
  @ApiProperty({ nullable: true, type: String, example: 'user-002' }) targetId!: string | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'บริบทตอนเกิดเหตุ (ไม่มีชื่อจริง อีเมล หรือ token)',
  })
  metadata!: unknown;

  @ApiProperty() createdAt!: string;
}

export function toAuditLogDto(row: AuditLog): AuditLogDto {
  return {
    id: row.id,
    actorCoreUserId: row.actorCoreUserId,
    actorCoreRole: row.actorCoreRole,
    action: row.action,
    targetKind: row.targetKind,
    targetId: row.targetId,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQuery): Promise<Paginated<AuditLogDto>> {
    const since = query.since ? new Date(query.since) : undefined;
    const until = query.until ? new Date(query.until) : undefined;

    if (since && until && since > until) {
      throw new BadRequestException('since ต้องมาก่อน until');
    }

    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorCoreUserId ? { actorCoreUserId: query.actorCoreUserId } : {}),
      ...(since || until ? { createdAt: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
      this.prisma.auditLog.count({ where }),
    ]);

    return new Paginated(rows.map(toAuditLogDto), query.meta(total));
  }
}

/// URL เป็น /api/v1/audit-logs ตามกฎคำนามพหูพจน์ (แบบ nexus) ไม่ใช่ /admin/audit-logs
@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly logs: AuditLogsService) {}

  @Get()
  @CoreRoles(...ADMIN_CORE_ROLES)
  @ApiOperation({
    summary: 'อ่าน audit log ของ CS Canvas (ผู้ดูแล)',
    description:
      'ใหม่สุดก่อน · กรองตามการกระทำ ผู้กระทำ และช่วงเวลา · การกระทำที่บันทึก เช่น design.purge, design.restore_by_admin, report.resolved, report.rejected, member.quota_change, template.unpublish',
  })
  @ApiEnvelopeList(AuditLogDto)
  @ApiEnvelopeError(400, 'ตัวกรองไม่ถูกต้อง')
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  list(@Query() query: ListAuditLogsQuery) {
    return this.logs.list(query);
  }
}

@Module({ controllers: [AuditLogsController], providers: [AuditLogsService] })
export class AuditLogsModule {}
