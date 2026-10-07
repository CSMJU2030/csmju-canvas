import { describe, expect, it } from 'vitest';
import type { Pixels } from './image-effects';
import { applyLayerStyle, distanceTransform, hasLayerStyle, layerStylePad } from './layer-style';

/// วงกลมทึบสีแดงกลางผืนโปร่งใส (เหมือนรูปที่ลบพื้นหลังแล้ว)
function cutout(size = 20, radius = 5): Pixels {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - size / 2, y - size / 2) <= radius) data.set([255, 0, 0, 255], (y * size + x) * 4);
    }
  }

  return { data, width: size, height: size };
}

const px = (img: Pixels, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('ระยะห่าง (distance transform)', () => {
  it('ได้ระยะยุคลิดจริง', () => {
    const d = distanceTransform((i) => i === 0, 5, 5);

    expect(d[0]).toBe(0);
    expect(d[4]).toBe(4);
    expect(d[24]).toBeCloseTo(Math.hypot(4, 4));
  });

  it('ไม่มีจุดอ้างอิง = Infinity', () => {
    expect(distanceTransform(() => false, 3, 3)[4]).toBe(Infinity);
  });
});

describe('สไตล์เลเยอร์', () => {
  it('ไม่มีค่า = ไม่ต้องทำ', () => {
    expect(hasLayerStyle(null)).toBe(false);
    expect(hasLayerStyle({ outline: { size: 0, color: 'rgb(0 0 0)' } })).toBe(false);
    expect(hasLayerStyle({ innerShadow: { size: 3, color: 'rgb(0 0 0)', opacity: 0 } })).toBe(false);
    expect(hasLayerStyle({ glow: { size: 2, color: 'rgb(0 0 0)', opacity: 50 } })).toBe(true);
  });

  it('เส้นขอบสติกเกอร์ล้อมรูปร่างและขยายผืนออก', () => {
    const img = cutout();
    const { pixels, pad } = applyLayerStyle(img, { outline: { size: 10, color: 'rgb(255 255 255)' } }, 0.2);

    // size 10% × unit 0.2 = 2px
    expect(pad).toBe(layerStylePad({ outline: { size: 10, color: 'rgb(255 255 255)' } }, 0.2));
    expect(pixels.width).toBe(20 + pad * 2);
    // กลางรูปยังแดง
    expect(px(pixels, 10 + pad, 10 + pad)).toEqual([255, 0, 0, 255]);
    // ห่างขอบวงกลมออกไป 1px เป็นเส้นขอบสีขาว
    expect(px(pixels, 10 + pad + 6, 10 + pad)).toEqual([255, 255, 255, 255]);
    // ไกลออกไปยังโปร่งใส
    expect(px(pixels, 0, 0)[3]).toBe(0);
  });

  it('แสงเรืองอยู่รอบรูป จางลงตามระยะ', () => {
    const { pixels, pad } = applyLayerStyle(cutout(), { glow: { size: 20, color: 'rgb(0 255 0)', opacity: 100 } }, 0.2);
    const near = px(pixels, 10 + pad + 6, 10 + pad);
    const far = px(pixels, 10 + pad + 9, 10 + pad);

    expect(near[1]).toBe(255);
    expect(near[3]).toBeGreaterThan(far[3]);
    expect(near[3]).toBeGreaterThan(0);
  });

  it('เงาด้านในทำให้ขอบด้านในมืดลง แต่กลางรูปไม่เปลี่ยน', () => {
    const img = cutout(30, 12);
    const { pixels, pad } = applyLayerStyle(img, { innerShadow: { size: 15, color: 'rgb(0 0 0)', opacity: 100 } }, 0.2);
    const edge = px(pixels, 15 + pad + 11, 15 + pad);
    const center = px(pixels, 15 + pad, 15 + pad);

    expect(edge[0]).toBeLessThan(200);
    expect(center).toEqual([255, 0, 0, 255]);
  });
});
