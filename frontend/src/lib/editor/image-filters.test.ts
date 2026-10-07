import { describe, expect, it } from 'vitest';
import { applyColorEdits } from './image-filters';

function pixels(...colors: [number, number, number][]) {
  const data = new Uint8ClampedArray(colors.length * 4);

  colors.forEach(([r, g, b], i) => data.set([r, g, b, 255], i * 4));

  return { data, width: colors.length, height: 1, colorSpace: 'srgb' } as ImageData;
}

describe('applyColorEdits', () => {
  it('shifts only pixels near the chosen hue', () => {
    const img = pixels([220, 30, 30], [30, 30, 220], [128, 128, 128]);

    applyColorEdits(img, [{ color: 'rgb(220 30 30)', hue: 100, saturation: 0, lightness: 0 }]);

    const [r, g, b] = img.data.slice(0, 3);

    // แดง +60° → เหลือง/ส้ม: เขียวเพิ่มขึ้นมาก
    expect(g).toBeGreaterThan(150);
    expect(r).toBeGreaterThan(150);
    expect(b).toBeLessThan(60);
    expect([...img.data.slice(4, 7)]).toEqual([30, 30, 220]);
    expect([...img.data.slice(8, 11)]).toEqual([128, 128, 128]);
  });

  it('can desaturate a colour range', () => {
    const img = pixels([40, 200, 60]);

    applyColorEdits(img, [{ color: 'rgb(40, 200, 60)', hue: 0, saturation: -100, lightness: 0 }]);

    const [r, g, b] = img.data;

    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(5);
  });

  it('ignores edits with all-zero values', () => {
    const img = pixels([220, 30, 30]);

    applyColorEdits(img, [{ color: 'rgb(220 30 30)', hue: 0, saturation: 0, lightness: 0 }]);
    expect([...img.data.slice(0, 3)]).toEqual([220, 30, 30]);
  });
});
