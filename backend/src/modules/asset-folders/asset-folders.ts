import {
  Body,
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
import { ApiProperty, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { Paginated } from '../../common/http/envelope.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { DeletedDto } from '../designs/dto/design.dto.js';

/// โฟลเดอร์ของรูปที่อัปโหลด (แผงอัปโหลดในหน้าแก้ไข → แท็บโฟลเดอร์)

export class AssetFolderBodyDto {
  @ApiProperty({ example: 'รูปกิจกรรมรับน้อง' })
  @IsString()
  @MinLength(1, { message: 'กรุณาตั้งชื่อโฟลเดอร์' })
  @MaxLength(80)
  name!: string;
}

export class AssetFolderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'จำนวนรูปที่ยังไม่อยู่ในถังขยะ' }) assetCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

const COUNT = { _count: { select: { assets: { where: { trashedAt: null } } } } } as const;

@Injectable()
export class AssetFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(coreUserId: string, query: PaginationQuery) {
    const where = { coreUserId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assetFolder.findMany({ where, orderBy: { name: 'asc' }, skip: query.skip, take: query.take, include: COUNT }),
      this.prisma.assetFolder.count({ where }),
    ]);

    return new Paginated(
      rows.map((row) => toDto(row, row._count.assets)),
      query.meta(total),
    );
  }

  async create(coreUserId: string, name: string) {
    return toDto(await this.prisma.assetFolder.create({ data: { coreUserId, name } }), 0);
  }

  async rename(coreUserId: string, id: string, name: string) {
    await this.find(coreUserId, id);

    const row = await this.prisma.assetFolder.update({ where: { id }, data: { name }, include: COUNT });

    return toDto(row, row._count.assets);
  }

  /// ลบโฟลเดอร์อย่างเดียว — รูปข้างในไม่หาย แค่ออกจากโฟลเดอร์ (onDelete: SetNull)
  async remove(coreUserId: string, id: string) {
    await this.find(coreUserId, id);
    await this.prisma.assetFolder.delete({ where: { id } });

    return { id, deleted: true };
  }

  private async find(coreUserId: string, id: string) {
    const row = await this.prisma.assetFolder.findFirst({ where: { id, coreUserId } });

    if (!row) throw new NotFoundException('ไม่พบโฟลเดอร์นี้');

    return row;
  }
}

function toDto(row: { id: string; name: string; createdAt: Date; updatedAt: Date }, assetCount: number) {
  return {
    id: row.id,
    name: row.name,
    assetCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('assets')
@Controller('asset-folders')
export class AssetFoldersController {
  constructor(private readonly folders: AssetFoldersService) {}

  @Get()
  @ApiOperation({ summary: 'โฟลเดอร์รูปของฉัน' })
  @ApiEnvelopeList(AssetFolderDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: PaginationQuery) {
    return this.folders.list(user.coreUserId, query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'สร้างโฟลเดอร์รูป' })
  @ApiEnvelope(AssetFolderDto, { status: 201 })
  create(@CurrentUser() user: CoreHubUser, @Body() dto: AssetFolderBodyDto) {
    return this.folders.create(user.coreUserId, dto.name);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'เปลี่ยนชื่อโฟลเดอร์รูป' })
  @ApiEnvelope(AssetFolderDto)
  rename(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string, @Body() dto: AssetFolderBodyDto) {
    return this.folders.rename(user.coreUserId, id, dto.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบโฟลเดอร์รูป (รูปข้างในยังอยู่)' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.folders.remove(user.coreUserId, id);
  }
}

@Module({ controllers: [AssetFoldersController], providers: [AssetFoldersService] })
export class AssetFoldersModule {}
