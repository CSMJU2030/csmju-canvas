import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationKind } from '../../generated/prisma/enums.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ListNotificationsQuery } from './dto/notification.dto.js';

/// แจ้งเตือนภายในระบบ — เกิดจากเหตุการณ์จริงเท่านั้น (ย้ายงานลงถังขยะ · มีคนใช้เทมเพลตของเรา)
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(coreUserId: string, query: ListNotificationsQuery) {
    const where = {
      coreUserId,
      ...(query.unread ? { readAt: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return new Paginated(rows.map(toDto), query.meta(total));
  }

  async markRead(coreUserId: string, id: string, read: boolean) {
    const row = await this.prisma.notification.findFirst({ where: { id, coreUserId } });

    if (!row) throw new NotFoundException('ไม่พบการแจ้งเตือนนี้');

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: read ? (row.readAt ?? new Date()) : null },
    });

    return toDto(updated);
  }

  async markAllRead(coreUserId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { coreUserId, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }

  /// สร้างแจ้งเตือนถ้าผู้รับไม่ได้ปิดไว้ — ล้มเหลวก็ไม่ทำให้การกระทำหลักพัง
  async notify(
    coreUserId: string,
    kind: NotificationKind,
    title: string,
    link: string | null,
  ): Promise<void> {
    const pref = await this.prisma.preference.findUnique({ where: { coreUserId } });

    if (kind === 'DESIGN_TRASHED' && pref && !pref.notifyTrash) return;
    if (kind === 'TEMPLATE_USED' && pref && !pref.notifyTemplateUsed) return;

    await this.prisma.notification.create({
      data: { coreUserId, kind, title: title.slice(0, 160), link },
    });
  }
}

function toDto(row: {
  id: string;
  kind: NotificationKind;
  title: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    link: row.link,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
