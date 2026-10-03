import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import {
  BulkUpdateResultDto,
  ListNotificationsQuery,
  NotificationDto,
  UpdateNotificationDto,
} from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'การแจ้งเตือนของฉัน (ใหม่สุดก่อน)' })
  @ApiEnvelopeList(NotificationDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: ListNotificationsQuery) {
    return this.notifications.list(user.coreUserId, query);
  }

  @Patch()
  @ApiOperation({ summary: 'ทำเครื่องหมายว่าอ่านแล้วทั้งหมด' })
  @ApiEnvelope(BulkUpdateResultDto)
  markAll(@CurrentUser() user: CoreHubUser, @Body() _body: UpdateNotificationDto) {
    return this.notifications.markAllRead(user.coreUserId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'อ่านแล้ว / ยังไม่อ่าน' })
  @ApiEnvelope(NotificationDto)
  mark(
    @CurrentUser() user: CoreHubUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateNotificationDto,
  ) {
    return this.notifications.markRead(user.coreUserId, id, body.read);
  }
}
