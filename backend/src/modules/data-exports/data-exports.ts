import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiProperty, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope } from '../../common/http/api-envelope.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toDto as assetToDto } from '../assets/assets.service.js';

export class DataExportDto {
  @ApiProperty() exportedAt!: string;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) designs!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) folders!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) assets!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) templates!: unknown[];
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) preferences!: unknown;
}

/// ข้อมูลทั้งหมดที่ CS Canvas เก็บเกี่ยวกับผู้ใช้ปัจจุบัน (สิทธิ์ขอดูข้อมูลของตัวเอง)
@Injectable()
export class DataExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(coreUserId: string) {
    const [designs, folders, assets, templates, preferences] = await Promise.all([
      this.prisma.design.findMany({ where: { coreUserId, purgedAt: null }, omit: { thumbnail: true } }),
      this.prisma.folder.findMany({ where: { coreUserId } }),
      this.prisma.asset.findMany({ where: { coreUserId } }),
      this.prisma.template.findMany({
        where: { createdByCoreUserId: coreUserId },
        omit: { thumbnail: true },
      }),
      this.prisma.preference.findUnique({ where: { coreUserId }, omit: { id: true } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      designs,
      folders,
      assets: assets.map(assetToDto),
      templates,
      preferences,
    };
  }
}

@ApiTags('data-exports')
@Controller('data-exports')
export class DataExportsController {
  constructor(private readonly exportsService: DataExportsService) {}

  @Get()
  @ApiOperation({ summary: 'ดาวน์โหลดข้อมูลทั้งหมดของฉันเป็น JSON' })
  @ApiEnvelope(DataExportDto)
  get(@CurrentUser() user: CoreHubUser) {
    return this.exportsService.build(user.coreUserId);
  }
}

@Module({ controllers: [DataExportsController], providers: [DataExportsService] })
export class DataExportsModule {}
