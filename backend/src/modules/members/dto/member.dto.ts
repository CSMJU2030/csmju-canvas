import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../../common/http/pagination.dto.js';
import { TrimQuery } from '../../../common/http/query-transforms.js';
import { MAX_QUOTA_BYTES, QUOTA_BYTES_PER_USER } from '../../assets/assets.service.js';

/// ค่า `sub` ของ Core Hub — ตัวอักษร ตัวเลข และ . _ @ : - (กัน path แปลก ๆ ใน URL)
export const CORE_USER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@:-]{0,99}$/;

/// สมาชิกที่ใช้พื้นที่ถึงสัดส่วนนี้ถือว่า "ใกล้เต็ม" (ไฮไลต์ในแผงผู้ดูแล)
export const NEAR_QUOTA_RATIO = 0.9;

export const MEMBER_SORTS = ['recent', 'usage'] as const;

export class ListMembersQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'ค้นจาก coreUserId บางส่วน', example: 'user-00' })
  @IsOptional()
  @TrimQuery()
  @IsString()
  @Length(0, 100)
  q?: string;

  @ApiPropertyOptional({
    enum: MEMBER_SORTS,
    default: 'recent',
    description: 'recent = เข้าใช้ล่าสุดก่อน · usage = ใช้พื้นที่ใกล้เต็มก่อน (สัดส่วนต่อโควตา)',
  })
  @IsOptional()
  @IsIn(MEMBER_SORTS, { message: 'sort ต้องเป็น recent หรือ usage' })
  sort?: (typeof MEMBER_SORTS)[number];
}

export class MemberParam {
  @ApiProperty({ example: 'user-002', description: 'ค่า sub จาก token ของ Core Hub' })
  @IsString()
  @Matches(CORE_USER_ID_PATTERN, { message: 'รูปแบบ coreUserId ไม่ถูกต้อง' })
  coreUserId!: string;
}

export class UpdateMemberQuotaDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 1073741824,
    description: `โควตาใหม่เป็นไบต์ สูงสุด ${MAX_QUOTA_BYTES} (5 GB) · null = กลับไปใช้ค่าเริ่มต้น ${QUOTA_BYTES_PER_USER} (500 MB)`,
  })
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: 'storageQuotaBytes ต้องเป็นจำนวนเต็ม (ไบต์) หรือ null' })
  @Min(1024 * 1024, { message: 'โควตาต้องไม่น้อยกว่า 1 MB' })
  @Max(MAX_QUOTA_BYTES, { message: 'โควตาสูงสุดที่ตั้งได้คือ 5 GB' })
  storageQuotaBytes!: number | null;

  @ApiPropertyOptional({ example: 'อาจารย์ขอพื้นที่เพิ่มสำหรับสื่อการสอน', description: 'เหตุผล เก็บลง audit log' })
  @IsOptional()
  @IsString()
  @Length(0, 300)
  reason?: string;
}

export class MemberDto {
  @ApiProperty({ example: 'user-002' }) coreUserId!: string;

  @ApiProperty({ example: '48120040', description: 'ไบต์ที่ใช้ไป (รวมไฟล์ในถังขยะ) เป็น string' }) storageUsedBytes!: string;
  @ApiProperty({ example: '524288000', description: 'โควตาที่ใช้จริงเป็น string' }) storageQuotaBytes!: string;
  @ApiProperty({ description: 'true = ผู้ดูแลตั้งโควตาให้เอง · false = ค่าเริ่มต้น' }) quotaOverridden!: boolean;
  @ApiProperty({ example: 9.2, description: 'ร้อยละของโควตาที่ใช้ไป (ทศนิยม 1 ตำแหน่ง)' }) usagePercent!: number;
  @ApiProperty({ description: 'ดีไซน์ที่ยังไม่อยู่ในถังขยะ' }) designCount!: number;
  @ApiProperty() assetCount!: number;
  @ApiProperty({ nullable: true, type: String }) lastSeenAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class MyMembershipDto {
  @ApiProperty({ example: 'user-002' }) coreUserId!: string;
  @ApiProperty({ example: 'student', description: 'จาก token ที่ตรวจแล้ว' }) coreRole!: string;
  @ApiProperty({ example: '48120040' }) storageUsedBytes!: string;
  @ApiProperty({ example: '524288000' }) storageQuotaBytes!: string;
  @ApiProperty({ example: 9.2 }) usagePercent!: number;
  @ApiProperty() lastSeenAt!: string;
}

export function usagePercent(used: number, quota: number): number {
  return quota > 0 ? Math.round((used / quota) * 1000) / 10 : 0;
}
