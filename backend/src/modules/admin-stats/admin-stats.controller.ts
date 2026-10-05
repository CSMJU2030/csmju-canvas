import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ADMIN_CORE_ROLES, CoreRoles } from '../../common/auth/core-roles.decorator.js';
import { ApiEnvelope, ApiEnvelopeError } from '../../common/http/api-envelope.decorator.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminActivityDto, AdminActivityQuery, AdminOverviewDto } from './dto/admin-stats.dto.js';

/// แผงผู้ดูแล → ภาพรวม
@ApiTags('admin')
@Controller('admin-overview')
export class AdminOverviewController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get()
  @CoreRoles(...ADMIN_CORE_ROLES)
  @ApiOperation({ summary: 'ตัวเลขรวมของ CS Canvas สำหรับแผงผู้ดูแล' })
  @ApiEnvelope(AdminOverviewDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  overview() {
    return this.stats.overview();
  }
}

/// แผงผู้ดูแล → กิจกรรม (การเคลื่อนไหวของเว็บ) — ยอดรวมรายวันเท่านั้น
@ApiTags('admin')
@Controller('admin-activity')
export class AdminActivityController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get()
  @CoreRoles(...ADMIN_CORE_ROLES)
  @ApiOperation({
    summary: 'กิจกรรมรายวันของ CS Canvas (ผู้ดูแล)',
    description: 'ยอดรวมต่อวันตามเวลาไทย ไม่มีข้อมูลรายบุคคล · trends เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน',
  })
  @ApiEnvelope(AdminActivityDto)
  @ApiEnvelopeError(400, 'days ต้องเป็น 7, 30 หรือ 90')
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  activity(@Query() query: AdminActivityQuery) {
    return this.stats.activity(query.days);
  }
}
