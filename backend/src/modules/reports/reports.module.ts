import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ADMIN_CORE_ROLES, CoreRoles } from '../../common/auth/core-roles.decorator.js';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeError, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { CreatedReportDto, CreateReportDto, ListReportsQuery, ReportDto, UpdateReportDto } from './report.dto.js';
import { ReportsService } from './reports.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'รายงานงานที่แชร์ เทมเพลต ความคิดเห็น หรือเรื่องอื่นให้ผู้ดูแลตรวจสอบ' })
  @ApiEnvelope(CreatedReportDto, { status: 201, description: 'รับเรื่องแล้ว' })
  @ApiEnvelopeError(404, 'ไม่พบสิ่งที่รายงาน หรือคุณไม่มีสิทธิ์เห็น')
  @ApiEnvelopeError(409, 'รายงานเรื่องนี้ไว้แล้วและยังเปิดอยู่')
  create(@CurrentUser() user: CoreHubUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user, dto);
  }

  @Get()
  @CoreRoles(...ADMIN_CORE_ROLES)
  @ApiOperation({ summary: 'เรื่องร้องเรียนทั้งหมด (เจ้าหน้าที่และผู้ดูแลระบบเท่านั้น)' })
  @ApiEnvelopeList(ReportDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  list(@Query() query: ListReportsQuery) {
    return this.reports.list(query);
  }

  @Patch(':id')
  @CoreRoles(...ADMIN_CORE_ROLES)
  @ApiOperation({ summary: 'ปิดเรื่อง — จัดการแล้ว (ซ่อนเป้าหมายได้) หรือปัดตก · แจ้งผู้รายงาน' })
  @ApiEnvelope(ReportDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  @ApiEnvelopeError(409, 'เรื่องนี้ถูกปิดไปแล้ว')
  update(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string, @Body() dto: UpdateReportDto) {
    return this.reports.update(user, id, dto);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
