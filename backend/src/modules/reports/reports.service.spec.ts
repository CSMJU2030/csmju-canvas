import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { ReportsService } from './reports.service.js';

const ADMIN = { coreUserId: 'staff-1', coreRole: 'staff' as const };
const TEMPLATE_ID = '2b1d7f0e-8f7a-4c1e-9d55-0f3c7a1b2c3d';
const REPORT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function openReport(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    reporterCoreUserId: 'reporter-1',
    targetKind: 'TEMPLATE',
    targetId: TEMPLATE_ID,
    targetExcerpt: 'โปสเตอร์รับน้อง',
    link: `/templates?id=${TEMPLATE_ID}`,
    reason: 'COPYRIGHT',
    details: '',
    status: 'OPEN',
    resolvedByCoreUserId: null,
    resolutionNote: null,
    actionTaken: null,
    resolvedAt: null,
    createdAt: new Date('2026-10-05T10:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const prisma = {
    report: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn(),
    },
    template: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    design: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    designComment: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), delete: vi.fn() },
  };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined), recordSystem: vi.fn() };
  const service = new ReportsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
  );

  return { prisma, notifications, audit, service };
}

describe('ReportsService.create', () => {
  it('รายงานเทมเพลตของคนอื่นได้ และคัดชื่อไว้เป็นหลักฐาน', async () => {
    const { prisma, service } = setup();

    prisma.template.findUnique.mockResolvedValue({ id: TEMPLATE_ID, title: 'โปสเตอร์รับน้อง', createdByCoreUserId: 'author', hiddenAt: null });
    prisma.report.create.mockImplementation(({ data }) => Promise.resolve({ ...openReport(), ...data, id: REPORT_ID }));

    const created = await service.create({ coreUserId: 'reporter-1', coreRole: 'student' }, { targetKind: 'TEMPLATE', targetId: TEMPLATE_ID, reason: 'COPYRIGHT' });

    expect(created.status).toBe('OPEN');
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetExcerpt: 'โปสเตอร์รับน้อง', link: `/templates?id=${TEMPLATE_ID}`, reporterCoreUserId: 'reporter-1' }),
    });
  });

  it('รายงานเทมเพลตของตัวเองไม่ได้ (400) · เทมเพลตที่ถูกซ่อนแล้ว = 404', async () => {
    const { prisma, service } = setup();
    const me = { coreUserId: 'author', coreRole: 'lecturer' as const };

    prisma.template.findUnique.mockResolvedValueOnce({ id: TEMPLATE_ID, title: 'x', createdByCoreUserId: 'author', hiddenAt: null });
    await expect(service.create(me, { targetKind: 'TEMPLATE', targetId: TEMPLATE_ID, reason: 'SPAM' })).rejects.toBeInstanceOf(BadRequestException);

    prisma.template.findUnique.mockResolvedValueOnce({ id: TEMPLATE_ID, title: 'x', createdByCoreUserId: 'other', hiddenAt: new Date() });
    await expect(service.create(me, { targetKind: 'TEMPLATE', targetId: TEMPLATE_ID, reason: 'SPAM' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('งานที่ไม่ได้แชร์ = 404 · รายงานซ้ำระหว่างยังเปิดอยู่ = 409', async () => {
    const { prisma, service } = setup();
    const me = { coreUserId: 'viewer', coreRole: 'student' as const };

    prisma.design.findUnique.mockResolvedValueOnce({ id: TEMPLATE_ID, title: 'งาน', coreUserId: 'owner', linkAccess: 'NONE', trashedAt: null, purgedAt: null });
    await expect(service.create(me, { targetKind: 'DESIGN', targetId: TEMPLATE_ID, reason: 'INAPPROPRIATE' })).rejects.toBeInstanceOf(NotFoundException);

    prisma.design.findUnique.mockResolvedValueOnce({ id: TEMPLATE_ID, title: 'งาน', coreUserId: 'owner', linkAccess: 'VIEW', trashedAt: null, purgedAt: null });
    prisma.report.findFirst.mockResolvedValueOnce({ id: REPORT_ID });
    await expect(service.create(me, { targetKind: 'DESIGN', targetId: TEMPLATE_ID, reason: 'INAPPROPRIATE' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('เหตุผล "อื่น ๆ" ต้องมีรายละเอียด', async () => {
    const { service } = setup();

    await expect(service.create({ coreUserId: 'u', coreRole: 'student' }, { targetKind: 'OTHER', reason: 'OTHER', details: 'สั้น' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ReportsService.update', () => {
  it('จัดการแล้ว + ซ่อนเทมเพลต: ตั้ง hiddenAt · audit report.resolved และ template.unpublish · แจ้งผู้รายงานและผู้เผยแพร่', async () => {
    const { prisma, audit, notifications, service } = setup();

    prisma.report.findUnique.mockResolvedValue(openReport());
    prisma.template.findUnique.mockResolvedValue({ title: 'โปสเตอร์รับน้อง', createdByCoreUserId: 'author', hiddenAt: null });

    const result = await service.update(ADMIN, REPORT_ID, { status: 'RESOLVED', note: 'ใช้ภาพมีลิขสิทธิ์', action: 'HIDE_TARGET' });

    expect(result).toMatchObject({ status: 'RESOLVED', actionTaken: 'HIDE_TARGET', resolutionNote: 'ใช้ภาพมีลิขสิทธิ์', resolvedByCoreUserId: 'staff-1' });
    expect(prisma.report.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: REPORT_ID, status: 'OPEN' } }));
    expect(prisma.template.update).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID }, data: { hiddenAt: expect.any(Date) } });
    expect(audit.record.mock.calls.map(([, entry]) => entry.action)).toEqual(['template.unpublish', 'report.resolved']);
    expect(notifications.notify).toHaveBeenCalledWith('author', 'CONTENT_MODERATED', expect.stringContaining('ถูกซ่อน'), null);
    expect(notifications.notify).toHaveBeenCalledWith('reporter-1', 'REPORT_UPDATED', expect.stringContaining('จัดการเรื่องที่คุณรายงาน'), null);
  });

  it('ปัดตกพร้อมสั่งซ่อน = 400 · เรื่องที่ปิดแล้ว = 409', async () => {
    const { prisma, service } = setup();

    prisma.report.findUnique.mockResolvedValueOnce(openReport());
    await expect(service.update(ADMIN, REPORT_ID, { status: 'REJECTED', action: 'HIDE_TARGET' })).rejects.toBeInstanceOf(BadRequestException);

    prisma.report.findUnique.mockResolvedValueOnce(openReport({ status: 'RESOLVED' }));
    await expect(service.update(ADMIN, REPORT_ID, { status: 'REJECTED' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('ผู้ดูแลสองคนกดพร้อมกัน คนที่สองได้ 409', async () => {
    const { prisma, service } = setup();

    prisma.report.findUnique.mockResolvedValue(openReport());
    prisma.report.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.update(ADMIN, REPORT_ID, { status: 'REJECTED' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('ปัดตก: ไม่แตะเป้าหมาย · audit report.rejected · แจ้งผู้รายงาน', async () => {
    const { prisma, audit, notifications, service } = setup();

    prisma.report.findUnique.mockResolvedValue(openReport());

    await service.update(ADMIN, REPORT_ID, { status: 'REJECTED' });

    expect(prisma.template.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(ADMIN, expect.objectContaining({ action: 'report.rejected', targetKind: 'REPORT', targetId: REPORT_ID }));
    expect(notifications.notify).toHaveBeenCalledWith('reporter-1', 'REPORT_UPDATED', expect.stringContaining('ไม่พบการละเมิด'), null);
  });
});
