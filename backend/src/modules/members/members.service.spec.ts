import { describe, expect, it, vi } from 'vitest';
import { AssetsService, effectiveQuota, MAX_QUOTA_BYTES, QUOTA_BYTES_PER_USER } from '../assets/assets.service.js';
import { likePattern, MembersService } from './members.service.js';

const GB = 1024 * 1024 * 1024;
const ACTOR = { coreUserId: 'staff-01', coreRole: 'staff' } as never;

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    coreUserId: 'user-002',
    storageQuotaBytes: null,
    lastSeenAt: new Date('2026-10-05T03:00:00Z'),
    createdAt: new Date('2026-10-01T03:00:00Z'),
    updatedAt: new Date('2026-10-05T03:00:00Z'),
    ...overrides,
  };
}

function setup(before: ReturnType<typeof member> | null, usedBytes: number) {
  let stored = before;
  const prisma = {
    subsystemMember: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(before)),
      upsert: vi.fn().mockImplementation(({ update, create }: { update: object; create: object }) => {
        stored = before ? { ...before, ...update } : member({ ...create, lastSeenAt: null });
        return Promise.resolve(stored);
      }),
      findMany: vi.fn().mockImplementation(() => Promise.resolve(stored ? [stored] : [])),
    },
    asset: {
      groupBy: vi.fn().mockResolvedValue([{ coreUserId: 'user-002', _sum: { sizeBytes: usedBytes }, _count: { _all: 12 } }]),
    },
    design: { groupBy: vi.fn().mockResolvedValue([{ coreUserId: 'user-002', _count: { _all: 4 } }]) },
  };
  const assets = { usedBytes: vi.fn().mockResolvedValue(usedBytes) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new MembersService(prisma as never, assets as never, audit as never);

  return { service, prisma, audit };
}

describe('effectiveQuota', () => {
  it('null = ค่าเริ่มต้น · ค่าที่ผู้ดูแลตั้งใช้แทน', () => {
    expect(effectiveQuota(null)).toBe(QUOTA_BYTES_PER_USER);
    expect(effectiveQuota(BigInt(2 * GB))).toBe(2 * GB);
    expect(MAX_QUOTA_BYTES).toBe(5 * GB);
  });
});

describe('MembersService.updateQuota', () => {
  it('เพิ่มโควตาให้สมาชิกที่ใกล้เต็ม แล้วบันทึก audit member.quota_change', async () => {
    const used = 480 * 1024 * 1024;
    const { service, prisma, audit } = setup(member(), used);
    const result = await service.updateQuota(ACTOR, 'user-002', { storageQuotaBytes: GB, reason: ' ขอพื้นที่ทำโปสเตอร์ ' });

    expect(prisma.subsystemMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { coreUserId: 'user-002' }, update: { storageQuotaBytes: BigInt(GB) } }),
    );
    expect(result).toMatchObject({
      coreUserId: 'user-002',
      storageQuotaBytes: String(GB),
      storageUsedBytes: String(used),
      quotaOverridden: true,
      usagePercent: 46.9,
      designCount: 4,
      assetCount: 12,
    });
    expect(audit.record).toHaveBeenCalledWith(ACTOR, {
      action: 'member.quota_change',
      targetKind: 'MEMBER',
      targetId: 'user-002',
      metadata: {
        fromBytes: String(QUOTA_BYTES_PER_USER),
        toBytes: String(GB),
        resetToDefault: false,
        usedBytes: String(used),
        belowCurrentUsage: false,
        preProvisioned: false,
        reason: 'ขอพื้นที่ทำโปสเตอร์',
      },
    });
  });

  it('null = กลับไปใช้ค่าเริ่มต้น และบอกใน audit ถ้าต่ำกว่าที่ใช้อยู่', async () => {
    const used = 700 * 1024 * 1024;
    const { service, audit } = setup(member({ storageQuotaBytes: BigInt(GB) }), used);
    const result = await service.updateQuota(ACTOR, 'user-002', { storageQuotaBytes: null });

    expect(result.quotaOverridden).toBe(false);
    expect(result.storageQuotaBytes).toBe(String(QUOTA_BYTES_PER_USER));
    expect(audit.record).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({
        metadata: expect.objectContaining({ fromBytes: String(GB), resetToDefault: true, belowCurrentUsage: true, reason: null }),
      }),
    );
  });

  it('ตั้งล่วงหน้าให้คนที่ยังไม่เคยเปิดแอปได้ (preProvisioned)', async () => {
    const { service, audit } = setup(null, 0);

    await service.updateQuota(ACTOR, 'user-002', { storageQuotaBytes: 2 * GB });

    expect(audit.record).toHaveBeenCalledWith(ACTOR, expect.objectContaining({ metadata: expect.objectContaining({ preProvisioned: true }) }));
  });
});

describe('AssetsService.quotaBytes', () => {
  it('ใช้โควตาที่ผู้ดูแลปรับให้ในการตรวจอัปโหลด', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({ storageQuotaBytes: BigInt(2 * GB) }).mockResolvedValueOnce(null);
    const assets = new AssetsService({ subsystemMember: { findUnique } } as never);

    expect(await assets.quotaBytes('user-002')).toBe(2 * GB);
    expect(await assets.quotaBytes('user-003')).toBe(QUOTA_BYTES_PER_USER);
  });
});

describe('likePattern', () => {
  it('หนีอักขระพิเศษของ LIKE', () => {
    expect(likePattern(undefined)).toBeNull();
    expect(likePattern('  ')).toBeNull();
    expect(likePattern('a_b%')).toBe('%a\\_b\\%%');
  });
});
