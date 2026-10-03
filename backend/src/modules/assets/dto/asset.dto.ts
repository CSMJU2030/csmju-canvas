import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQuery } from '../../../common/http/pagination.dto.js';
import { BooleanQuery, TrimQuery } from '../../../common/http/query-transforms.js';

export const ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'] as const;
export const ASSET_SORTS = ['created', 'name', 'size'] as const;

export class ListAssetsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'true = รูปในถังขยะ' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'trashed ต้องเป็น true หรือ false' })
  trashed?: boolean;

  @ApiPropertyOptional({ description: 'ค้นจากชื่อไฟล์' })
  @IsOptional()
  @TrimQuery()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ASSET_TYPES })
  @IsOptional()
  @IsIn(ASSET_TYPES, { message: 'mimeType ไม่ถูกต้อง' })
  mimeType?: (typeof ASSET_TYPES)[number];

  @ApiPropertyOptional({ enum: ASSET_SORTS, default: 'created' })
  @IsOptional()
  @IsIn(ASSET_SORTS, { message: 'sort ต้องเป็น created, name หรือ size' })
  sort?: (typeof ASSET_SORTS)[number];
}

export class UpdateAssetDto {
  @ApiPropertyOptional({ description: 'true = ย้ายไปถังขยะ · false = กู้คืน' })
  @IsOptional()
  @IsBoolean()
  trashed?: boolean;

  @ApiPropertyOptional({ description: 'เปลี่ยนชื่อไฟล์' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'ชื่อไฟล์ต้องไม่ว่าง' })
  @MaxLength(200)
  fileName?: string;
}

export class UploadAssetDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'PNG · JPEG · WebP · GIF · SVG ไม่เกิน 10 MB' })
  file!: unknown;
}

export class AssetDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty({ example: 'image/png' }) mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ example: '/api/v1/assets/…/content' }) contentUrl!: string;
  @ApiPropertyOptional({ nullable: true }) trashedAt!: string | null;
  @ApiProperty() createdAt!: string;
}
