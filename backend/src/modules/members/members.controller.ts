import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ADMIN_CORE_ROLES, CoreRoles } from '../../common/auth/core-roles.decorator.js';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeError, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { ListMembersQuery, MemberDto, MemberParam, MyMembershipDto, UpdateMemberQuotaDto } from './dto/member.dto.js';
import { MembersService } from './members.service.js';

/// สมาชิกของ CS Canvas — GET /me สำหรับทุกคน · รายชื่อและการปรับโควตาสำหรับผู้ดูแล (แผงผู้ดูแล → สมาชิกและพื้นที่)
@ApiTags('subsystem-members')
@Controller('subsystem-members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'บันทึกว่าฉันเข้าใช้ และคืนพื้นที่เก็บไฟล์ของฉัน',
    description: 'หน้าบ้านเรียกครั้งเดียวหลังโหลดตัวตนสำเร็จ · เก็บแค่ coreUserId เวลาเข้าใช้ล่าสุด และ core role ล่าสุด (ไว้แสดงในแผงผู้ดูแล)',
  })
  @ApiEnvelope(MyMembershipDto)
  me(@CurrentUser() user: CoreHubUser) {
    return this.members.touch(user);
  }

  @Get()
  @CoreRoles(...ADMIN_CORE_ROLES)
  @ApiOperation({ summary: 'รายชื่อสมาชิกพร้อมพื้นที่ที่ใช้ โควตา และจำนวนดีไซน์ (ผู้ดูแล)' })
  @ApiEnvelopeList(MemberDto)
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  list(@Query() query: ListMembersQuery) {
    return this.members.list(query);
  }

  @Patch(':coreUserId/storage-quota')
  @CoreRoles(...ADMIN_CORE_ROLES)
  @ApiOperation({
    summary: 'ปรับโควตาพื้นที่เก็บไฟล์ของสมาชิก (ผู้ดูแล)',
    description: 'เพดาน 5 GB · null = กลับไปใช้ค่าเริ่มต้น 500 MB · ตั้งล่วงหน้าก่อนเจ้าตัวเปิดแอปครั้งแรกได้ · บันทึก audit log member.quota_change',
  })
  @ApiEnvelope(MemberDto)
  @ApiEnvelopeError(400, 'โควตาไม่ถูกต้องหรือเกิน 5 GB')
  @ApiEnvelopeError(403, 'เฉพาะผู้ดูแลระบบ')
  updateQuota(@CurrentUser() user: CoreHubUser, @Param() params: MemberParam, @Body() dto: UpdateMemberQuotaDto) {
    return this.members.updateQuota(user, params.coreUserId, dto);
  }
}
