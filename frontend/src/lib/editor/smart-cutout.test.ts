import { describe, expect, it } from 'vitest';
import { applyCutout, grabCut, gridMinCut, keptMask, objectAt, refineAlpha, type CutoutPixels } from './smart-cutout';

/// ลบพื้นหลังอัจฉริยะ (GrabCut เขียนเอง) — ทดสอบด้วยภาพสังเคราะห์ที่รู้คำตอบแน่นอน

type Rgb = [number, number, number];

function image(width: number, height: number, paint: (x: number, y: number) => Rgb): CutoutPixels {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  return { data, width, height };
}

/// สุ่มแบบกำหนดเมล็ด — ใส่ noise ให้ภาพเหมือนรูปถ่าย แต่ผลเทสต์คงที่
function noise(seed: number) {
  let s = seed;

  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;

    return (s / 4294967296 - 0.5) * 24;
  };
}

function accuracy(mask: Uint8Array, width: number, truth: (x: number, y: number) => boolean): number {
  let right = 0;

  for (let i = 0; i < mask.length; i++) {
    if (Boolean(mask[i]) === truth(i % width, Math.floor(i / width))) right++;
  }

  return right / mask.length;
}

describe('gridMinCut', () => {
  it('ตัดตามเส้นที่ถูกที่สุด: เส้นเชื่อมอ่อนตรงกลาง แบ่งซ้าย (source) ขวา (sink)', () => {
    const width = 6;
    const height = 3;
    const n = width * height;
    const terminal = new Float64Array(n);
    const links = new Float64Array(n * 4);

    for (let y = 0; y < height; y++) {
      terminal[y * width] = 100;
      terminal[y * width + width - 1] = -100;
    }

    for (let p = 0; p < n; p++) {
      const x = p % width;

      for (let d = 0; d < 4; d++) links[d * n + p] = x === 2 && d !== 1 ? 0.1 : 5;
    }

    const cut = gridMinCut(width, height, terminal, Float64Array.from(links), Float64Array.from(links));

    for (let y = 0; y < height; y++) {
      expect([...cut.slice(y * width, y * width + width)]).toEqual([1, 1, 1, 0, 0, 0]);
    }
  });
});

describe('grabCut', () => {
  const W = 80;
  const H = 60;
  const rand = noise(7);
  const inSquare = (x: number, y: number) => x >= 25 && x < 55 && y >= 18 && y < 42;

  it('หาวัตถุสีแดงบนพื้นขาวได้เองโดยไม่ต้องบอก (แม่นเกิน 97%)', () => {
    const px = image(W, H, (x, y) =>
      inSquare(x, y) ? [200 + rand(), 40 + rand(), 40 + rand()] : [245 + rand() / 3, 245 + rand() / 3, 245 + rand() / 3],
    );
    const result = grabCut(px);

    expect(accuracy(result.mask, W, inSquare)).toBeGreaterThan(0.97);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].area).toBeCloseTo((30 * 24) / (W * H), 1);
    expect(objectAt(result, 0.5, 0.5)).toBe(0);
    expect(objectAt(result, 0.02, 0.02)).toBe(-1);
  });

  it('วัตถุที่ล้นขอบล่าง (คนครึ่งตัว) ไม่ถูกตัดตรงขอบรูป', () => {
    const body = (x: number, y: number) => x >= 28 && x < 52 && y >= 20;
    const px = image(W, H, (x, y) => (body(x, y) ? [40 + rand(), 70 + rand(), 160 + rand()] : [230 + rand() / 3, 225 + rand() / 3, 210 + rand() / 3]));
    const result = grabCut(px);
    const bottomRow = result.mask.slice((H - 1) * W, H * W);

    expect(accuracy(result.mask, W, body)).toBeGreaterThan(0.97);
    expect(bottomRow[40]).toBe(1);
    expect(bottomRow[5]).toBe(0);
  });

  it('ฉากสตูดิโอไล่เฉดจากเข้มถึงสว่าง + พื้นโต๊ะสีอ่อนที่ขอบล่าง ถูกลบทั้งฉาก (เคยค้างเป็นแถบเทา)', () => {
    const vase = (x: number, y: number) => (x - 40) ** 2 / 14 ** 2 + (y - 32) ** 2 / 16 ** 2 < 1;
    const px = image(W, H, (x, y) => {
      if (vase(x, y)) return [215 + rand() / 2, 205 + rand() / 2, 170 + rand() / 2];

      // ฉากบนมืดไล่ลงมาสว่าง · ล่าง 1/3 เป็นพื้นโต๊ะเทาอ่อนที่สว่างไปทางขวา (vignette)
      const v = y < 40 ? 30 + y * 3 : 150 + x * 0.8;

      return [v + rand() / 4, v + rand() / 4, v + rand() / 4];
    });
    const result = grabCut(px);

    expect(accuracy(result.mask, W, vase)).toBeGreaterThan(0.97);
    expect(result.objects).toHaveLength(1);
  });

  it('สองวัตถุแยกชิ้น เลือกเก็บชิ้นเดียวได้ · ชิ้นใหญ่อยู่ลำดับแรก', () => {
    const big = (x: number, y: number) => x >= 8 && x < 38 && y >= 15 && y < 45;
    const small = (x: number, y: number) => x >= 52 && x < 68 && y >= 22 && y < 38;
    const px = image(W, H, (x, y) =>
      big(x, y) ? [30 + rand(), 150 + rand(), 60 + rand()] : small(x, y) ? [220 + rand(), 170 + rand(), 20 + rand()] : [250, 250, 250],
    );
    const result = grabCut(px);

    expect(result.objects).toHaveLength(2);
    expect(result.objects[0].area).toBeGreaterThan(result.objects[1].area);

    const smallId = objectAt(result, 60 / W, 30 / H);
    const onlyBig = keptMask(result, new Set([smallId]));

    expect(accuracy(onlyBig, W, big)).toBeGreaterThan(0.97);
  });

  it('แปรง "ลบ" บังคับตัดส่วนที่ระบบเดาว่าเป็นวัตถุ · กรอบบังคับนอกกรอบเป็นพื้นหลัง', () => {
    const px = image(W, H, (x, y) => (inSquare(x, y) ? [200, 40, 40] : [245, 245, 245]));
    const erased = grabCut(px, {
      rect: null,
      strokes: [{ mode: 'remove', radius: 0.05, points: [{ x: 0.35, y: 0.2 }, { x: 0.35, y: 0.75 }] }],
    });

    expect(erased.mask[30 * W + 28]).toBe(0);
    expect(erased.mask[30 * W + 50]).toBe(1);

    // กรอบรอบวัตถุสีแดง → วัตถุสีน้ำเงินนอกกรอบถูกตัดแม้จะเด่นจากพื้นหลัง
    const two = image(W, H, (x, y) =>
      inSquare(x, y) ? [200, 40, 40] : x >= 4 && x < 16 && y >= 20 && y < 40 ? [30, 60, 200] : [245, 245, 245],
    );
    const boxed = grabCut(two, { rect: { x0: 0.25, y0: 0.2, x1: 0.75, y1: 0.8 }, strokes: [] });

    expect(boxed.mask[30 * W + 10]).toBe(0);
    expect(boxed.mask[30 * W + 40]).toBe(1);
    expect(boxed.mask[30 * W + 58]).toBe(0);
  });

  it('รูปสีเดียวทั้งรูป = ไม่พบวัตถุ (ไม่พัง)', () => {
    const result = grabCut(image(20, 20, () => [128, 128, 128]));

    expect(result.objects).toHaveLength(0);
  });
});

describe('refineAlpha + applyCutout', () => {
  it('ขยายหน้ากากหยาบให้ขอบตรงกับเส้นในรูปจริง และล้างสีพื้นหลังที่ขอบ', () => {
    // รูปจริง 64×64: ดำ x < 28 · ขาว x ≥ 28 · หน้ากากหยาบ 8×8 (ช่องละ 8 พิกเซล) ขอบอยู่ที่ x = 32 — เลยเส้นจริงครึ่งช่อง
    const full = image(64, 64, (x) => (x < 28 ? [10, 10, 10] : [250, 250, 250]));
    const coarse = new Uint8Array(64);

    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) coarse[y * 8 + x] = x < 4 ? 1 : 0;

    const alpha = refineAlpha(full, coarse, 8, 8, 0);

    expect(alpha[32 * 64 + 20]).toBe(255);
    expect(alpha[32 * 64 + 26]).toBeGreaterThan(200);
    // เลยเส้นจริงไปแล้วต้องโปร่ง แม้หน้ากากหยาบจะทับถึง x≈32
    expect(alpha[32 * 64 + 30]).toBeLessThan(40);
    expect(alpha[32 * 64 + 60]).toBe(0);

    applyCutout(full, alpha);
    expect(full.data[(32 * 64 + 20) * 4 + 3]).toBe(255);
    expect(full.data[(32 * 64 + 60) * 4 + 3]).toBe(0);
  });
});
