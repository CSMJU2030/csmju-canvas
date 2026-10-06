import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { Paginated } from '../../common/http/envelope.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { DeletedDto } from '../designs/dto/design.dto.js';

/// ชุดแบรนด์ (Brand Kit): สี ฟอนต์หัวข้อ/เนื้อหา และโลโก้ที่ผู้ใช้ใช้ซ้ำในทุกงาน
///
/// เก็บแค่ค่าที่ผู้ใช้ตั้ง (ไม่มีข้อมูลบุคคล) · โลโก้อ้างถึง asset ของเจ้าของเท่านั้น

export const MAX_BRAND_KITS = 10;
export const MAX_COLORS = 24;
export const MAX_LOGOS = 12;

/// สี CSS ที่หน้าแก้ไขสร้างได้: #rgb/#rrggbb(aa) · rgb()/rgba() · hsl()/hsla()
const CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s/]+\)|hsla?\([0-9.,%\sdeg/]+\))$/;

export class BrandKitBodyDto {
  @ApiProperty({ example: 'สาขาวิทยาการคอมพิวเตอร์' })
  @IsString()
  @MinLength(1, { message: 'กรุณาตั้งชื่อชุดแบรนด์' })
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ type: [String], example: ['rgb(0 76 153)', 'rgb(255 189 89)'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COLORS, { message: `ใส่สีได้ไม่เกิน ${MAX_COLORS} สี` })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @Matches(CSS_COLOR, { each: true, message: 'รูปแบบสีไม่ถูกต้อง' })
  colors?: string[];

  @ApiPropertyOptional({ nullable: true, example: 'Sarabun' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headingFont?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Sarabun' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bodyFont?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LOGOS, { message: `ใส่โลโก้ได้ไม่เกิน ${MAX_LOGOS} ไฟล์` })
  @IsUUID('4', { each: true })
  logoAssetIds?: string[];
}

export class UpdateBrandKitDto extends PartialType(BrandKitBodyDto) {}

export class BrandLogoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ example: '/api/v1/assets/00000000-0000-4000-8000-000000000000/content' }) contentUrl!: string;
}

export class BrandKitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) colors!: string[];
  @ApiProperty({ nullable: true, type: String }) headingFont!: string | null;
  @ApiProperty({ nullable: true, type: String }) bodyFont!: string | null;
  @ApiProperty({ type: [BrandLogoDto] }) logos!: BrandLogoDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

interface BrandKitRow {
  id: string;
  name: string;
  colors: string[];
  headingFont: string | null;
  bodyFont: string | null;
  logoAssetIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class BrandKitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(coreUserId: string, query: PaginationQuery) {
    const where = { coreUserId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.brandKit.findMany({ where, orderBy: { createdAt: 'asc' }, skip: query.skip, take: query.take }),
      this.prisma.brandKit.count({ where }),
    ]);

    return new Paginated(await this.withLogos(coreUserId, rows), query.meta(total));
  }

  async get(coreUserId: string, id: string) {
    return (await this.withLogos(coreUserId, [await this.find(coreUserId, id)]))[0];
  }

  async create(coreUserId: string, dto: BrandKitBodyDto) {
    if ((await this.prisma.brandKit.count({ where: { coreUserId } })) >= MAX_BRAND_KITS) {
      throw new ConflictException(`สร้างชุดแบรนด์ได้ไม่เกิน ${MAX_BRAND_KITS} ชุด`);
    }

    const logoAssetIds = await this.ownedLogos(coreUserId, dto.logoAssetIds ?? []);
    const row = await this.prisma.brandKit.create({
      data: {
        coreUserId,
        name: dto.name.trim(),
        colors: dedupe(dto.colors ?? []),
        headingFont: dto.headingFont?.trim() || null,
        bodyFont: dto.bodyFont?.trim() || null,
        logoAssetIds,
      },
    });

    return (await this.withLogos(coreUserId, [row]))[0];
  }

  async update(coreUserId: string, id: string, dto: UpdateBrandKitDto) {
    await this.find(coreUserId, id);

    const row = await this.prisma.brandKit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.colors !== undefined ? { colors: dedupe(dto.colors) } : {}),
        ...(dto.headingFont !== undefined ? { headingFont: dto.headingFont?.trim() || null } : {}),
        ...(dto.bodyFont !== undefined ? { bodyFont: dto.bodyFont?.trim() || null } : {}),
        ...(dto.logoAssetIds !== undefined ? { logoAssetIds: await this.ownedLogos(coreUserId, dto.logoAssetIds) } : {}),
      },
    });

    return (await this.withLogos(coreUserId, [row]))[0];
  }

  async remove(coreUserId: string, id: string) {
    await this.find(coreUserId, id);
    await this.prisma.brandKit.delete({ where: { id } });

    return { id, deleted: true };
  }

  private async find(coreUserId: string, id: string) {
    const row = await this.prisma.brandKit.findFirst({ where: { id, coreUserId } });

    if (!row) throw new NotFoundException('ไม่พบชุดแบรนด์นี้');

    return row;
  }

  /// โลโก้ต้องเป็นรูปของเจ้าของที่ยังไม่อยู่ในถังขยะ
  private async ownedLogos(coreUserId: string, ids: string[]): Promise<string[]> {
    const unique = dedupe(ids);

    if (unique.length === 0) return [];

    const found = await this.prisma.asset.findMany({
      where: { id: { in: unique }, coreUserId, trashedAt: null, mimeType: { startsWith: 'image/' } },
      select: { id: true },
    });

    if (found.length !== unique.length) throw new BadRequestException(['โลโก้ต้องเป็นรูปในคลังของคุณ']);

    return unique;
  }

  private async withLogos(coreUserId: string, rows: BrandKitRow[]): Promise<BrandKitDto[]> {
    const ids = [...new Set(rows.flatMap((row) => row.logoAssetIds))];
    const assets = ids.length
      ? await this.prisma.asset.findMany({ where: { id: { in: ids }, coreUserId, trashedAt: null }, select: { id: true, fileName: true, mimeType: true } })
      : [];
    const byId = new Map(assets.map((a) => [a.id, a]));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      colors: row.colors,
      headingFont: row.headingFont,
      bodyFont: row.bodyFont,
      logos: row.logoAssetIds
        .map((id) => byId.get(id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
        .map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, contentUrl: `/api/v1/assets/${a.id}/content` })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('brand-kits')
@Controller('brand-kits')
export class BrandKitsController {
  constructor(private readonly kits: BrandKitsService) {}

  @Get()
  @ApiOperation({ summary: 'ชุดแบรนด์ของฉัน' })
  @ApiEnvelopeList(BrandKitDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: PaginationQuery) {
    return this.kits.list(user.coreUserId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ชุดแบรนด์หนึ่งชุด' })
  @ApiEnvelope(BrandKitDto)
  get(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.kits.get(user.coreUserId, id);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'สร้างชุดแบรนด์ (ไม่เกิน 10 ชุด)' })
  @ApiEnvelope(BrandKitDto, { status: 201 })
  create(@CurrentUser() user: CoreHubUser, @Body() dto: BrandKitBodyDto) {
    return this.kits.create(user.coreUserId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'แก้ชุดแบรนด์' })
  @ApiEnvelope(BrandKitDto)
  update(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string, @Body() dto: UpdateBrandKitDto) {
    return this.kits.update(user.coreUserId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบชุดแบรนด์ (โลโก้ในคลังยังอยู่)' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.kits.remove(user.coreUserId, id);
  }
}

@Module({ controllers: [BrandKitsController], providers: [BrandKitsService] })
export class BrandKitsModule {}
