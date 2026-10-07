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

export class FolderBodyDto {
  @ApiProperty({ example: 'งานวิชา CS201' })
  @IsString()
  @MinLength(1, { message: 'กรุณาตั้งชื่อโฟลเดอร์' })
  @MaxLength(80)
  name!: string;
}

export class FolderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'จำนวนงานที่ยังไม่อยู่ในถังขยะ' }) designCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(coreUserId: string, query: PaginationQuery) {
    const where = { coreUserId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.folder.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
        include: { _count: { select: { designs: { where: { trashedAt: null } } } } },
      }),
      this.prisma.folder.count({ where }),
    ]);

    return new Paginated(
      rows.map((row) => toDto(row, row._count.designs)),
      query.meta(total),
    );
  }

  async create(coreUserId: string, name: string) {
    return toDto(await this.prisma.folder.create({ data: { coreUserId, name } }), 0);
  }

  async rename(coreUserId: string, id: string, name: string) {
    await this.find(coreUserId, id);

    const row = await this.prisma.folder.update({
      where: { id },
      data: { name },
      include: { _count: { select: { designs: { where: { trashedAt: null } } } } },
    });

    return toDto(row, row._count.designs);
  }

  /// ลบโฟลเดอร์อย่างเดียว — งานข้างในไม่หาย แค่ออกจากโฟลเดอร์ (onDelete: SetNull)
  async remove(coreUserId: string, id: string) {
    await this.find(coreUserId, id);
    await this.prisma.folder.delete({ where: { id } });

    return { id, deleted: true };
  }

  private async find(coreUserId: string, id: string) {
    const row = await this.prisma.folder.findFirst({ where: { id, coreUserId } });

    if (!row) throw new NotFoundException('ไม่พบโฟลเดอร์นี้');

    return row;
  }
}

function toDto(row: { id: string; name: string; createdAt: Date; updatedAt: Date }, designCount: number) {
  return {
    id: row.id,
    name: row.name,
    designCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('folders')
@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  @ApiOperation({ summary: 'โฟลเดอร์ในหน้าโปรเจกต์ของฉัน' })
  @ApiEnvelopeList(FolderDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: PaginationQuery) {
    return this.folders.list(user.coreUserId, query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'สร้างโฟลเดอร์' })
  @ApiEnvelope(FolderDto, { status: 201 })
  create(@CurrentUser() user: CoreHubUser, @Body() dto: FolderBodyDto) {
    return this.folders.create(user.coreUserId, dto.name);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'เปลี่ยนชื่อโฟลเดอร์' })
  @ApiEnvelope(FolderDto)
  rename(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string, @Body() dto: FolderBodyDto) {
    return this.folders.rename(user.coreUserId, id, dto.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบโฟลเดอร์ (งานข้างในยังอยู่)' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.folders.remove(user.coreUserId, id);
  }
}

@Module({ controllers: [FoldersController], providers: [FoldersService] })
export class FoldersModule {}
