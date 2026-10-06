import { gaussianPlane, parseColor, type Pixels } from './image-effects';
import type { ImageLayerStyle } from './types';

/// สไตล์เลเยอร์ของรูป: เส้นขอบสติกเกอร์ · แสงเรือง · เงาด้านใน
///
/// ทุกอย่างตามรูปร่างส่วนที่ทึบของรูป (alpha) — เหมาะกับรูปที่ลบพื้นหลังแล้ว
/// ระยะคำนวณด้วย Euclidean distance transform แบบแยกแกน (Felzenszwalb–Huttenlocher, O(n))
/// เส้นขอบกับแสงเรืองยื่นออกนอกกรอบรูป ผลลัพธ์จึงใหญ่กว่าเดิมข้างละ `pad` พิกเซล

export function hasLayerStyle(style: ImageLayerStyle | null | undefined): boolean {
  return Boolean(style && ((style.outline?.size ?? 0) > 0 || (style.glow?.size ?? 0) > 0 || ((style.innerShadow?.size ?? 0) > 0 && (style.innerShadow?.opacity ?? 0) > 0)));
}

/// ขนาดที่ยื่นออกนอกรูป (พิกเซล) · `unit` = 1% ของด้านสั้นของรูป
export function layerStylePad(style: ImageLayerStyle | null | undefined, unit: number): number {
  if (!style) return 0;

  const outline = Math.max(0, style.outline?.size ?? 0) * unit;
  const glow = Math.max(0, style.glow?.size ?? 0) * unit;
  const inner = (style.innerShadow?.size ?? 0) > 0 ? 1 : 0;

  return Math.ceil(Math.max(inner, outline > 0 || glow > 0 ? outline + glow * 1.6 + 1 : 0));
}

const INF = 1e20;

/// ระยะกำลังสองแบบ 1 มิติ (lower envelope of parabolas)
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;

  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);

    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }

    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;

  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/// ระยะ (พิกเซล) จากทุกจุดถึงจุด "feature" ที่ใกล้ที่สุด · ไม่มี feature เลย = Infinity ทั้งหมด
export function distanceTransform(feature: (i: number) => boolean, w: number, h: number): Float32Array {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);

  for (let i = 0; i < w * h; i++) grid[i] = feature(i) ? 0 : INF;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }

  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x] >= INF / 2 ? Infinity : Math.sqrt(d[x]);
  }

  return out;
}

/// วางรูปลงผืนที่ใหญ่ขึ้น แล้ววาดแสงเรือง → เส้นขอบ → รูป (ล่างขึ้นบน) และเงาด้านในบนรูป
export function applyLayerStyle(img: Pixels, style: ImageLayerStyle, unit = Math.min(img.width, img.height) / 100): { pixels: Pixels; pad: number } {
  const pad = layerStylePad(style, unit);
  const w = img.width + pad * 2;
  const h = img.height + pad * 2;
  const n = w * h;
  const src = new Uint8ClampedArray(n * 4);

  for (let y = 0; y < img.height; y++) {
    src.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + pad) * w + pad) * 4);
  }

  const inner = style.innerShadow;
  const innerPx = Math.max(0, inner?.size ?? 0) * unit;

  if (inner && innerPx > 0 && (inner.opacity ?? 0) > 0) {
    const dist = distanceTransform((i) => src[i * 4 + 3] < 128, w, h);
    const color = parseColor(inner.color) ?? [0, 0, 0];
    const strength = Math.min(1, inner.opacity / 100);

    for (let i = 0; i < n; i++) {
      if (src[i * 4 + 3] === 0 || dist[i] >= innerPx) continue;

      const t = 1 - dist[i] / innerPx;
      const k = strength * t * t;

      for (let c = 0; c < 3; c++) src[i * 4 + c] = src[i * 4 + c] + (color[c] - src[i * 4 + c]) * k;
    }
  }

  const outlinePx = Math.max(0, style.outline?.size ?? 0) * unit;
  const glowPx = Math.max(0, style.glow?.size ?? 0) * unit;

  if (outlinePx <= 0 && glowPx <= 0) return { pixels: { data: src, width: w, height: h }, pad };

  // รูปร่างของสติกเกอร์: ส่วนทึบของรูป + เส้นขอบ (0–1)
  const shape = new Float32Array(n);

  if (outlinePx > 0) {
    const dist = distanceTransform((i) => src[i * 4 + 3] >= 128, w, h);

    for (let i = 0; i < n; i++) shape[i] = Math.max(src[i * 4 + 3] / 255, Math.max(0, Math.min(1, outlinePx - dist[i] + 0.5)));
  } else {
    for (let i = 0; i < n; i++) shape[i] = src[i * 4 + 3] / 255;
  }

  const out = new Uint8ClampedArray(n * 4);
  const outlineColor = parseColor(style.outline?.color ?? '') ?? [255, 255, 255];
  let glow: Float32Array | null = null;
  const glowColor = parseColor(style.glow?.color ?? '') ?? [255, 255, 255];
  const glowOpacity = Math.max(0, Math.min(100, style.glow?.opacity ?? 70)) / 100;

  if (glowPx > 0) {
    glow = shape.slice();
    gaussianPlane(glow, w, h, glowPx / 2);
  }

  for (let i = 0; i < n; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    if (glow) {
      a = Math.min(1, glow[i] * 1.6) * glowOpacity;
      r = glowColor[0];
      g = glowColor[1];
      b = glowColor[2];
    }

    if (outlinePx > 0) {
      const ao = shape[i];
      const na = ao + a * (1 - ao);

      if (na > 0) {
        r = (outlineColor[0] * ao + r * a * (1 - ao)) / na;
        g = (outlineColor[1] * ao + g * a * (1 - ao)) / na;
        b = (outlineColor[2] * ao + b * a * (1 - ao)) / na;
      }

      a = na;
    }

    const as = src[i * 4 + 3] / 255;
    const na = as + a * (1 - as);

    if (na > 0) {
      out[i * 4] = (src[i * 4] * as + r * a * (1 - as)) / na;
      out[i * 4 + 1] = (src[i * 4 + 1] * as + g * a * (1 - as)) / na;
      out[i * 4 + 2] = (src[i * 4 + 2] * as + b * a * (1 - as)) / na;
    }

    out[i * 4 + 3] = na * 255;
  }

  return { pixels: { data: out, width: w, height: h }, pad };
}
