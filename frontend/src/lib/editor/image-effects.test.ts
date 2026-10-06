import { describe, expect, it } from 'vitest';
import {
  EFFECT_DEFS, activeEffects, applyEffect, applyEffects, boxBlurPlane, effectColors, effectParams, gaussianBlur, motionBlur, newEffect, parseColor, seededRandom, type Pixels,
} from './image-effects';
import { needsPixels, pipelineKey, runPipeline } from './image-pipeline';
import type { ImageEffect, ImageEffectKind } from './types';

/// บัฟเฟอร์ขนาดเล็กที่หน้าตาเหมือน ImageData (ไม่ต้องใช้ canvas)
function make(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = fill(x, y);
      const i = (y * w + x) * 4;

      data.set([r, g, b, a], i);
    }
  }

  return { data, width: w, height: h };
}

const at = (img: Pixels, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const gradient = (w = 16, h = 16) => make(w, h, (x) => [Math.round((x / (w - 1)) * 255), Math.round((x / (w - 1)) * 255), Math.round((x / (w - 1)) * 255)]);
const checker = (w = 16, h = 16) => make(w, h, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? [255, 255, 255] : [0, 0, 0]);
const fx = (kind: ImageEffectKind, params: Record<string, number> = {}, colors?: string[]): ImageEffect => {
  const e = newEffect(kind);

  return { ...e, params: { ...e.params, ...params }, ...(colors ? { colors } : {}) };
};

describe('ตารางเอฟเฟกต์', () => {
  it('ทุกชนิดมีค่าเริ่มต้นอยู่ในช่วง และสร้างเอฟเฟกต์ใหม่ได้', () => {
    expect(EFFECT_DEFS.length).toBeGreaterThanOrEqual(20);

    for (const def of EFFECT_DEFS) {
      for (const p of def.params) {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }

      const e = newEffect(def.kind);

      expect(effectParams(e)).toEqual(Object.fromEntries(def.params.map((p) => [p.key, p.default])));
    }
  });

  it('บีบค่าที่เกินช่วงและเติมค่าที่ขาด', () => {
    expect(effectParams({ kind: 'posterize', params: { levels: 99 } }).levels).toBe(12);
    expect(effectParams({ kind: 'blur' }).radius).toBe(1);
  });

  it('อ่านสี rgb() ทั้งแบบเว้นวรรคและจุลภาค', () => {
    expect(parseColor('rgb(1 2 3)')).toEqual([1, 2, 3]);
    expect(parseColor('rgba(4, 5, 6, 0.5)')).toEqual([4, 5, 6]);
    expect(parseColor('blue')).toBeNull();
    expect(effectColors({ kind: 'duotone', colors: ['nope', 'rgb(9 9 9)'] })).toEqual([[35, 20, 95], [9, 9, 9]]);
  });

  it('ข้ามเอฟเฟกต์ที่ปิดไว้และชนิดที่ไม่รู้จัก', () => {
    expect(activeEffects([fx('invert'), { ...fx('invert'), off: true }, { kind: 'nope' as ImageEffectKind }])).toHaveLength(1);
  });

  it('เลขสุ่มกำหนดได้ ได้ลำดับเดิมทุกครั้ง', () => {
    const a = seededRandom(5);
    const b = seededRandom(5);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('เอฟเฟกต์สี', () => {
  it('ดูโอโทน: ดำ → สีเงา ขาว → สีแสง', () => {
    const img = gradient();

    applyEffect(img, fx('duotone', { amount: 100 }, ['rgb(10 20 30)', 'rgb(200 210 220)']));
    expect(at(img, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(at(img, 15, 0)).toEqual([200, 210, 220, 255]);
  });

  it('แผนที่ไล่สี 3 สี: โทนกลางได้สีกลาง · ความแรง 0 ไม่เปลี่ยน', () => {
    const img = make(1, 1, () => [128, 128, 128]);

    applyEffect(img, fx('gradient-map', { amount: 100 }, ['rgb(0 0 0)', 'rgb(255 0 0)', 'rgb(255 255 255)']));
    expect(at(img, 0, 0)[0]).toBeGreaterThan(250);
    expect(at(img, 0, 0)[1]).toBeLessThan(5);

    const same = make(1, 1, () => [50, 60, 70]);

    applyEffect(same, fx('gradient-map', { amount: 0 }));
    expect(at(same, 0, 0)).toEqual([50, 60, 70, 255]);
  });

  it('โปสเตอร์ 2 ระดับเหลือแค่ 0 กับ 255', () => {
    const img = gradient();

    applyEffect(img, fx('posterize', { levels: 2 }));
    for (let i = 0; i < img.data.length; i += 4) expect([0, 255]).toContain(img.data[i]);
  });

  it('ขาวดำสองระดับตัดตามจุดตัด', () => {
    const img = gradient();

    applyEffect(img, fx('threshold', { level: 128 }, ['rgb(0 0 0)', 'rgb(255 255 255)']));
    expect(at(img, 3, 0)).toEqual([0, 0, 0, 255]);
    expect(at(img, 12, 0)).toEqual([255, 255, 255, 255]);
  });

  it('กลับสี 100% และ 50%', () => {
    const img = make(2, 1, () => [0, 100, 255]);

    applyEffect(img, fx('invert', { amount: 100 }));
    expect(at(img, 0, 0)).toEqual([255, 155, 0, 255]);

    const half = make(1, 1, () => [0, 0, 0]);

    applyEffect(half, fx('invert', { amount: 50 }));
    expect(at(half, 0, 0).slice(0, 3)).toEqual([128, 128, 128]);
  });

  it('ทับสีแบบคูณบนสีขาวได้สีที่ทับ · บนสีดำยังดำ', () => {
    const img = make(2, 1, (x) => (x === 0 ? [255, 255, 255] : [0, 0, 0]));

    applyEffect(img, fx('color-overlay', { amount: 100, mode: 1 }, ['rgb(255 0 0)']));
    expect(at(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(at(img, 1, 0)).toEqual([0, 0, 0, 255]);
  });
});

describe('พื้นผิวและลวดลาย', () => {
  it('โมเสก: ทุกพิกเซลในช่องเดียวกันมีสีเดียวกัน (ค่าเฉลี่ย)', () => {
    const img = gradient(8, 8);

    applyEffect(img, fx('pixelate', { size: 10 }), 0.4);
    // size 10% × unit 0.4 = 4px
    expect(at(img, 0, 0)).toEqual(at(img, 3, 3));
    expect(at(img, 4, 0)).not.toEqual(at(img, 3, 0));
  });

  it('ฮาล์ฟโทน: พื้นสว่างเป็นกระดาษ พื้นมืดเป็นหมึก', () => {
    const light = make(24, 24, () => [255, 255, 255]);
    const dark = make(24, 24, () => [0, 0, 0]);
    const e = fx('halftone', { size: 25, amount: 100 }, ['rgb(0 0 0)', 'rgb(255 255 255)']);

    applyEffect(light, e);
    applyEffect(dark, e);
    expect(at(light, 12, 12)).toEqual([255, 255, 255, 255]);
    const ink = Array.from(dark.data).filter((_, i) => i % 4 === 0);

    expect(ink.reduce((a, b) => a + b, 0) / ink.length).toBeLessThan(40);
  });

  it('เกรน: กำหนดผลได้ (seed เดิม = ผลเดิม) และเปลี่ยนพิกเซลจริง', () => {
    const a = make(8, 8, () => [128, 128, 128]);
    const b = make(8, 8, () => [128, 128, 128]);

    applyEffect(a, fx('grain', { amount: 100, seed: 3 }));
    applyEffect(b, fx('grain', { amount: 100, seed: 3 }));
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(new Set(Array.from(a.data).filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(3);
  });

  it('กลิตช์: แยกช่องแดงไปทางขวา ช่องน้ำเงินไปทางซ้าย', () => {
    const img = make(10, 1, (x) => (x === 5 ? [255, 255, 255] : [0, 0, 0]));

    applyEffect(img, fx('glitch', { offset: 0.2, slices: 0 }), 10);
    // offset 0.2% × unit 10 = 2px → แดงอ่านจาก x+2 · น้ำเงินอ่านจาก x−2
    expect(at(img, 3, 0)[0]).toBe(255);
    expect(at(img, 7, 0)[2]).toBe(255);
    expect(at(img, 5, 0)[1]).toBe(255);
  });
});

describe('ศิลปะ', () => {
  it('ภาพร่างดินสอ: พื้นเรียบเป็นกระดาษขาว ขอบเป็นเส้นเข้ม', () => {
    const img = make(16, 16, (x) => (x < 8 ? [255, 255, 255] : [0, 0, 0]));

    applyEffect(img, fx('sketch', { amount: 100, detail: 10 }));
    expect(at(img, 2, 8)[0]).toBe(255);
    expect(at(img, 7, 8)[0]).toBeLessThan(100);
  });

  it('ขอบเรืองแสง: พื้นเรียบกลายเป็นดำ', () => {
    const img = make(16, 16, (x) => (x < 8 ? [200, 50, 50] : [20, 20, 200]));

    applyEffect(img, fx('edges', { amount: 100, detail: 10 }));
    expect(at(img, 2, 8).slice(0, 3)).toEqual([0, 0, 0]);
    expect(Math.max(...at(img, 8, 8).slice(0, 3))).toBeGreaterThan(50);
  });

  it('นูนต่ำ: พื้นเรียบเป็นเทากลาง', () => {
    const img = make(8, 8, () => [10, 200, 90]);

    applyEffect(img, fx('emboss', { amount: 100 }));
    expect(at(img, 4, 4).slice(0, 3)).toEqual([128, 128, 128]);
  });

  it('ภาพสีน้ำมัน: คงขอบคม (ไม่เบลอข้ามขอบ) และเปลี่ยนจุดรบกวนเป็นสีพื้น', () => {
    const img = make(20, 20, (x, y) => (x === 5 && y === 5 ? [255, 255, 255] : x < 10 ? [0, 0, 0] : [255, 255, 255]));

    applyEffect(img, fx('oil', { radius: 8 }), 1);
    expect(at(img, 5, 5)[0]).toBeLessThan(40);
    expect(at(img, 9, 10)[0]).toBe(0);
    expect(at(img, 10, 10)[0]).toBe(255);
  });
});

describe('เบลอ', () => {
  it('box blur ของระนาบคงค่าเฉลี่ยของพื้นเรียบ', () => {
    const plane = new Float32Array(25).fill(7);

    boxBlurPlane(plane, 5, 5, 2);
    for (const v of plane) expect(v).toBeCloseTo(7);
  });

  it('เกาส์: ลายตารางหมากรุกกลายเป็นเทา · รูปทึบยังทึบ', () => {
    const img = checker(32, 32);

    gaussianBlur(img, 3);
    expect(at(img, 16, 16)[0]).toBeGreaterThan(90);
    expect(at(img, 16, 16)[0]).toBeLessThan(165);
    expect(at(img, 16, 16)[3]).toBe(255);
  });

  it('เกาส์บนรูปโปร่งใส: สีขอบไม่ดำลง (premultiplied alpha)', () => {
    const img = make(16, 16, (x) => (x < 8 ? [255, 0, 0, 255] : [0, 0, 0, 0]));

    gaussianBlur(img, 2);
    const edge = at(img, 8, 8);

    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
    expect(edge[0]).toBeGreaterThan(245);
  });

  it('เบลอเคลื่อนไหวแนวนอนไม่ทำให้แนวตั้งเบลอ', () => {
    // แถบแนวนอน (เปลี่ยนตาม y) → เบลอแนวนอนต้องไม่เปลี่ยนอะไร
    const rows = make(16, 16, (_, y) => (y < 8 ? [0, 0, 0] : [255, 255, 255]));

    motionBlur(rows, 6, 0);
    expect(at(rows, 8, 7)[0]).toBeLessThan(3);
    expect(at(rows, 8, 8)[0]).toBeGreaterThan(252);

    // แถบแนวตั้ง → เบลอแนวนอนต้องเกลี่ยขอบ
    const cols = make(16, 16, (x) => (x < 8 ? [0, 0, 0] : [255, 255, 255]));

    motionBlur(cols, 6, 0);
    expect(at(cols, 8, 8)[0]).toBeGreaterThan(60);
    expect(at(cols, 8, 8)[0]).toBeLessThan(230);
  });

  it('เบลอเคลื่อนไหวแนวตั้ง (90°) เกลี่ยแถบแนวนอน', () => {
    const rows = make(16, 16, (_, y) => (y < 8 ? [0, 0, 0] : [255, 255, 255]));

    motionBlur(rows, 6, 90);
    expect(at(rows, 8, 8)[0]).toBeGreaterThan(60);
    expect(at(rows, 8, 8)[0]).toBeLessThan(230);
  });

  it('เบลอซูม: ใจกลางยังคม ขอบนอกเบลอ', () => {
    const img = checker(48, 48);
    const center = at(img, 24, 24);

    applyEffect(img, fx('zoom-blur', { amount: 100, x: 50, y: 50 }));
    expect(at(img, 24, 24)).toEqual(center);

    const corner = at(img, 2, 2)[0];

    expect(corner).toBeGreaterThan(20);
    expect(corner).toBeLessThan(235);
  });

  it('ทิลต์ชิฟต์: แถบกลางคม ขอบบนล่างเบลอ', () => {
    const img = checker(32, 32);
    const middle = at(img, 10, 16);

    applyEffect(img, fx('tilt-shift', { position: 50, band: 30, blur: 10 }));
    expect(at(img, 10, 16)).toEqual(middle);
    expect(at(img, 10, 0)[0]).toBeGreaterThan(40);
    expect(at(img, 10, 0)[0]).toBeLessThan(215);
  });
});

describe('แสงและเลนส์', () => {
  it('สีเหลื่อม: กึ่งกลางไม่ขยับ ช่องเขียวไม่เปลี่ยน', () => {
    const img = make(21, 21, (x) => [x * 12, x * 12, x * 12]);
    const before = Array.from(img.data);

    applyEffect(img, fx('chromatic', { shift: 5 }));
    expect(at(img, 10, 10)).toEqual(before.slice((10 * 21 + 10) * 4, (10 * 21 + 10) * 4 + 4));
    for (let i = 1; i < img.data.length; i += 4) expect(img.data[i]).toBe(before[i]);
    expect(at(img, 20, 10)[0]).not.toBe(before[(10 * 21 + 20) * 4]);
  });

  it('แสงรั่ว: สว่างขึ้นใกล้จุดแสง ไม่มืดลงที่ใด', () => {
    const img = make(20, 20, () => [60, 60, 60]);

    applyEffect(img, fx('light-leak', { amount: 100, angle: 0, size: 60 }, ['rgb(255 120 40)']));
    expect(at(img, 19, 10)[0]).toBeGreaterThan(150);
    for (let i = 0; i < img.data.length; i += 4) expect(img.data[i]).toBeGreaterThanOrEqual(60);
  });
});

describe('ตัวประมวลผลรวม', () => {
  it('เรียงทำตามลำดับ: กลับสีแล้วขาวดำสองระดับ ≠ สลับลำดับ', () => {
    const a = make(1, 1, () => [40, 40, 40]);
    const b = make(1, 1, () => [40, 40, 40]);
    const invert = fx('invert');
    const threshold = fx('threshold', { level: 128 }, ['rgb(0 0 0)', 'rgb(255 255 255)']);

    applyEffects(a, [invert, threshold]);
    applyEffects(b, [threshold, invert]);
    expect(at(a, 0, 0)[0]).toBe(255);
    expect(at(b, 0, 0)[0]).toBe(255 - 0);
    applyEffects(b, [{ ...invert, off: true }]);
    expect(at(b, 0, 0)[0]).toBe(255);
  });

  it('ไม่มีงานพิกเซล = ไม่ต้องอ่านพิกเซล · เอฟเฟกต์ที่ปิดไม่เปลี่ยนคีย์แคช', () => {
    expect(needsPixels({})).toBe(false);
    expect(needsPixels({ effects: [{ ...fx('invert'), off: true }] })).toBe(false);
    expect(needsPixels({ effects: [fx('invert')] })).toBe(true);
    expect(needsPixels({ curves: { master: [[0, 0], [255, 255]] } })).toBe(false);
    expect(needsPixels({ levels: { master: { black: 10, white: 255, gamma: 1, outBlack: 0, outWhite: 255 } } })).toBe(true);
    expect(pipelineKey({ effects: [fx('blur')] })).toBe(pipelineKey({ effects: [fx('blur'), { ...fx('invert'), off: true }] }));
    expect(pipelineKey({ effects: [fx('blur')] })).not.toBe(pipelineKey({ effects: [fx('blur', { radius: 2 })] }));
  });

  it('runPipeline ใช้ฟิลเตอร์ ระดับสี และเอฟเฟกต์ร่วมกัน', () => {
    const img = make(2, 1, () => [100, 100, 100]);

    runPipeline(img, { filter: 'mono', levels: { master: { black: 0, white: 128, gamma: 1, outBlack: 0, outWhite: 255 } }, effects: [fx('invert')] });
    expect(at(img, 0, 0)[0]).toBeLessThan(80);
  });
});
