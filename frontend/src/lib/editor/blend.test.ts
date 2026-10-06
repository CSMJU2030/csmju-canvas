import { describe, expect, it } from 'vitest';
import { BLEND_MODES, blendChannel, compositeOperation, cssBlendMode, isBlendMode } from './blend';

describe('โหมดผสมสี', () => {
  it('มีครบ 16 โหมดตาม CSS', () => {
    expect(BLEND_MODES.map((m) => m.key)).toEqual([
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
      'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
    ]);
  });

  it('แปลงเป็น globalCompositeOperation ของ canvas', () => {
    expect(compositeOperation(undefined)).toBe('source-over');
    expect(compositeOperation(null)).toBe('source-over');
    expect(compositeOperation('normal')).toBe('source-over');
    expect(compositeOperation('multiply')).toBe('multiply');
    expect(compositeOperation('luminosity')).toBe('luminosity');
    // ค่าแปลกจาก JSON ที่ CMS เขียนเอง → วาดปกติ (ไม่ส่งค่าอันตรายอย่าง destination-out ให้ canvas)
    expect(compositeOperation('destination-out')).toBe('source-over');
  });

  it('ค่า CSS mix-blend-mode สำหรับ SVG', () => {
    expect(cssBlendMode('normal')).toBeNull();
    expect(cssBlendMode('screen')).toBe('screen');
    expect(cssBlendMode('xor')).toBeNull();
    expect(isBlendMode('overlay')).toBe(true);
    expect(isBlendMode('xor')).toBe(false);
  });

  it('สูตรแยกช่องตรงกับ W3C', () => {
    expect(blendChannel('multiply', 0.5, 0.5)).toBe(0.25);
    expect(blendChannel('screen', 0.5, 0.5)).toBe(0.75);
    expect(blendChannel('overlay', 0.25, 1)).toBe(0.5);
    expect(blendChannel('darken', 0.3, 0.6)).toBe(0.3);
    expect(blendChannel('lighten', 0.3, 0.6)).toBe(0.6);
    expect(blendChannel('difference', 0.2, 0.9)).toBeCloseTo(0.7);
    expect(blendChannel('exclusion', 0.5, 0.5)).toBe(0.5);
    expect(blendChannel('color-dodge', 0.5, 0.5)).toBe(1);
    expect(blendChannel('color-burn', 0.5, 0.5)).toBe(0);
    expect(blendChannel('hard-light', 0.5, 0.25)).toBe(0.25);
    expect(blendChannel('soft-light', 0.5, 0.5)).toBe(0.5);
    expect(blendChannel('normal', 0.1, 0.9)).toBe(0.9);
  });
});
