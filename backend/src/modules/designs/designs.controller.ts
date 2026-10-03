import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { Paginated } from '../../common/http/envelope.js';
import { PaginationQuery } from '../../common/http/pagination.dto.js';
import { DesignsService } from './designs.service.js';
import {
  CreateDesignDto,
  DeletedDto,
  DesignDto,
  DesignSummaryDto,
  DesignTypeUsageDto,
  ListDesignsQuery,
  UpdateDesignDto,
} from './dto/design.dto.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('designs')
@Controller('designs')
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Get()
  @ApiOperation({ summary: 'งานของฉัน (ค้นหา กรองประเภท โฟลเดอร์ ช่วงวันที่แก้ หรือถังขยะ)' })
  @ApiEnvelopeList(DesignSummaryDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: ListDesignsQuery) {
    return this.designs.list(user.coreUserId, query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'สร้างงานใหม่ (หน้าเปล่า · จากเทมเพลต · หรือทำสำเนางานเดิม)' })
  @ApiEnvelope(DesignDto, { status: 201 })
  create(@CurrentUser() user: CoreHubUser, @Body() dto: CreateDesignDto) {
    return this.designs.create(user.coreUserId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'งานหนึ่งชิ้นพร้อม JSON state (CMS ใช้ render สด)' })
  @ApiEnvelope(DesignDto)
  get(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.designs.get(user.coreUserId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'บันทึกงาน · เปลี่ยนชื่อ · ย้ายโฟลเดอร์ · ย้ายลง/กู้คืนจากถังขยะ' })
  @ApiEnvelope(DesignDto)
  update(
    @CurrentUser() user: CoreHubUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateDesignDto,
  ) {
    return this.designs.update(user.coreUserId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบถาวร (เฉพาะงานที่อยู่ในถังขยะ)' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.designs.remove(user.coreUserId, id);
  }
}

@ApiTags('designs')
@Controller('design-type-usages')
export class DesignTypeUsagesController {
  constructor(private readonly designs: DesignsService) {}

  @Get()
  @ApiOperation({ summary: 'ประเภทงานที่ฉันใช้บ่อย (นับจากงานจริง)' })
  @ApiEnvelopeList(DesignTypeUsageDto)
  async list(@CurrentUser() user: CoreHubUser, @Query() query: PaginationQuery) {
    const all = await this.designs.typeUsage(user.coreUserId);

    return new Paginated(all.slice(query.skip, query.skip + query.take), query.meta(all.length));
  }
}
