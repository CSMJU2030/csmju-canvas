import { describe, expect, it } from 'vitest';
import { resolveFit } from './presenter';

/// พรีเซนต์เต็มจอ: อัตโนมัติ = เต็มจอเมื่อสัดส่วนใกล้จอ · ต่างมาก = เห็นทั้งหน้า (หัวเรื่องไม่ถูกตัดหาย)

describe('resolveFit', () => {
  const screen = { width: 1440, height: 900 };

  it('สไลด์ 16:9 บนจอ 16:10 → เต็มจอไม่มีขอบ', () => {
    expect(resolveFit('auto', screen, { width: 1920, height: 1080 })).toBe('fill');
  });

  it('โปสเตอร์/งานเกือบจัตุรัสบนจอแนวนอน → เห็นทั้งหน้า', () => {
    expect(resolveFit('auto', screen, { width: 960, height: 820 })).toBe('contain');
    expect(resolveFit('auto', screen, { width: 1123, height: 1587 })).toBe('contain');
  });

  it('ผู้ใช้เลือกเองแล้วใช้ตามนั้น · ยังไม่รู้ขนาดจอ = เห็นทั้งหน้า', () => {
    expect(resolveFit('fill', screen, { width: 960, height: 820 })).toBe('fill');
    expect(resolveFit('contain', screen, { width: 1920, height: 1080 })).toBe('contain');
    expect(resolveFit('auto', { width: 0, height: 0 }, { width: 1920, height: 1080 })).toBe('contain');
  });
});
