import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../../common/http/pagination.dto.js';
import { BooleanQuery, TrimQuery } from '../../../common/http/query-transforms.js';
import { MAX_SOURCE_URL_LENGTH, SOURCE_SITES, type SourceSite } from '../source-site.js';

export const ASSET_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
] as const;
export const ASSET_KINDS = ['image', 'video', 'audio', 'font'] as const;
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

  @ApiPropertyOptional({ enum: ASSET_KINDS, description: 'เฉพาะรูป วิดีโอ เสียง หรือฟอนต์ที่อัปโหลดเอง (ไม่ใส่ = ทุกชนิด)' })
  @IsOptional()
  @IsIn(ASSET_KINDS, { message: 'kind ต้องเป็น image, video, audio หรือ font' })
  kind?: (typeof ASSET_KINDS)[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'เฉพาะรูปในโฟลเดอร์รูปนี้' })
  @IsOptional()
  @IsUUID('4', { message: 'folderId ต้องเป็น UUID v4' })
  folderId?: string;

  @ApiPropertyOptional({ enum: SOURCE_SITES, description: 'เฉพาะภาพที่นำเข้าจากแหล่งนี้ (unsplash, pexels, … , other)' })
  @IsOptional()
  @IsIn(SOURCE_SITES, { message: `source ต้องเป็นหนึ่งใน ${SOURCE_SITES.join(', ')}` })
  source?: SourceSite;

  @ApiPropertyOptional({ description: 'true = เฉพาะภาพที่นำเข้าจากเว็บอื่น (มีแหล่งที่มา) · false = เฉพาะไฟล์จากเครื่อง' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'imported ต้องเป็น true หรือ false' })
  imported?: boolean;

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

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'ย้ายเข้าโฟลเดอร์รูป · null = เอาออกจากโฟลเดอร์' })
  @IsOptional()
  @ValidateIf((dto: UpdateAssetDto) => dto.folderId !== null)
  @IsUUID('4', { message: 'folderId ต้องเป็น UUID v4 หรือ null' })
  folderId?: string | null;
}

export class UploadAssetDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'รูป PNG · JPEG · WebP · GIF · SVG ไม่เกิน 10 MB · วิดีโอ MP4 · WebM และเสียง MP3 · M4A · OGG · WAV ไม่เกิน 50 MB · ฟอนต์ TTF · OTF · WOFF · WOFF2 ไม่เกิน 5 MB' })
  @IsOptional()
  file!: unknown;

  @ApiPropertyOptional({
    maxLength: MAX_SOURCE_URL_LENGTH,
    description: 'หน้าเว็บหรือลิงก์รูปต้นฉบับ (http/https) เมื่อคัดลอก/ลากรูปมาจากเว็บอื่น · ระบบเก็บเป็นข้อความเท่านั้น ไม่เปิดลิงก์นี้',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SOURCE_URL_LENGTH, { message: `sourceUrl ยาวได้ไม่เกิน ${MAX_SOURCE_URL_LENGTH} ตัวอักษร` })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }, { message: 'sourceUrl ต้องเป็นลิงก์ http หรือ https' })
  sourceUrl?: string;

  @ApiPropertyOptional({ maxLength: 60, example: 'unsplash', description: `แหล่งที่ผู้ใช้เลือกในแผงแหล่งภาพ (${SOURCE_SITES.join(', ')}) · ค่าอื่นเก็บเป็น other` })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'sourceSite ยาวได้ไม่เกิน 60 ตัวอักษร' })
  sourceSite?: string;
}

export class AssetDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty({ example: 'image/png' }) mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ example: '/api/v1/assets/…/content' }) contentUrl!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) folderId!: string | null;
  @ApiPropertyOptional({ nullable: true }) trashedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'หน้าเว็บ/ลิงก์รูปต้นฉบับ (ภาพที่นำเข้าจากเว็บอื่น)' }) sourceUrl!: string | null;
  @ApiPropertyOptional({ enum: SOURCE_SITES, nullable: true, description: 'แหล่งที่มา · null = ไฟล์จากเครื่อง' }) sourceSite!: SourceSite | null;
  @ApiProperty() createdAt!: string;
}
