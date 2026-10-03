import { Body, Controller, Get, Injectable, Module, Patch } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope } from '../../common/http/api-envelope.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

export class PreferenceDto {
  @ApiProperty({ description: 'ข้อความแนะนำตัวในระบบนี้' }) aboutMe!: string;
  @ApiProperty() reduceMotion!: boolean;
  @ApiProperty() highContrast!: boolean;
  @ApiProperty() largeText!: boolean;
  @ApiProperty() notifyTemplateUsed!: boolean;
  @ApiProperty() notifyTrash!: boolean;
  @ApiProperty() updatedAt!: string;
}

export class UpdatePreferenceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) aboutMe?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reduceMotion?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() highContrast?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() largeText?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyTemplateUsed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyTrash?: boolean;
}

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(coreUserId: string) {
    const row = await this.prisma.preference.upsert({
      where: { coreUserId },
      create: { coreUserId },
      update: {},
    });

    return toDto(row);
  }

  async update(coreUserId: string, dto: UpdatePreferenceDto) {
    const row = await this.prisma.preference.upsert({
      where: { coreUserId },
      create: { coreUserId, ...dto },
      update: dto,
    });

    return toDto(row);
  }
}

function toDto(row: Omit<PreferenceDto, 'updatedAt'> & { updatedAt: Date }) {
  return {
    aboutMe: row.aboutMe,
    reduceMotion: row.reduceMotion,
    highContrast: row.highContrast,
    largeText: row.largeText,
    notifyTemplateUsed: row.notifyTemplateUsed,
    notifyTrash: row.notifyTrash,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/// การตั้งค่าของผู้ใช้ปัจจุบัน — ทรัพยากรเดียวต่อคน จึงไม่มี id ใน path
@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'การตั้งค่าของฉัน (การเข้าถึง · การแจ้งเตือน · เกี่ยวกับฉัน)' })
  @ApiEnvelope(PreferenceDto)
  get(@CurrentUser() user: CoreHubUser) {
    return this.preferences.get(user.coreUserId);
  }

  @Patch()
  @ApiOperation({ summary: 'แก้การตั้งค่าของฉัน' })
  @ApiEnvelope(PreferenceDto)
  update(@CurrentUser() user: CoreHubUser, @Body() dto: UpdatePreferenceDto) {
    return this.preferences.update(user.coreUserId, dto);
  }
}

@Module({ controllers: [PreferencesController], providers: [PreferencesService] })
export class PreferencesModule {}
