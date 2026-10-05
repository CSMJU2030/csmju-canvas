import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  dayBoundary,
  GB,
  MB,
  metadataEntries,
  niceMax,
  parseQuotaInput,
  roleLabel,
  trendText,
} from './admin-format';

describe('admin-format', () => {
  it('ป้ายภาษาไทยของการกระทำที่รู้จัก · ที่ไม่รู้จักคืนชื่อเดิม', () => {
    expect(actionLabel('member.quota_change')).toBe('ปรับพื้นที่เก็บไฟล์');
    expect(actionLabel('design.purge')).toBe('ลบดีไซน์ถาวร');
    expect(actionLabel('something.new')).toBe('something.new');
  });

  it('roleLabel', () => {
    expect(roleLabel('lecturer')).toBe('อาจารย์');
    expect(roleLabel(null)).toBe('ยังไม่ทราบ');
  });

  it('metadata แบบย่อ: แปลงไบต์ ตัด null/false', () => {
    expect(
      metadataEntries({ fromBytes: String(500 * MB), toBytes: String(GB), belowCurrentUsage: false, preProvisioned: true, reason: null }),
    ).toEqual([
      ['จาก', '500.0 MB'],
      ['เป็น', '1.00 GB'],
      ['ตั้งล่วงหน้า', 'ใช่'],
    ]);
    expect(metadataEntries(null)).toEqual([]);
  });

  it('parseQuotaInput', () => {
    expect(parseQuotaInput('1.5', 'GB')).toBe(1.5 * GB);
    expect(parseQuotaInput('750', 'MB')).toBe(750 * MB);
    expect(parseQuotaInput('', 'GB')).toBeNull();
    expect(parseQuotaInput('-1', 'GB')).toBeNull();
    expect(parseQuotaInput('abc', 'MB')).toBeNull();
  });

  it('niceMax ปัดเป็น 1/2/5 × 10ⁿ', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(480)).toBe(500);
  });

  it('trendText', () => {
    expect(trendText({ metric: 'uploads', current: 5, previous: 4, changePercent: 25, direction: 'UP' })).toBe('เพิ่มขึ้น 25%');
    expect(trendText({ metric: 'uploads', current: 2, previous: 4, changePercent: -50, direction: 'DOWN' })).toBe('ลดลง 50%');
    expect(trendText({ metric: 'uploads', current: 3, previous: 0, changePercent: null, direction: 'UP' })).toBe('เพิ่มจาก 0');
    expect(trendText({ metric: 'uploads', current: 0, previous: 0, changePercent: null, direction: 'FLAT' })).toBe('เท่าเดิม');
  });

  it('dayBoundary ใช้เวลาไทย', () => {
    expect(dayBoundary('2026-10-06', 'start')).toBe('2026-10-06T00:00:00+07:00');
    expect(dayBoundary('2026-10-06', 'end')).toBe('2026-10-06T23:59:59.999+07:00');
    expect(dayBoundary('', 'start')).toBeUndefined();
  });
});
