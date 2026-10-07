import type { CurvePoint, ImageCurves, ImageLevels, LevelsChannel } from './types';

/// ระดับสี (Levels) และเส้นโค้ง (Curves) — แปลงเป็นตารางค่า 256 ช่องต่อสีแล้วใช้ทีเดียว
///
/// ลำดับ: ระดับสีรายช่อง → ระดับสีรวม → เส้นโค้งรายช่อง → เส้นโค้งรวม (แบบ Photoshop ที่ช่องรวมทำหลังสุด)

export type ToneChannel = 'master' | 'red' | 'green' | 'blue';

export const TONE_CHANNELS: { key: ToneChannel; label: string }[] = [
  { key: 'master', label: 'RGB' },
  { key: 'red', label: 'แดง' },
  { key: 'green', label: 'เขียว' },
  { key: 'blue', label: 'น้ำเงิน' },
];

export const LEVELS_IDENTITY: LevelsChannel = { black: 0, white: 255, gamma: 1, outBlack: 0, outWhite: 255 };
export const CURVE_IDENTITY: CurvePoint[] = [
  [0, 0],
  [255, 255],
];

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function isLevelsIdentity(c: LevelsChannel | null | undefined): boolean {
  return !c || (c.black === 0 && c.white === 255 && c.gamma === 1 && c.outBlack === 0 && c.outWhite === 255);
}

/// เส้นโค้งที่ไม่เปลี่ยนอะไร: ไม่มีจุด หรือทุกจุดอยู่บนเส้นทแยง
export function isCurveIdentity(points: CurvePoint[] | null | undefined): boolean {
  return !points || points.length < 2 || points.every(([x, y]) => Math.abs(x - y) < 0.5);
}

export function hasTones(levels: ImageLevels | null | undefined, curves: ImageCurves | null | undefined): boolean {
  const l = levels ?? {};
  const c = curves ?? {};

  return (
    !isLevelsIdentity(l.master) ||
    !isLevelsIdentity(l.red) ||
    !isLevelsIdentity(l.green) ||
    !isLevelsIdentity(l.blue) ||
    !isCurveIdentity(c.master) ||
    !isCurveIdentity(c.red) ||
    !isCurveIdentity(c.green) ||
    !isCurveIdentity(c.blue)
  );
}

/// ตารางระดับสี: ตัดช่วง [black, white] → ยกกำลัง 1/gamma → ขยายเป็น [outBlack, outWhite]
export function levelsLut(channel: LevelsChannel | null | undefined): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const c = channel ?? LEVELS_IDENTITY;
  const black = clamp255(c.black);
  const white = Math.max(black + 1, clamp255(c.white));
  const gamma = Math.max(0.1, Math.min(9.99, c.gamma || 1));

  for (let v = 0; v < 256; v++) {
    const t = Math.max(0, Math.min(1, (v - black) / (white - black)));
    const g = Math.pow(t, 1 / gamma);

    lut[v] = Math.round(c.outBlack + g * (c.outWhite - c.outBlack));
  }

  return lut;
}

/// เรียงจุดตามอินพุต ตัดจุดซ้ำ และเติมปลายทั้งสองข้างให้ครอบ 0–255
export function normalizeCurve(points: CurvePoint[] | null | undefined): CurvePoint[] {
  const sorted = [...(points ?? CURVE_IDENTITY)]
    .map(([x, y]) => [clamp255(x), clamp255(y)] as CurvePoint)
    .sort((a, b) => a[0] - b[0])
    .filter((p, i, arr) => i === 0 || p[0] - arr[i - 1][0] >= 1);

  if (sorted.length === 0) return CURVE_IDENTITY.map((p) => [...p] as CurvePoint);
  if (sorted[0][0] > 0) sorted.unshift([0, sorted[0][1]]);
  if (sorted[sorted.length - 1][0] < 255) sorted.push([255, sorted[sorted.length - 1][1]]);

  return sorted;
}

/// ค่าเส้นโค้งทุกอินพุต 0–255 (monotone cubic Hermite แบบ Fritsch–Carlson — ไม่พุ่งเกินระหว่างจุด)
export function curveValues(points: CurvePoint[] | null | undefined): Float64Array {
  const pts = normalizeCurve(points);
  const n = pts.length;
  const out = new Float64Array(256);

  if (n === 1) {
    out.fill(pts[0][1]);
    return out;
  }

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d: number[] = [];

  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));

  const m: number[] = [d[0]];

  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }

    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;

    if (s > 9) {
      const t = 3 / Math.sqrt(s);

      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }

  let seg = 0;

  for (let x = 0; x < 256; x++) {
    while (seg < n - 2 && x > xs[seg + 1]) seg++;

    const h = xs[seg + 1] - xs[seg];
    const t = Math.max(0, Math.min(1, (x - xs[seg]) / h));
    const t2 = t * t;
    const t3 = t2 * t;

    out[x] =
      (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1];
  }

  return out;
}

export function curveLut(points: CurvePoint[] | null | undefined): Uint8ClampedArray {
  const values = curveValues(points);
  const lut = new Uint8ClampedArray(256);

  for (let i = 0; i < 256; i++) lut[i] = Math.round(values[i]);

  return lut;
}

/// ตารางรวมของสามช่อง [แดง, เขียว, น้ำเงิน]
export function toneLuts(levels: ImageLevels | null | undefined, curves: ImageCurves | null | undefined): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const l = levels ?? {};
  const c = curves ?? {};
  const masterLevels = levelsLut(l.master);
  const masterCurve = curveLut(c.master);

  return (['red', 'green', 'blue'] as const).map((key) => {
    const own = levelsLut(l[key]);
    const ownCurve = curveLut(c[key]);
    const lut = new Uint8ClampedArray(256);

    for (let v = 0; v < 256; v++) lut[v] = masterCurve[ownCurve[masterLevels[own[v]]]];

    return lut;
  }) as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
}

export function applyTones(data: { data: Uint8ClampedArray }, levels: ImageLevels | null | undefined, curves: ImageCurves | null | undefined) {
  if (!hasTones(levels, curves)) return;

  const [r, g, b] = toneLuts(levels, curves);
  const px = data.data;

  for (let i = 0; i < px.length; i += 4) {
    px[i] = r[px[i]];
    px[i + 1] = g[px[i + 1]];
    px[i + 2] = b[px[i + 2]];
  }
}

/// ฮิสโตแกรม 256 ช่องของความสว่าง (และรายช่องสี) — ข้ามพิกเซลโปร่งใส
export function histogram(data: { data: Uint8ClampedArray }): Record<ToneChannel, Uint32Array> {
  const out = { master: new Uint32Array(256), red: new Uint32Array(256), green: new Uint32Array(256), blue: new Uint32Array(256) };
  const px = data.data;

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;

    out.red[px[i]]++;
    out.green[px[i + 1]]++;
    out.blue[px[i + 2]]++;
    out.master[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
  }

  return out;
}

/// ระดับสีอัตโนมัติ: ยืดช่วงของแต่ละช่องให้เต็ม 0–255 โดยตัดปลายทิ้งข้างละ `clip` (สัดส่วน)
export function autoLevels(hist: Record<ToneChannel, Uint32Array>, clip = 0.005): ImageLevels {
  const channel = (h: Uint32Array): LevelsChannel => {
    let total = 0;

    for (let i = 0; i < 256; i++) total += h[i];

    if (total === 0) return { ...LEVELS_IDENTITY };

    const cut = total * clip;
    let black = 0;
    let white = 255;
    let acc = 0;

    for (let i = 0; i < 256; i++) {
      acc += h[i];
      if (acc > cut) {
        black = i;
        break;
      }
    }

    acc = 0;

    for (let i = 255; i >= 0; i--) {
      acc += h[i];
      if (acc > cut) {
        white = i;
        break;
      }
    }

    if (white - black < 8) return { ...LEVELS_IDENTITY };

    return { ...LEVELS_IDENTITY, black, white };
  };

  return { red: channel(hist.red), green: channel(hist.green), blue: channel(hist.blue) };
}
