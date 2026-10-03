import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../../common/http/pagination.dto.js';
import { BooleanQuery, TrimQuery } from '../../../common/http/query-transforms.js';

/// ขนาดผืนผ้าใบที่รับได้ (พิกเซล) — กว้างพอสำหรับโปสเตอร์ A2 ที่ 150 dpi
export const MIN_CANVAS_PX = 16;
export const MAX_CANVAS_PX = 8000;

/// key ประเภทงานเป็นตัวพิมพ์เล็กคั่นด้วยขีด เช่น `presentation`, `report-cover`
export const DESIGN_TYPE_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

/// ภาพย่อเป็น data URL ของ JPEG/PNG เท่านั้น (สร้างจากผืนผ้าใบฝั่ง client)
export const THUMBNAIL_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_THUMBNAIL_CHARS = 280_000;

export const EDITED_WITHIN = ['day', 'week', 'month', 'year'] as const;
export const DESIGN_SORTS = ['updated', 'created', 'title'] as const;

export class ListDesignsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'ค้นจากชื่องาน', example: 'โปสเตอร์' })
  @IsOptional()
  @TrimQuery()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'poster' })
  @IsOptional()
  @Matches(DESIGN_TYPE_PATTERN, { message: 'designType ไม่ถูกต้อง' })
  designType?: string;

  @ApiPropertyOptional({ example: 'poster,flyer', description: 'หลายประเภทคั่นด้วยจุลภาค (ตัวกรองหมวดหมู่ในหน้าโปรเจกต์)' })
  @IsOptional()
  @Matches(/^[a-z][a-z0-9-]{1,39}(,[a-z][a-z0-9-]{1,39}){0,29}$/, { message: 'designTypes ต้องเป็นรายการ key คั่นด้วยจุลภาค' })
  designTypes?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'folderId ต้องเป็น UUID v4' })
  folderId?: string;

  @ApiPropertyOptional({ description: 'true = งานในถังขยะ', default: false })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'trashed ต้องเป็น true หรือ false' })
  trashed?: boolean;

  @ApiPropertyOptional({ enum: EDITED_WITHIN, description: 'แก้ไขล่าสุดภายในช่วงนี้' })
  @IsOptional()
  @IsIn(EDITED_WITHIN, { message: 'editedWithin ต้องเป็น day, week, month หรือ year' })
  editedWithin?: (typeof EDITED_WITHIN)[number];

  @ApiPropertyOptional({ enum: DESIGN_SORTS, default: 'updated' })
  @IsOptional()
  @IsIn(DESIGN_SORTS, { message: 'sort ต้องเป็น updated, created หรือ title' })
  sort?: (typeof DESIGN_SORTS)[number];
}

export class CreateDesignDto {
  @ApiProperty({ example: 'โปสเตอร์งานสัปดาห์วิทยาศาสตร์' })
  @IsString()
  @MinLength(1, { message: 'กรุณาตั้งชื่องาน' })
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ example: 'poster', description: 'ไม่ต้องส่งถ้าสร้างจากเทมเพลต' })
  @ValidateIf((dto: CreateDesignDto) => !dto.templateId)
  @Matches(DESIGN_TYPE_PATTERN, { message: 'designType ไม่ถูกต้อง' })
  designType?: string;

  @ApiPropertyOptional({ example: 1080 })
  @ValidateIf((dto: CreateDesignDto) => !dto.templateId)
  @IsInt()
  @Min(MIN_CANVAS_PX)
  @Max(MAX_CANVAS_PX)
  width?: number;

  @ApiPropertyOptional({ example: 1350 })
  @ValidateIf((dto: CreateDesignDto) => !dto.templateId)
  @IsInt()
  @Min(MIN_CANVAS_PX)
  @Max(MAX_CANVAS_PX)
  height?: number;

  @ApiPropertyOptional({ description: 'JSON state ของผืนผ้าใบ · ไม่ส่ง = หน้าเปล่า' })
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  @ApiPropertyOptional({ format: 'uuid', description: 'สร้างเป็นสำเนาของเทมเพลตนี้' })
  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ทำสำเนาจากงานของตัวเอง' })
  @IsOptional()
  @IsUUID('4')
  copyFromDesignId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  folderId?: string;
}

export class UpdateDesignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'ชื่องานต้องไม่ว่าง' })
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ description: 'JSON state ของผืนผ้าใบทั้งก้อน' })
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(MIN_CANVAS_PX)
  @Max(MAX_CANVAS_PX)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(MIN_CANVAS_PX)
  @Max(MAX_CANVAS_PX)
  height?: number;

  @ApiPropertyOptional({ description: 'data URL ของภาพย่อ' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_THUMBNAIL_CHARS, { message: 'ภาพย่อใหญ่เกินไป' })
  @Matches(THUMBNAIL_PATTERN, { message: 'ภาพย่อต้องเป็น data URL ของรูป' })
  thumbnail?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = เอาออกจากโฟลเดอร์' })
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsUUID('4')
  folderId?: string | null;

  @ApiPropertyOptional({ description: 'true = ย้ายไปถังขยะ · false = กู้คืน' })
  @IsOptional()
  @IsBoolean()
  trashed?: boolean;
}

export class DesignSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ example: 'poster' }) designType!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiPropertyOptional({ nullable: true }) thumbnail!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) folderId!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) sourceTemplateId!: string | null;
  @ApiPropertyOptional({ nullable: true }) trashedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class DesignDto extends DesignSummaryDto {
  @ApiProperty({ description: 'JSON state ของผืนผ้าใบ', type: 'object', additionalProperties: true })
  document!: Record<string, unknown>;
}

export class DeletedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: true }) deleted!: boolean;
}

export class DesignTypeUsageDto {
  @ApiProperty({ example: 'presentation' }) designType!: string;
  @ApiProperty({ example: 4 }) count!: number;
  @ApiProperty() lastUsedAt!: string;
}
