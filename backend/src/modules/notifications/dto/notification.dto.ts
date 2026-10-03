import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQuery } from '../../../common/http/pagination.dto.js';
import { BooleanQuery } from '../../../common/http/query-transforms.js';

export class ListNotificationsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'true = เฉพาะที่ยังไม่อ่าน' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean({ message: 'unread ต้องเป็น true หรือ false' })
  unread?: boolean;
}

export class UpdateNotificationDto {
  @ApiProperty({ description: 'true = อ่านแล้ว · false = ทำเป็นยังไม่อ่าน' })
  @IsBoolean()
  read!: boolean;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['DESIGN_TRASHED', 'TEMPLATE_USED'] }) kind!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) link!: string | null;
  @ApiPropertyOptional({ nullable: true }) readAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class BulkUpdateResultDto {
  @ApiProperty({ example: 3 }) updated!: number;
}
