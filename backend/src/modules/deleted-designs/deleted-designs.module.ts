import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';
import { ADMIN_CORE_ROLES, CoreRoles } from '../../common/auth/core-roles.decorator.js';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeError, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { TrimQuery } from '../../common/http/query-transforms.js';
import { DeletedDto } from '../designs/dto/design.dto.js';
import { DeletedDesignsService } from './deleted-designs.service.js';
import { RetentionService } from './retention.service.js';

export class ListDeletedDesignsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'ค้นจากชื่องาน หรือ coreUserId ของเจ้าของ (ตรงทั้งคำ)' })
  @IsOptional()
  @TrimQuery()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class RestoreDeletedDesignDto {
  @ApiProperty({ example: true, description: 'true = กู้กลับไปไว้ในถังขยะของเจ้าของ' })
  @Equals(true, { message: 'restore ต้องเป็น true' })
  restore!: boolean;
}

export class DeletedDesignDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() designType!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiPropertyOptional({ nullable: true }) thumbnail!: string | null;
  @ApiProperty() pageCount!: number;
  @ApiProperty() ownerCoreUserId!: string;
  @ApiPropertyOptional({ nullable: true }) trashedAt!: string | null;
  @ApiProperty({ description: 'เวลาที่เจ้าของลบถาวร' }) deletedAt!: string;
  @ApiProperty({ description: 'ระบบจะลบจริงหลังเวลานี้' }) purgeAt!: string;
  @ApiProperty() daysLeft!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class DeletedDesignDetailDto extends DeletedDesignDto {
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'JSON state ของงาน (ดูอย่างเดียว)' })
  document!: Record<string, unknown>;
}

export class RestoredDesignDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() ownerCoreUserId!: string;
  @ApiProperty({ description: 'เริ่มนับ 30 วันของถังขยะใหม่จากเวลานี้' }) trashedAt!: string;
}

const UUID = new ParseUUIDPipe({ version: '4' });

/// แผงผู้ดูแล → งานที่ถูกลบ (เจ้าหน้าที่และผู้ดูแลระบบเท่านั้น)
@ApiTags('deleted-designs')
@Controller('deleted-designs')
@CoreRoles(...ADMIN_CORE_ROLES)
export class DeletedDesignsController {
  constructor(private readonly deleted: DeletedDesignsService) {}

  @Get()
  @ApiOperation({ summary: 'งานที่เจ้าของลบถาวรแล้ว ยังอยู่ในช่วงเก็บ 30 วัน' })
  @ApiEnvelopeList(DeletedDesignDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  list(@Query() query: ListDeletedDesignsQuery) {
    return this.deleted.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'งานที่ถูกลบหนึ่งชิ้นพร้อม JSON state (ดูอย่างเดียว)' })
  @ApiEnvelope(DeletedDesignDetailDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  get(@Param('id', UUID) id: string) {
    return this.deleted.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'กู้คืนกลับไปไว้ในถังขยะของเจ้าของ และแจ้งเจ้าของ' })
  @ApiEnvelope(RestoredDesignDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  restore(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string, @Body() _dto: RestoreDeletedDesignDto) {
    return this.deleted.restore(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบจริงทันที (ไม่รอครบ 30 วัน)' })
  @ApiEnvelope(DeletedDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.deleted.purgeNow(user, id);
  }
}

@Module({ controllers: [DeletedDesignsController], providers: [DeletedDesignsService, RetentionService] })
export class DeletedDesignsModule {}
