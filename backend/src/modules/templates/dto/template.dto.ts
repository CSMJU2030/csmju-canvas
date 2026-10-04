import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsUUID,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../../../common/http/pagination.dto.js';
import { BooleanQuery, TrimQuery } from '../../../common/http/query-transforms.js';
import {
  DESIGN_TYPE_PATTERN,
  MAX_CANVAS_PX,
  MAX_THUMBNAIL_CHARS,
  MIN_CANVAS_PX,
  THUMBNAIL_PATTERN,
} from '../../designs/dto/design.dto.js';

export const TEMPLATE_SORTS = ['popular', 'recent'] as const;
export const TEMPLATE_OWNERS = ['me', 'others'] as const;
const COLOR_LIST = /^(gray|blue|sky|teal|green|lime|yellow|orange|red|pink|purple|white|black)(,(gray|blue|sky|teal|green|lime|yellow|orange|red|pink|purple|white|black)){0,12}$/;

export class ListTemplatesQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: 'เกียรติบัตร' })
  @IsOptional()
  @TrimQuery()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'certificate' })
  @IsOptional()
  @Matches(DESIGN_TYPE_PATTERN, { message: 'designType ไม่ถูกต้อง' })
  designType?: string;

  @ApiPropertyOptional({ example: 'education' })
  @IsOptional()
  @Matches(DESIGN_TYPE_PATTERN, { message: 'category ไม่ถูกต้อง' })
  category?: string;

  @ApiPropertyOptional({ enum: TEMPLATE_OWNERS, description: 'me = ที่ฉันเผยแพร่ · others = ของคนอื่น' })
  @IsOptional()
  @IsIn(TEMPLATE_OWNERS, { message: 'owner ต้องเป็น me หรือ others' })
  owner?: (typeof TEMPLATE_OWNERS)[number];

  @ApiPropertyOptional({ enum: TEMPLATE_SORTS, default: 'popular' })
  @IsOptional()
  @IsIn(TEMPLATE_SORTS, { message: 'sort ต้องเป็น popular หรือ recent' })
  sort?: (typeof TEMPLATE_SORTS)[number];

  @ApiPropertyOptional({ description: 'true = เฉพาะที่ฉันติดดาวไว้' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'starred ต้องเป็น true หรือ false' })
  starred?: boolean;

  @ApiPropertyOptional({ description: 'true = เฉพาะเทมเพลตตั้งต้นของทีม CS Canvas' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'builtIn ต้องเป็น true หรือ false' })
  builtIn?: boolean;

  @ApiPropertyOptional({ example: 'blue,yellow', description: 'กลุ่มสีคั่นด้วยจุลภาค — เทมเพลตที่มีสีใดสีหนึ่งในรายการ' })
  @IsOptional()
  @Matches(COLOR_LIST, { message: 'colors ต้องเป็นชื่อกลุ่มสีคั่นด้วยจุลภาค' })
  colors?: string;

  @ApiPropertyOptional({ enum: ['th', 'en'], description: 'ภาษาของข้อความในเทมเพลต' })
  @IsOptional()
  @IsIn(['th', 'en'], { message: 'language ต้องเป็น th หรือ en' })
  language?: 'th' | 'en';
}

export class CreateFavoriteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'templateId ต้องเป็น UUID v4' })
  templateId!: string;
}

export class FavoriteDto {
  @ApiProperty({ format: 'uuid' }) templateId!: string;
  @ApiProperty() createdAt!: string;
}

export class CreateTemplateDto {
  @ApiProperty({ example: 'เกียรติบัตรงานแข่งขันโปรแกรม' })
  @IsString()
  @MinLength(1, { message: 'กรุณาตั้งชื่อเทมเพลต' })
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ example: 'แก้ชื่อผู้รับและวันที่ได้ทันที' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ example: 'certificate' })
  @Matches(DESIGN_TYPE_PATTERN, { message: 'designType ไม่ถูกต้อง' })
  designType!: string;

  @ApiProperty({ example: 'education' })
  @Matches(DESIGN_TYPE_PATTERN, { message: 'category ไม่ถูกต้อง' })
  category!: string;

  @ApiProperty({ example: 1754 })
  @IsInt()
  @Min(MIN_CANVAS_PX)
  @Max(MAX_CANVAS_PX)
  width!: number;

  @ApiProperty({ example: 1240 })
  @IsInt()
  @Min(MIN_CANVAS_PX)
  @Max(MAX_CANVAS_PX)
  height!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  document!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_THUMBNAIL_CHARS)
  @Matches(THUMBNAIL_PATTERN, { message: 'ภาพย่อต้องเป็น data URL ของรูป' })
  thumbnail?: string;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DESIGN_TYPE_PATTERN, { message: 'category ไม่ถูกต้อง' })
  category?: string;
}

export class TemplateSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() designType!: string;
  @ApiProperty() category!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiPropertyOptional({ nullable: true }) thumbnail!: string | null;
  @ApiProperty() usageCount!: number;
  @ApiProperty({ description: 'true = เทมเพลตตั้งต้นของทีม CS Canvas' }) isBuiltIn!: boolean;
  @ApiProperty({ description: 'ผู้เรียกเป็นคนเผยแพร่เอง' }) isMine!: boolean;
  @ApiProperty({ description: 'ผู้เรียกติดดาวไว้' }) isStarred!: boolean;
  @ApiProperty({ description: 'จำนวนหน้าในเทมเพลต', example: 3 }) pageCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class TemplateDto extends TemplateSummaryDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  document!: Record<string, unknown>;
}
