import { describe, expect, it } from 'vitest';
import { inpaint, splitLayers, textColorIn } from './magic-layers';
import { grabCut, type CutoutPixels } from './smart-cutout';

/// แยกเลเยอร์: อุดรูด้วยสีรอบ ๆ · วัตถุเป็นชิ้นโปร่งใส · พื้นหลังไม่เหลือเงาวัตถุ · สีตัวอักษรจากกรอบ

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): CutoutPixels {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;

      data.set([r, g, b, 255], i);
    }
  }

  return { data, width, height };
}

const at = (px: CutoutPixels, x: number, y: number) => Array.from(px.data.slice((y * px.width + x) * 4, (y * px.width + x) * 4 + 4));

describe('inpaint', () => {
  it('รูตรงกลางพื้นไล่สีแนวนอน ได้สีที่ต่อเนื่องกับรอบ ๆ', () => {
    const px = image(64, 32, (x) => [x * 4, 100, 200]);
    const mask = new Uint8Array(64 * 32);

    for (let y = 8; y < 24; y++) for (let x = 24; x < 40; x++) mask[y * 64 + x] = 1;
    for (let y = 8; y < 24; y++) for (let x = 24; x < 40; x++) px.data.set([255, 0, 0, 255], (y * 64 + x) * 4);

    inpaint(px, mask);

    const [r, g, b] = at(px, 32, 16);

    expect(Math.abs(r - 128)).toBeLessThan(30);
    expect(Math.abs(g - 100)).toBeLessThan(5);
    expect(Math.abs(b - 200)).toBeLessThan(5);
    // ส่วนที่ไม่ได้อุดไม่เปลี่ยน
    expect(at(px, 2, 2)).toEqual([8, 100, 200, 255]);
  });
});

describe('splitLayers', () => {
  it('วัตถุสีแดงบนพื้นขาว → ชิ้นวัตถุโปร่งรอบ ๆ · พื้นหลังตรงที่เคยมีวัตถุกลายเป็นขาว', () => {
    const W = 80;
    const H = 60;
    const inSquare = (x: number, y: number) => x >= 25 && x < 55 && y >= 18 && y < 42;
    const px = image(W, H, (x, y) => (inSquare(x, y) ? [200, 40, 40] : [245, 245, 245]));
    const result = grabCut(px);
    const split = splitLayers(px, result, new Set(), [], 0);

    expect(split.objects).toHaveLength(1);

    const piece = split.objects[0];

    expect(piece.box.x0).toBeLessThan(25 / W);
    expect(piece.box.x1).toBeGreaterThan(54 / W);
    // มุมของชิ้นอยู่นอกวัตถุ = โปร่ง · กลางชิ้น = แดงทึบ
    expect(at(piece.pixels, 0, 0)[3]).toBe(0);
    expect(at(piece.pixels, Math.floor(piece.pixels.width / 2), Math.floor(piece.pixels.height / 2))).toEqual([200, 40, 40, 255]);

    const [r, g, b] = at(split.background, 40, 30);

    expect(Math.min(r, g, b)).toBeGreaterThan(200);
  });

  it('กรอบข้อความ → สีตัวอักษรจากกลุ่มส่วนน้อย · ตัวอักษรถูกลบออกจากพื้นหลัง', () => {
    const W = 120;
    const H = 40;
    // "ตัวอักษร" สีน้ำเงินเข้มเป็นแท่งบาง ๆ บนพื้นเหลือง
    const stroke = (x: number, y: number) => y >= 14 && y < 26 && x >= 20 && x < 100 && x % 6 < 2;
    const px = image(W, H, (x, y) => (stroke(x, y) ? [20, 30, 120] : [250, 220, 90]));
    const box = { x0: 15 / W, y0: 10 / H, x1: 105 / W, y1: 30 / H };

    expect(textColorIn(px, box).color).toEqual([20, 30, 120]);

    const split = splitLayers(px, { width: 4, height: 4, mask: new Uint8Array(16), labels: new Int32Array(16).fill(-1), objects: [] }, new Set(), [box], 0);

    expect(split.texts[0].color).toEqual([20, 30, 120]);

    const [r, g, b] = at(split.background, 20, 20);

    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(180);
    expect(b).toBeLessThan(140);
  });
});
