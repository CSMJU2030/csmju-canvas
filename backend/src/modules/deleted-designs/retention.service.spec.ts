import { vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.js';
import { accessOf, expireTrash, purgeDateOf } from '../designs/designs.service.js';
import { RetentionService } from './retention.service.js';

const DAY = 86_400_000;
const NOW = new Date('2026-10-06T03:00:00+07:00');

function mocks() {
  const prisma = {
    design: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn(),
    },
  };
  const audit = { record: vi.fn(), recordSystem: vi.fn().mockResolvedValue(undefined) };

  return { prisma, audit, asPrisma: prisma as unknown as PrismaService, asAudit: audit as unknown as AuditService };
}

describe('RetentionService.purgeExpired', () => {
  it('ลบจริงเฉพาะงานที่ลบถาวรเกิน 30 วัน และบันทึก audit design.purge (retention)', async () => {
    const { prisma, audit, asPrisma, asAudit } = mocks();
    const purgedAt = new Date(NOW.getTime() - 31 * DAY);

    prisma.design.findMany.mockResolvedValue([{ id: 'd1', coreUserId: 'u1', title: 'โปสเตอร์', purgedAt }]);
    prisma.design.deleteMany.mockResolvedValue({ count: 1 });

    const count = await new RetentionService(asPrisma, asAudit).purgeExpired(NOW);
    const cutoff = new Date(NOW.getTime() - 30 * DAY);

    expect(count).toBe(1);
    expect(prisma.design.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { purgedAt: { lt: cutoff } } }));
    // เงื่อนไข purgedAt ซ้ำตอนลบ — งานที่ผู้ดูแลเพิ่งกู้คืนจะไม่ถูกลบ
    expect(prisma.design.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d1'] }, purgedAt: { lt: cutoff } } });
    expect(audit.recordSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'design.purge', targetKind: 'DESIGN', targetId: 'd1', metadata: expect.objectContaining({ reason: 'retention', ownerCoreUserId: 'u1' }) }),
    );
  });

  it('ไม่มีงานครบกำหนด = ไม่ลบอะไรและไม่บันทึก audit', async () => {
    const { prisma, audit, asPrisma, asAudit } = mocks();

    prisma.design.findMany.mockResolvedValue([]);

    expect(await new RetentionService(asPrisma, asAudit).purgeExpired(NOW)).toBe(0);
    expect(prisma.design.deleteMany).not.toHaveBeenCalled();
    expect(audit.recordSystem).not.toHaveBeenCalled();
  });

  it('runDaily ไม่โยน error ออกไป แม้ฐานข้อมูลล้ม', async () => {
    const { prisma, asPrisma, asAudit } = mocks();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    prisma.design.findMany.mockRejectedValue(new Error('db down'));

    await expect(new RetentionService(asPrisma, asAudit).runDaily()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('expireTrash', () => {
  it('งานในถังขยะเกิน 30 วันถูกตั้ง purgedAt (ไม่ลบแถว) และปิดลิงก์แชร์', async () => {
    const { prisma, audit, asPrisma, asAudit } = mocks();

    prisma.design.findMany.mockResolvedValue([{ id: 'd2', coreUserId: 'u2', title: 'สไลด์' }]);

    const count = await expireTrash(asPrisma, asAudit, { coreUserId: 'u2' }, NOW);

    expect(count).toBe(1);
    expect(prisma.design.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { coreUserId: 'u2', trashedAt: { lt: new Date(NOW.getTime() - 30 * DAY) }, purgedAt: null } }),
    );
    expect(prisma.design.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['d2'] }, purgedAt: null }, data: { purgedAt: NOW, linkAccess: 'NONE' } });
    expect(prisma.design.deleteMany).not.toHaveBeenCalled();
    expect(audit.recordSystem).toHaveBeenCalledWith(expect.objectContaining({ action: 'design.trash_expired', targetId: 'd2' }));
  });
});

describe('งานที่ลบถาวรแล้ว', () => {
  it('ไม่มีใครเปิดได้ แม้แต่เจ้าของ', () => {
    const row = { coreUserId: 'owner', linkAccess: 'EDIT', trashedAt: new Date(), purgedAt: new Date() };

    expect(accessOf(row, 'owner')).toBeNull();
    expect(accessOf(row, 'someone')).toBeNull();
    expect(accessOf({ ...row, purgedAt: null }, 'owner')).toBe('OWNER');
  });

  it('ระบบลบจริงหลังลบถาวร 30 วัน', () => {
    expect(purgeDateOf(NOW).getTime() - NOW.getTime()).toBe(30 * DAY);
  });
});
