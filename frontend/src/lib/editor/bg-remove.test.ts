import { describe, expect, it } from 'vitest';
import { applyMask, backgroundMask, removedRatio, rgbToLab, toleranceToDelta } from './bg-remove';

/// รูปทดสอบ: พื้นขาว มีสี่เหลี่ยมแดงตรงกลาง และ "รู" สีขาวกลางสี่เหลี่ยม (ไม่แตะขอบรูป)
function sample(w = 40, h = 30) {
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inRect = x >= 10 && x < 30 && y >= 8 && y < 22;
      const inHole = x >= 18 && x < 22 && y >= 13 && y < 17;
      const c = inRect && !inHole ? [220, 30, 40] : [250, 250, 248];

      data.set([c[0], c[1], c[2], 255], i);
    }
  }

  return { data, width: w, height: h };
}

const at = (alpha: Uint8ClampedArray, w: number, x: number, y: number) => alpha[y * w + x];

describe('background removal', () => {
  it('removes the plain background connected to the edges and keeps the subject', () => {
    const px = sample();
    const { alpha, background } = backgroundMask(px, { mode: 'edges', tolerance: 40, softness: 0 });

    expect(at(alpha, 40, 0, 0)).toBe(0);
    expect(at(alpha, 40, 15, 10)).toBe(255);
    // รูสีขาวกลางตัวแบบไม่ต่อกับขอบ จึงยังอยู่ในโหมด edges
    expect(at(alpha, 40, 20, 15)).toBe(255);
    expect(background).toEqual([250, 250, 248]);
  });

  it('colour mode also clears enclosed holes', () => {
    const { alpha } = backgroundMask(sample(), { mode: 'color', tolerance: 40, softness: 0 });

    expect(at(alpha, 40, 20, 15)).toBe(0);
    expect(at(alpha, 40, 15, 10)).toBe(255);
  });

  it('uses a picked colour when given', () => {
    const { alpha } = backgroundMask(sample(), { mode: 'color', tolerance: 30, softness: 0, sample: [220, 30, 40] });

    expect(at(alpha, 40, 15, 10)).toBe(0);
    expect(at(alpha, 40, 0, 0)).toBe(255);
  });

  it('softens only the inside of the subject edge', () => {
    const { alpha } = backgroundMask(sample(), { mode: 'edges', tolerance: 40, softness: 2 });

    expect(at(alpha, 40, 9, 15)).toBe(0);
    expect(at(alpha, 40, 10, 15)).toBeGreaterThan(0);
    expect(at(alpha, 40, 10, 15)).toBeLessThan(255);
    expect(at(alpha, 40, 15, 15)).toBe(255);
  });

  it('writes alpha into the pixels and reports how much was removed', () => {
    const px = sample();
    const { alpha, background } = backgroundMask(px, { mode: 'edges', tolerance: 40, softness: 0 });

    applyMask(px, alpha, background);
    expect(px.data[3]).toBe(0);
    expect(px.data[(10 * 40 + 15) * 4 + 3]).toBe(255);
    expect(removedRatio(alpha)).toBeGreaterThan(0.6);
  });

  it('maps tolerance and colours sensibly', () => {
    expect(toleranceToDelta(0)).toBeLessThan(toleranceToDelta(100));
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 0);
  });
});
