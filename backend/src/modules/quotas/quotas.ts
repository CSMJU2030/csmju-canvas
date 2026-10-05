import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiProperty, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope } from '../../common/http/api-envelope.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AssetsModule } from '../assets/assets.module.js';
import { AssetsService, QUOTA_BYTES_PER_USER } from '../assets/assets.service.js';

export class QuotaDto {
  @ApiProperty({ description: 'ไบต์ที่ใช้ไป (รูปทั้งหมดรวมถังขยะ)' }) usedBytes!: number;
  @ApiProperty({ example: QUOTA_BYTES_PER_USER, description: 'โควตาของฉัน — ค่าเริ่มต้น หรือค่าที่ผู้ดูแลระบบปรับให้' }) quotaBytes!: number;
  @ApiProperty() assetCount!: number;
  @ApiProperty({ description: 'งานที่ยังไม่อยู่ในถังขยะ' }) designCount!: number;
  @ApiProperty() trashedDesignCount!: number;
}

@Injectable()
export class QuotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
  ) {}

  async get(coreUserId: string) {
    const [usedBytes, quotaBytes, assetCount, designCount, trashedDesignCount] = await Promise.all([
      this.assets.usedBytes(coreUserId),
      this.assets.quotaBytes(coreUserId),
      this.prisma.asset.count({ where: { coreUserId } }),
      this.prisma.design.count({ where: { coreUserId, trashedAt: null } }),
      this.prisma.design.count({ where: { coreUserId, trashedAt: { not: null } } }),
    ]);

    return { usedBytes, quotaBytes, assetCount, designCount, trashedDesignCount };
  }
}

/// พื้นที่ใช้งานคงเหลือของผู้ใช้ปัจจุบัน (แทนแบนเนอร์ "ทดลองใช้ฟรี" ในบรีฟ)
@ApiTags('quotas')
@Controller('quotas')
export class QuotasController {
  constructor(private readonly quotas: QuotasService) {}

  @Get()
  @ApiOperation({ summary: 'พื้นที่เก็บไฟล์ของฉัน' })
  @ApiEnvelope(QuotaDto)
  get(@CurrentUser() user: CoreHubUser) {
    return this.quotas.get(user.coreUserId);
  }
}

@Module({ imports: [AssetsModule], controllers: [QuotasController], providers: [QuotasService] })
export class QuotasModule {}
