import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { ReportReason, ReportStatus, ReportTargetKind } from '../../generated/prisma/enums.js';

export const REPORT_TARGET_KINDS = Object.values(ReportTargetKind);
export const REPORT_REASONS = Object.values(ReportReason);
export const REPORT_STATUSES = Object.values(ReportStatus);
export const REPORT_DECISIONS = ['RESOLVED', 'REJECTED'] as const;
export const REPORT_ACTIONS = ['HIDE_TARGET'] as const;

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TARGET_KINDS, description: 'DESIGN = งานที่แชร์ · TEMPLATE = เทมเพลต · COMMENT = ความคิดเห็น · OTHER = เรื่องอื่นในระบบ' })
  @IsEnum(ReportTargetKind, { message: 'targetKind ต้องเป็น DESIGN, TEMPLATE, COMMENT หรือ OTHER' })
  targetKind!: ReportTargetKind;

  @ApiPropertyOptional({ format: 'uuid', description: 'id ของงาน เทมเพลต หรือความคิดเห็น (ไม่ส่งเมื่อ targetKind = OTHER)' })
  @ValidateIf((dto: CreateReportDto) => dto.targetKind !== 'OTHER' || dto.targetId !== undefined)
  @IsUUID('4', { message: 'targetId ต้องเป็น UUID v4' })
  targetId?: string;

  @ApiProperty({ enum: REPORT_REASONS, description: 'COPYRIGHT ละเมิดลิขสิทธิ์ · INAPPROPRIATE ไม่เหมาะสม · SPAM สแปม · PERSONAL_DATA ข้อมูลส่วนบุคคล · OTHER อื่น ๆ' })
  @IsEnum(ReportReason, { message: 'reason ต้องเป็น COPYRIGHT, INAPPROPRIATE, SPAM, PERSONAL_DATA หรือ OTHER' })
  reason!: ReportReason;

  @ApiPropertyOptional({ example: 'ภาพในเทมเพลตนี้นำมาจากเพจอื่นโดยไม่ได้รับอนุญาต', description: 'รายละเอียด (บังคับอย่างน้อย 5 ตัวอักษรเมื่อเลือก "อื่น ๆ")' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;

  @ApiPropertyOptional({ example: '/templates', description: 'หน้าที่เกี่ยวข้อง (path ภายในระบบ) — ใช้กับ OTHER' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/(?!\/)/, { message: 'link ต้องเป็น path ภายในระบบ เช่น /templates' })
  link?: string;
}

export class ListReportsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: REPORT_STATUSES, description: 'ไม่ส่ง = ทุกสถานะ' })
  @IsOptional()
  @IsEnum(ReportStatus, { message: 'status ต้องเป็น OPEN, RESOLVED หรือ REJECTED' })
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: REPORT_TARGET_KINDS })
  @IsOptional()
  @IsEnum(ReportTargetKind, { message: 'targetKind ต้องเป็น DESIGN, TEMPLATE, COMMENT หรือ OTHER' })
  targetKind?: ReportTargetKind;
}

export class UpdateReportDto {
  @ApiProperty({ enum: REPORT_DECISIONS, description: 'RESOLVED = จัดการแล้ว · REJECTED = พิจารณาแล้วไม่เข้าข่าย (ปัดตก)' })
  @IsIn(REPORT_DECISIONS, { message: 'status ต้องเป็น RESOLVED หรือ REJECTED' })
  status!: (typeof REPORT_DECISIONS)[number];

  @ApiPropertyOptional({ description: 'บันทึกของผู้ดูแล (เก็บกับเรื่องและใน audit log)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    enum: REPORT_ACTIONS,
    description: 'HIDE_TARGET = ซ่อนเทมเพลต · ปิดลิงก์แชร์ของงาน · ลบความคิดเห็น (ใช้ได้กับ RESOLVED เท่านั้น)',
  })
  @IsOptional()
  @IsIn(REPORT_ACTIONS, { message: 'action ต้องเป็น HIDE_TARGET' })
  action?: (typeof REPORT_ACTIONS)[number];
}

/// ภาพของสิ่งที่ถูกรายงาน ณ ตอนนี้ (อ่านสดจากฐาน) — ผู้ดูแลเห็นโดยไม่ต้องเปิดงานของคนอื่น
export class ReportTargetDto {
  @ApiProperty({ description: 'ยังมีอยู่ในระบบ (งานที่เจ้าของลบถาวรแล้วนับว่าไม่มี)' }) exists!: boolean;
  @ApiProperty({ description: 'ถูกซ่อนแล้ว: เทมเพลตถูกซ่อน · งานปิดลิงก์แชร์' }) hidden!: boolean;
  @ApiPropertyOptional({ nullable: true }) title!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'ภาพย่อ (data URL) ของงานหรือเทมเพลต' }) thumbnail!: string | null;
  @ApiPropertyOptional({ nullable: true }) designType!: string | null;
  @ApiPropertyOptional({ nullable: true }) width!: number | null;
  @ApiPropertyOptional({ nullable: true }) height!: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'ข้อความของความคิดเห็น' }) body!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'เจ้าของงาน/ผู้เผยแพร่/ผู้เขียน' }) ownerCoreUserId!: string | null;
}

export class ReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: REPORT_TARGET_KINDS }) targetKind!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) targetId!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'ชื่อหรือข้อความของสิ่งที่ถูกรายงาน ณ ตอนแจ้ง' }) targetExcerpt!: string | null;
  @ApiPropertyOptional({ nullable: true }) link!: string | null;
  @ApiProperty({ enum: REPORT_REASONS }) reason!: string;
  @ApiProperty() details!: string;
  @ApiProperty({ enum: REPORT_STATUSES }) status!: string;
  @ApiProperty({ description: 'ผู้รายงาน — ผู้ดูแลเห็นได้ เพื่อตามการรายงานเท็จซ้ำ ๆ' }) reporterCoreUserId!: string;
  @ApiPropertyOptional({ nullable: true }) resolvedByCoreUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) resolutionNote!: string | null;
  @ApiPropertyOptional({ enum: REPORT_ACTIONS, nullable: true }) actionTaken!: string | null;
  @ApiPropertyOptional({ nullable: true }) resolvedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ type: ReportTargetDto, nullable: true, description: 'null เมื่อ targetKind = OTHER' }) target!: ReportTargetDto | null;
}

/// สิ่งที่ผู้รายงานได้กลับ — ไม่มีข้อมูลของคนอื่น
export class CreatedReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: REPORT_TARGET_KINDS }) targetKind!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) targetId!: string | null;
  @ApiProperty({ enum: REPORT_REASONS }) reason!: string;
  @ApiProperty({ enum: REPORT_STATUSES }) status!: string;
  @ApiProperty() createdAt!: string;
}
