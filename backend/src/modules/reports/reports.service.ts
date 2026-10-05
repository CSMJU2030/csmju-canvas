import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Report } from '../../generated/prisma/client.js';
import type { CoreHubUser } from '../../common/auth/core-user.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.js';
import { accessOf } from '../designs/designs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateReportDto, ListReportsQuery, ReportDto, ReportTargetDto, UpdateReportDto } from './report.dto.js';

type Actor = Pick<CoreHubUser, 'coreUserId' | 'coreRole'>;

const EXCERPT_MAX = 300;

/// เรื่องร้องเรียนเนื้อหา (แบบ csmju-nexus) — ผู้ใช้แจ้ง · ผู้ดูแล (staff/admin) ปิดเรื่องและซ่อนเป้าหมายได้
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async create(user: Actor, dto: CreateReportDto) {
    const details = (dto.details ?? '').trim();

    if (dto.reason === 'OTHER' && details.length < 5) {
      throw new BadRequestException('เลือก "อื่น ๆ" แล้วต้องเขียนรายละเอียดอย่างน้อย 5 ตัวอักษร');
    }

    let targetId: string | null = null;
    let excerpt: string | null = null;
    let link: string | null = dto.link ?? null;

    if (dto.targetKind === 'OTHER') {
      if (dto.targetId) throw new BadRequestException('เรื่องอื่น ๆ ไม่ต้องระบุ targetId');
    } else {
      const target = await this.resolveTarget(user.coreUserId, dto.targetKind, dto.targetId!);

      targetId = dto.targetId!;
      excerpt = target.excerpt.slice(0, EXCERPT_MAX);
      link = target.link;

      // คนเดิมแจ้งเรื่องเดิมซ้ำระหว่างที่ยังเปิดอยู่ไม่ได้ — กันกดพลาดและการปั่นยอดรายงาน
      const open = await this.prisma.report.findFirst({
        where: { reporterCoreUserId: user.coreUserId, targetKind: dto.targetKind, targetId, status: 'OPEN' },
        select: { id: true },
      });

      if (open) throw new ConflictException('คุณรายงานเรื่องนี้ไว้แล้ว ผู้ดูแลกำลังตรวจสอบ');
    }

    const row = await this.prisma.report.create({
      data: {
        reporterCoreUserId: user.coreUserId,
        targetKind: dto.targetKind,
        targetId,
        targetExcerpt: excerpt,
        link,
        reason: dto.reason,
        details,
      },
    });

    return {
      id: row.id,
      targetKind: row.targetKind,
      targetId: row.targetId,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /// คิวของผู้ดูแล — เรื่องที่ยังเปิดเรียงเก่าสุดก่อน (FIFO) · เรื่องที่ปิดแล้วเรียงล่าสุดก่อน
  async list(query: ListReportsQuery) {
    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetKind ? { targetKind: query.targetKind } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: query.status === 'OPEN' ? 'asc' : 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.report.count({ where }),
    ]);
    const targets = await this.previewTargets(rows);

    return new Paginated(
      rows.map((row) => toDto(row, row.targetId ? (targets.get(row.targetId) ?? missingTarget()) : null)),
      query.meta(total),
    );
  }

  async update(user: Actor, id: string, dto: UpdateReportDto): Promise<ReportDto> {
    const report = await this.prisma.report.findUnique({ where: { id } });

    if (!report) throw new NotFoundException('ไม่พบเรื่องร้องเรียนนี้');
    if (report.status !== 'OPEN') throw new ConflictException('เรื่องนี้ถูกปิดไปแล้ว');
    if (dto.action && dto.status !== 'RESOLVED') throw new BadRequestException('ซ่อนเป้าหมายได้เฉพาะเมื่อเลือก "จัดการแล้ว"');
    if (dto.action && (report.targetKind === 'OTHER' || !report.targetId)) {
      throw new BadRequestException('เรื่องประเภท "อื่น ๆ" ไม่มีเป้าหมายให้ซ่อน');
    }

    const note = dto.note?.trim() || null;
    const now = new Date();
    const data = {
      status: dto.status,
      resolvedByCoreUserId: user.coreUserId,
      resolutionNote: note,
      actionTaken: dto.action ?? null,
      resolvedAt: now,
    } satisfies Prisma.ReportUpdateManyMutationInput;

    // ปิดแบบมีเงื่อนไข status = OPEN — ผู้ดูแลสองคนกดพร้อมกัน คนที่สองได้ 409
    const claimed = await this.prisma.report.updateMany({ where: { id, status: 'OPEN' }, data });

    if (claimed.count === 0) throw new ConflictException('เรื่องนี้ถูกปิดไปแล้ว');

    const closed: Report[] = [{ ...report, ...data }];

    if (dto.action === 'HIDE_TARGET') {
      await this.hideTarget(user, report, note);

      // เรื่องอื่นที่ยังเปิดอยู่กับเป้าหมายเดียวกันจบไปพร้อมกัน — ผู้รายงานทุกคนได้รับแจ้ง
      const siblings = await this.prisma.report.findMany({
        where: { targetKind: report.targetKind, targetId: report.targetId, status: 'OPEN', id: { not: id } },
      });

      if (siblings.length > 0) {
        await this.prisma.report.updateMany({ where: { id: { in: siblings.map((s) => s.id) }, status: 'OPEN' }, data });
        closed.push(...siblings.map((s) => ({ ...s, ...data })));
      }
    }

    for (const row of closed) {
      await this.audit.record(user, {
        action: `report.${dto.status.toLowerCase()}`,
        targetKind: 'REPORT',
        targetId: row.id,
        metadata: {
          reportTargetKind: row.targetKind,
          reportTargetId: row.targetId,
          reason: row.reason,
          reporterCoreUserId: row.reporterCoreUserId,
          note,
          action: dto.action ?? null,
        },
      });

      const subject = row.targetExcerpt ? ` "${row.targetExcerpt.slice(0, 60)}"` : '';

      void this.notifications
        .notify(
          row.reporterCoreUserId,
          'REPORT_UPDATED',
          dto.status === 'RESOLVED'
            ? `ผู้ดูแลจัดการเรื่องที่คุณรายงาน${subject} แล้ว ขอบคุณที่ช่วยดูแลเนื้อหา`
            : `ผู้ดูแลพิจารณาเรื่องที่คุณรายงาน${subject} แล้ว ไม่พบการละเมิด`,
          null,
        )
        .catch(() => undefined);
    }

    const targets = await this.previewTargets([report]);

    return toDto({ ...report, ...data }, report.targetId ? (targets.get(report.targetId) ?? missingTarget()) : null);
  }

  /// ตรวจว่าผู้รายงานเห็นสิ่งที่รายงานได้จริง แล้วคืนข้อความที่คัดไว้เป็นหลักฐาน + ลิงก์
  ///
  /// เห็นไม่ได้ = 404 เหมือนหน้าอื่น (ไม่บอกว่ามีของ id นี้อยู่) · รายงานของตัวเอง = 400
  private async resolveTarget(me: string, kind: 'DESIGN' | 'TEMPLATE' | 'COMMENT', id: string) {
    if (kind === 'DESIGN') {
      const design = await this.prisma.design.findUnique({
        where: { id },
        select: { id: true, title: true, coreUserId: true, linkAccess: true, trashedAt: true, purgedAt: true },
      });

      if (!design || accessOf(design, me) === null) throw new NotFoundException('ไม่พบงานนี้ อาจถูกลบไปแล้ว');
      if (design.coreUserId === me) throw new BadRequestException('รายงานงานของตัวเองไม่ได้');

      return { excerpt: design.title, link: `/design/${design.id}` };
    }

    if (kind === 'TEMPLATE') {
      const template = await this.prisma.template.findUnique({
        where: { id },
        select: { id: true, title: true, createdByCoreUserId: true, hiddenAt: true },
      });

      if (!template || template.hiddenAt) throw new NotFoundException('ไม่พบเทมเพลตนี้ อาจถูกลบไปแล้ว');
      if (template.createdByCoreUserId === me) throw new BadRequestException('รายงานเทมเพลตของตัวเองไม่ได้');

      return { excerpt: template.title, link: `/templates?id=${template.id}` };
    }

    const comment = await this.prisma.designComment.findUnique({
      where: { id },
      select: {
        id: true,
        body: true,
        coreUserId: true,
        design: { select: { id: true, coreUserId: true, linkAccess: true, trashedAt: true, purgedAt: true } },
      },
    });

    if (!comment || accessOf(comment.design, me) === null) throw new NotFoundException('ไม่พบความคิดเห็นนี้');
    if (comment.coreUserId === me) throw new BadRequestException('รายงานความคิดเห็นของตัวเองไม่ได้');

    return { excerpt: comment.body, link: `/design/${comment.design.id}` };
  }

  /// ซ่อนเป้าหมาย: เทมเพลต → hiddenAt · งาน → ปิดลิงก์แชร์ · ความคิดเห็น → ลบ (การตอบกลับถูกลบตาม)
  private async hideTarget(user: Actor, report: Report, note: string | null) {
    const id = report.targetId!;

    if (report.targetKind === 'TEMPLATE') {
      const template = await this.prisma.template.findUnique({ where: { id }, select: { title: true, createdByCoreUserId: true, hiddenAt: true } });

      if (!template) return;
      if (!template.hiddenAt) await this.prisma.template.update({ where: { id }, data: { hiddenAt: new Date() } });

      await this.audit.record(user, {
        action: 'template.unpublish',
        targetKind: 'TEMPLATE',
        targetId: id,
        metadata: { reportId: report.id, ownerCoreUserId: template.createdByCoreUserId, title: template.title, note },
      });
      if (template.createdByCoreUserId) {
        void this.notifications
          .notify(template.createdByCoreUserId, 'CONTENT_MODERATED', `เทมเพลต "${template.title}" ถูกซ่อนโดยผู้ดูแลระบบจากเรื่องร้องเรียน`, null)
          .catch(() => undefined);
      }

      return;
    }

    if (report.targetKind === 'DESIGN') {
      const design = await this.prisma.design.findUnique({ where: { id }, select: { title: true, coreUserId: true, linkAccess: true, purgedAt: true } });

      if (!design) return;
      if (design.linkAccess !== 'NONE') await this.prisma.design.update({ where: { id }, data: { linkAccess: 'NONE' } });

      await this.audit.record(user, {
        action: 'design.link_disabled',
        targetKind: 'DESIGN',
        targetId: id,
        metadata: { reportId: report.id, ownerCoreUserId: design.coreUserId, title: design.title, previousLinkAccess: design.linkAccess, note },
      });
      if (!design.purgedAt) {
        void this.notifications
          .notify(design.coreUserId, 'CONTENT_MODERATED', `ผู้ดูแลระบบปิดลิงก์แชร์ของ "${design.title}" จากเรื่องร้องเรียน`, `/design/${id}`)
          .catch(() => undefined);
      }

      return;
    }

    const comment = await this.prisma.designComment.findUnique({
      where: { id },
      select: { body: true, coreUserId: true, designId: true, design: { select: { title: true } } },
    });

    if (!comment) return;

    await this.prisma.designComment.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'comment.delete',
      targetKind: 'COMMENT',
      targetId: id,
      metadata: { reportId: report.id, ownerCoreUserId: comment.coreUserId, designId: comment.designId, body: comment.body.slice(0, EXCERPT_MAX), note },
    });
    void this.notifications
      .notify(comment.coreUserId, 'CONTENT_MODERATED', `ความคิดเห็นของคุณใน "${comment.design.title}" ถูกลบโดยผู้ดูแลระบบจากเรื่องร้องเรียน`, null)
      .catch(() => undefined);
  }

  /// อ่านสถานะปัจจุบันของเป้าหมายทั้งหน้าในครั้งเดียว (ไม่ยิงทีละแถว)
  private async previewTargets(rows: Pick<Report, 'targetKind' | 'targetId'>[]): Promise<Map<string, ReportTargetDto>> {
    const ids = (kind: string) => [...new Set(rows.filter((r) => r.targetKind === kind && r.targetId).map((r) => r.targetId!))];
    const designIds = ids('DESIGN');
    const templateIds = ids('TEMPLATE');
    const commentIds = ids('COMMENT');
    const [designs, templates, comments] = await Promise.all([
      designIds.length
        ? this.prisma.design.findMany({
            where: { id: { in: designIds } },
            select: { id: true, title: true, thumbnail: true, designType: true, width: true, height: true, coreUserId: true, linkAccess: true, purgedAt: true },
          })
        : [],
      templateIds.length
        ? this.prisma.template.findMany({
            where: { id: { in: templateIds } },
            select: { id: true, title: true, thumbnail: true, designType: true, width: true, height: true, createdByCoreUserId: true, hiddenAt: true },
          })
        : [],
      commentIds.length
        ? this.prisma.designComment.findMany({
            where: { id: { in: commentIds } },
            select: { id: true, body: true, coreUserId: true, design: { select: { title: true } } },
          })
        : [],
    ]);
    const map = new Map<string, ReportTargetDto>();

    for (const d of designs) {
      map.set(d.id, {
        exists: d.purgedAt === null,
        hidden: d.linkAccess === 'NONE',
        title: d.title,
        thumbnail: d.thumbnail,
        designType: d.designType,
        width: d.width,
        height: d.height,
        body: null,
        ownerCoreUserId: d.coreUserId,
      });
    }
    for (const t of templates) {
      map.set(t.id, {
        exists: true,
        hidden: t.hiddenAt !== null,
        title: t.title,
        thumbnail: t.thumbnail,
        designType: t.designType,
        width: t.width,
        height: t.height,
        body: null,
        ownerCoreUserId: t.createdByCoreUserId,
      });
    }
    for (const c of comments) {
      map.set(c.id, {
        exists: true,
        hidden: false,
        title: c.design.title,
        thumbnail: null,
        designType: null,
        width: null,
        height: null,
        body: c.body,
        ownerCoreUserId: c.coreUserId,
      });
    }

    return map;
  }
}

function missingTarget(): ReportTargetDto {
  return { exists: false, hidden: true, title: null, thumbnail: null, designType: null, width: null, height: null, body: null, ownerCoreUserId: null };
}

function toDto(row: Report, target: ReportTargetDto | null): ReportDto {
  return {
    id: row.id,
    targetKind: row.targetKind,
    targetId: row.targetId,
    targetExcerpt: row.targetExcerpt,
    link: row.link,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporterCoreUserId: row.reporterCoreUserId,
    resolvedByCoreUserId: row.resolvedByCoreUserId,
    resolutionNote: row.resolutionNote,
    actionTaken: row.actionTaken,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    target,
  };
}
