import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQuery } from '../../../common/http/pagination.dto.js';
import { BooleanQuery } from '../../../common/http/query-transforms.js';

export class ListAssetsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'true = รูปในถังขยะ' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'trashed ต้องเป็น true หรือ false' })
  trashed?: boolean;
}

export class UpdateAssetDto {
  @ApiProperty({ description: 'true = ย้ายไปถังขยะ · false = กู้คืน' })
  @IsBoolean()
  trashed!: boolean;
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
