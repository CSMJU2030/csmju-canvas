import { describe, expect, it } from 'vitest';
import { isSvgFile, rasterSize, svgSize, withExplicitSize } from './svg-raster';

describe('แปลง SVG เป็น PNG ก่อนอัปโหลด', () => {
  it('รู้จัก SVG จากชนิดหรือนามสกุล', () => {
    expect(isSvgFile({ type: 'image/svg+xml', name: 'a' })).toBe(true);
    expect(isSvgFile({ type: '', name: 'logo.SVG' })).toBe(true);
    expect(isSvgFile({ type: 'image/png', name: 'a.png' })).toBe(false);
  });

  it('อ่านขนาดจาก width/height หรือ viewBox', () => {
    expect(svgSize('<svg width="120px" height="60">')).toEqual({ width: 120, height: 60 });
    expect(svgSize('<svg viewBox="0 0 24 12">')).toEqual({ width: 24, height: 12 });
    expect(svgSize('<svg width="48" viewBox="0 0 24 12">')).toEqual({ width: 48, height: 24 });
    expect(svgSize('<svg width="100%">')).toEqual({ width: 1024, height: 1024 });
  });

  it('ไอคอนเล็กขยายให้คม · ไฟล์ใหญ่ย่อไม่เกิน 2048 · คงสัดส่วน', () => {
    expect(rasterSize({ width: 24, height: 12 })).toEqual({ width: 1024, height: 512 });
    expect(rasterSize({ width: 4000, height: 1000 })).toEqual({ width: 2048, height: 512 });
  });

  it('แทน width/height ของแท็ก svg ด้วยขนาดที่วาดจริง', () => {
    expect(withExplicitSize('<svg viewBox="0 0 1 1" width="50%"><g/></svg>', { width: 10, height: 10 })).toBe('<svg viewBox="0 0 1 1" width="10" height="10"><g/></svg>');
  });
});
