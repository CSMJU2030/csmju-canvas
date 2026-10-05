import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { ACTIVITY_METRICS, ACTIVITY_RANGES, type ActivityMetric, type ActivityRange } from '../activity-series.js';

export class NearQuotaMemberDto {
  @ApiProperty({ example: 'user-002' }) coreUserId!: string;
  @ApiProperty({ example: '497025024' }) storageUsedBytes!: string;
  @ApiProperty({ example: '524288000' }) storageQuotaBytes!: string;
  @ApiProperty({ example: 94.8 }) usagePercent!: number;
}

export class AdminOverviewDto {
  @ApiProperty({ example: 'csmju-canvas' }) subsystem!: string;
  @ApiProperty({ description: 'สมาชิกทั้งหมด (คนที่เคยเปิดแอป หรือมีงาน/ไฟล์ในระบบ)' }) memberCount!: number;
  @ApiProperty({ description: 'สมาชิกที่เปิดแอปใน 7 วันที่ผ่านมา' }) activeMemberCount7d!: number;
  @ApiProperty({ description: 'ดีไซน์ที่ยังไม่อยู่ในถังขยะ' }) designCount!: number;
  @ApiProperty() trashedDesignCount!: number;
  @ApiProperty({ description: 'ดีไซน์ที่ผู้ใช้ลบถาวรแล้ว เก็บไว้ให้ผู้ดูแล 30 วันก่อนลบจริง' }) deletedDesignCount!: number;
  @ApiProperty({ description: 'เทมเพลตทั้งหมด (รวมเทมเพลตตั้งต้นของทีม)' }) templateCount!: number;
  @ApiProperty({ description: 'เทมเพลตที่ผู้ใช้เผยแพร่เอง' }) userTemplateCount!: number;
  @ApiProperty() assetCount!: number;
  @ApiProperty({ example: '734003200', description: 'ไบต์รวมของไฟล์ทั้งหมด เป็น string' }) storageUsedBytes!: string;
  @ApiProperty() commentCount!: number;
  @ApiProperty({ description: 'เรื่องร้องเรียนที่ยังไม่ได้จัดการ (สถานะ OPEN)' }) openReportCount!: number;
  @ApiProperty({ description: 'สมาชิกที่ใช้พื้นที่ถึง 90% ของโควตา' }) nearQuotaMemberCount!: number;
  @ApiProperty({ type: [NearQuotaMemberDto], description: 'สูงสุด 5 คนที่ใกล้เต็มที่สุด' }) nearQuotaMembers!: NearQuotaMemberDto[];
  @ApiProperty({ example: '524288000' }) defaultQuotaBytes!: string;
  @ApiProperty() generatedAt!: string;
}

export class AdminActivityQuery {
  @ApiPropertyOptional({ enum: ACTIVITY_RANGES, default: 7, description: 'ช่วงเวลา (วัน)' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(ACTIVITY_RANGES, { message: 'days ต้องเป็น 7, 30 หรือ 90' })
  days: ActivityRange = 7;
}

export class ActivityPointDto {
  @ApiProperty({ example: '2026-10-06', description: 'วันตามเวลาไทย' }) date!: string;
  @ApiProperty({ description: 'ดีไซน์ที่สร้างใหม่' }) designsCreated!: number;
  @ApiProperty({ description: 'ดีไซน์ (ไม่ซ้ำ) ที่มีการแก้ไข' }) designsEdited!: number;
  @ApiProperty({ description: 'ไฟล์ที่อัปโหลด' }) uploads!: number;
  @ApiProperty({ description: 'เทมเพลตที่ผู้ใช้เผยแพร่' }) templatesPublished!: number;
  @ApiProperty({ description: 'ความคิดเห็นบนงาน' }) comments!: number;
  @ApiProperty({ description: 'ผู้ใช้ (ไม่ซ้ำ) ที่มีความเคลื่อนไหว' }) activeMembers!: number;
}

export class ActivityTrendDto {
  @ApiProperty({ enum: ACTIVITY_METRICS }) metric!: ActivityMetric;
  @ApiProperty({ description: 'ยอดรวมช่วงนี้ (activeMembers = คนไม่ซ้ำทั้งช่วง)' }) current!: number;
  @ApiProperty({ description: 'ยอดรวมช่วงก่อนหน้าที่ยาวเท่ากัน' }) previous!: number;
  @ApiProperty({ nullable: true, type: Number, description: 'ร้อยละที่เปลี่ยน · null เมื่อช่วงก่อนเป็นศูนย์' }) changePercent!: number | null;
  @ApiProperty({ enum: ['UP', 'DOWN', 'FLAT'] }) direction!: 'UP' | 'DOWN' | 'FLAT';
}

export class AdminActivityDto {
  @ApiProperty({ enum: ACTIVITY_RANGES }) days!: number;
  @ApiProperty({ example: 'Asia/Bangkok' }) timeZone!: string;
  @ApiProperty({ example: '2026-09-30' }) from!: string;
  @ApiProperty({ example: '2026-10-06' }) to!: string;
  @ApiProperty({ type: [ActivityPointDto] }) series!: ActivityPointDto[];
  @ApiProperty({ type: [ActivityTrendDto] }) trends!: ActivityTrendDto[];
}
