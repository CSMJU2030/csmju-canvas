import { describe, expect, it } from 'vitest';
import { applyTones, autoLevels, curveLut, curveValues, hasTones, histogram, levelsLut, normalizeCurve, toneLuts } from './image-tones';

describe('ระดับสี (Levels)', () => {
  it('ค่าเริ่มต้นไม่เปลี่ยนอะไร', () => {
    const lut = levelsLut(null);

    for (let i = 0; i < 256; i++) expect(lut[i]).toBe(i);
  });

  it('จุดดำ/จุดขาวยืดช่วงให้เต็ม', () => {
    const lut = levelsLut({ black: 50, white: 200, gamma: 1, outBlack: 0, outWhite: 255 });

    expect(lut[0]).toBe(0);
    expect(lut[50]).toBe(0);
    expect(lut[125]).toBe(128);
    expect(lut[200]).toBe(255);
    expect(lut[255]).toBe(255);
  });

  it('แกมมามากกว่า 1 ทำให้โทนกลางสว่างขึ้น · น้อยกว่า 1 มืดลง', () => {
    expect(levelsLut({ black: 0, white: 255, gamma: 2, outBlack: 0, outWhite: 255 })[128]).toBe(Math.round(Math.sqrt(128 / 255) * 255));
    expect(levelsLut({ black: 0, white: 255, gamma: 0.5, outBlack: 0, outWhite: 255 })[128]).toBeLessThan(128);
  });

  it('ช่วงผลลัพธ์บีบเป็น [outBlack, outWhite]', () => {
    const lut = levelsLut({ black: 0, white: 255, gamma: 1, outBlack: 20, outWhite: 220 });

    expect(lut[0]).toBe(20);
    expect(lut[255]).toBe(220);
  });

  it('ระดับสีอัตโนมัติหาจุดดำ/ขาวจากฮิสโตแกรม', () => {
    const px = new Uint8ClampedArray(400 * 4);

    for (let i = 0; i < 400; i++) px.set([60 + (i % 100), 60 + (i % 100), 60 + (i % 100), 255], i * 4);

    const levels = autoLevels(histogram({ data: px }));

    expect(levels.red?.black).toBe(60);
    expect(levels.red?.white).toBe(159);
  });

  it('ฮิสโตแกรมข้ามพิกเซลโปร่งใส', () => {
    const h = histogram({ data: new Uint8ClampedArray([10, 10, 10, 255, 200, 200, 200, 0]) });

    expect(h.master[10]).toBe(1);
    expect(h.master[200]).toBe(0);
  });
});

describe('เส้นโค้ง (Curves)', () => {
  it('เติมปลายและเรียงจุด', () => {
    expect(normalizeCurve([[200, 180], [50, 40]])).toEqual([[0, 40], [50, 40], [200, 180], [255, 180]]);
    expect(normalizeCurve(null)).toEqual([[0, 0], [255, 255]]);
  });

  it('ผ่านทุกจุดที่กำหนด', () => {
    const values = curveValues([[0, 0], [64, 40], [192, 220], [255, 255]]);

    expect(values[64]).toBeCloseTo(40);
    expect(values[192]).toBeCloseTo(220);
  });

  it('ไม่พุ่งเกินระหว่างจุด (monotone) — เส้นที่ขึ้นตลอดต้องไม่ลง', () => {
    const values = curveValues([[0, 0], [100, 30], [110, 230], [255, 255]]);

    for (let i = 1; i < 256; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] - 1e-9);
    for (let i = 0; i < 256; i++) expect(values[i]).toBeLessThanOrEqual(255);
  });

  it('เส้นกลับด้านกลับสี', () => {
    const lut = curveLut([[0, 255], [255, 0]]);

    expect(lut[0]).toBe(255);
    expect(lut[255]).toBe(0);
    expect(lut[100]).toBe(155);
  });

  it('รวมระดับสีรายช่องกับเส้นโค้งรวม', () => {
    const [r, g] = toneLuts({ red: { black: 0, white: 128, gamma: 1, outBlack: 0, outWhite: 255 } }, { master: [[0, 255], [255, 0]] });

    expect(r[64]).toBe(255 - 128);
    expect(g[64]).toBe(255 - 64);
  });

  it('applyTones ไม่ทำอะไรเมื่อไม่มีการปรับ และไม่แตะ alpha', () => {
    expect(hasTones(null, { master: [[0, 0], [255, 255]] })).toBe(false);

    const px = new Uint8ClampedArray([10, 20, 30, 77]);

    applyTones({ data: px }, null, { master: [[0, 255], [255, 0]] });
    expect(Array.from(px)).toEqual([245, 235, 225, 77]);
  });
});
