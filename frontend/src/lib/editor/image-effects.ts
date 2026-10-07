import { blendChannel, type SeparableBlend } from './blend';
import type { ImageEffect, ImageEffectKind } from './types';

/// เอฟเฟกต์ภาพแบบ Photoshop (แผง "แก้ไขรูปภาพ" → เอฟเฟกต์ภาพ)
///
/// ทุกตัวเป็นฟังก์ชันพิกเซลล้วน ทำงานในเครื่องผู้ใช้ ไม่ใช้ AI และไม่ส่งรูปออกไปไหน
/// ตัว render (lib/editor/render.ts) เรียกผ่าน image-pipeline แล้วแคชผล จึงได้ภาพเดียวกันทั้งบนจอ ภาพย่อ และไฟล์ส่งออก
///
/// ขนาดทุกค่า (`size` `radius` `distance` ฯลฯ) เป็น % ของด้านสั้นของรูป — ภาพตัวอย่างความละเอียดต่ำ
/// กับไฟล์ความละเอียดเต็มจึงหน้าตาเหมือนกัน · เอฟเฟกต์หนัก (เบลอ ภาพสีน้ำมัน) ใช้ box blur แยกแกน
/// และตารางผลรวม (O(n) ไม่ขึ้นกับรัศมี) เพื่อไม่ให้หน้าจอค้าง

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface EffectParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  default: number;
  /// ตัวเลือกแบบรายการ (แทนแถบเลื่อน)
  options?: { value: number; label: string }[];
}

export type EffectGroup = 'color' | 'texture' | 'art' | 'blur' | 'light';

export interface EffectDef {
  kind: ImageEffectKind;
  label: string;
  group: EffectGroup;
  params: EffectParam[];
  /// สีที่เอฟเฟกต์ใช้ · `labels` = ชื่อช่องสี · ถ้ามี `max` เพิ่ม/ลดจำนวนสีได้
  colors?: { labels: string[]; defaults: string[]; min?: number; max?: number };
}

export const EFFECT_GROUPS: { key: EffectGroup; label: string }[] = [
  { key: 'color', label: 'สีและโทน' },
  { key: 'texture', label: 'พื้นผิวและลวดลาย' },
  { key: 'art', label: 'ศิลปะ' },
  { key: 'blur', label: 'เบลอ' },
  { key: 'light', label: 'แสงและเลนส์' },
];

const AMOUNT: EffectParam = { key: 'amount', label: 'ความแรง', min: 0, max: 100, default: 100 };

export const OVERLAY_MODES: { value: number; label: string; mode: SeparableBlend }[] = [
  { value: 0, label: 'ปกติ', mode: 'normal' },
  { value: 1, label: 'คูณ', mode: 'multiply' },
  { value: 2, label: 'สกรีน', mode: 'screen' },
  { value: 3, label: 'ซ้อนทับ', mode: 'overlay' },
  { value: 4, label: 'แสงนุ่ม', mode: 'soft-light' },
  { value: 5, label: 'เผาสี', mode: 'color-burn' },
  { value: 6, label: 'เร่งแสง', mode: 'color-dodge' },
];

export const EFFECT_DEFS: EffectDef[] = [
  {
    kind: 'duotone',
    label: 'ดูโอโทน',
    group: 'color',
    params: [AMOUNT],
    colors: { labels: ['สีเงา', 'สีแสง'], defaults: ['rgb(35 20 95)', 'rgb(255 190 120)'] },
  },
  {
    kind: 'gradient-map',
    label: 'แผนที่ไล่สี',
    group: 'color',
    params: [AMOUNT],
    colors: { labels: ['สีมืด', 'สีกลาง', 'สีสว่าง'], defaults: ['rgb(20 12 60)', 'rgb(214 40 120)', 'rgb(255 222 120)'], min: 2, max: 5 },
  },
  { kind: 'posterize', label: 'โปสเตอร์', group: 'color', params: [{ key: 'levels', label: 'จำนวนระดับสี', min: 2, max: 12, default: 4 }] },
  {
    kind: 'threshold',
    label: 'ขาวดำสองระดับ',
    group: 'color',
    params: [{ key: 'level', label: 'จุดตัด', min: 1, max: 254, default: 128 }],
    colors: { labels: ['สีมืด', 'สีสว่าง'], defaults: ['rgb(20 20 20)', 'rgb(255 255 255)'] },
  },
  { kind: 'invert', label: 'กลับสี', group: 'color', params: [AMOUNT] },
  {
    kind: 'color-overlay',
    label: 'ทับสี',
    group: 'color',
    params: [
      { ...AMOUNT, default: 35 },
      { key: 'mode', label: 'วิธีผสม', min: 0, max: OVERLAY_MODES.length - 1, default: 0, options: OVERLAY_MODES.map(({ value, label }) => ({ value, label })) },
    ],
    colors: { labels: ['สี'], defaults: ['rgb(255 120 60)'] },
  },
  {
    kind: 'halftone',
    label: 'ฮาล์ฟโทน',
    group: 'texture',
    params: [
      { key: 'size', label: 'ขนาดจุด', min: 0.5, max: 6, step: 0.1, default: 1.5 },
      { key: 'angle', label: 'มุม', min: 0, max: 90, default: 45 },
      AMOUNT,
    ],
    colors: { labels: ['สีหมึก', 'สีกระดาษ'], defaults: ['rgb(25 25 30)', 'rgb(255 255 255)'] },
  },
  { kind: 'pixelate', label: 'โมเสก', group: 'texture', params: [{ key: 'size', label: 'ขนาดช่อง', min: 0.5, max: 10, step: 0.1, default: 2.5 }] },
  {
    kind: 'grain',
    label: 'เกรนฟิล์ม',
    group: 'texture',
    params: [
      { ...AMOUNT, default: 35 },
      { key: 'size', label: 'ขนาดเม็ด', min: 1, max: 5, step: 0.5, default: 1 },
      { key: 'seed', label: 'รูปแบบ', min: 1, max: 50, default: 1 },
    ],
  },
  {
    kind: 'glitch',
    label: 'กลิตช์',
    group: 'texture',
    params: [
      { key: 'offset', label: 'แยกสี', min: 0, max: 8, step: 0.1, default: 1.5 },
      { key: 'slices', label: 'จำนวนแถบเลื่อน', min: 0, max: 30, default: 10 },
      { key: 'seed', label: 'รูปแบบ', min: 1, max: 50, default: 7 },
    ],
  },
  { kind: 'sketch', label: 'ภาพร่างดินสอ', group: 'art', params: [AMOUNT, { key: 'detail', label: 'รายละเอียด', min: 1, max: 10, default: 5 }] },
  { kind: 'edges', label: 'ขอบเรืองแสง', group: 'art', params: [AMOUNT, { key: 'detail', label: 'รายละเอียด', min: 1, max: 10, default: 5 }] },
  {
    kind: 'emboss',
    label: 'นูนต่ำ',
    group: 'art',
    params: [AMOUNT, { key: 'angle', label: 'ทิศแสง', min: 0, max: 360, default: 135 }, { key: 'depth', label: 'ความลึก', min: 1, max: 10, default: 4 }],
  },
  { kind: 'oil', label: 'ภาพสีน้ำมัน', group: 'art', params: [{ key: 'radius', label: 'ขนาดฝีแปรง', min: 1, max: 8, step: 0.5, default: 3 }] },
  { kind: 'blur', label: 'เบลอนุ่ม', group: 'blur', params: [{ key: 'radius', label: 'รัศมี', min: 0, max: 8, step: 0.1, default: 1 }] },
  {
    kind: 'motion-blur',
    label: 'เบลอเคลื่อนไหว',
    group: 'blur',
    params: [
      { key: 'distance', label: 'ระยะ', min: 0, max: 20, step: 0.5, default: 5 },
      { key: 'angle', label: 'ทิศทาง', min: 0, max: 180, default: 0 },
    ],
  },
  {
    kind: 'zoom-blur',
    label: 'เบลอซูม',
    group: 'blur',
    params: [
      { ...AMOUNT, default: 35 },
      { key: 'x', label: 'จุดศูนย์กลางแนวนอน', min: 0, max: 100, default: 50 },
      { key: 'y', label: 'จุดศูนย์กลางแนวตั้ง', min: 0, max: 100, default: 50 },
    ],
  },
  {
    kind: 'tilt-shift',
    label: 'ทิลต์ชิฟต์',
    group: 'blur',
    params: [
      { key: 'position', label: 'ตำแหน่งแถบชัด', min: 0, max: 100, default: 50 },
      { key: 'band', label: 'ความกว้างแถบชัด', min: 5, max: 90, default: 30 },
      { key: 'blur', label: 'ความเบลอ', min: 0, max: 8, step: 0.1, default: 2 },
    ],
  },
  { kind: 'chromatic', label: 'สีเหลื่อมเลนส์', group: 'light', params: [{ key: 'shift', label: 'ระยะเหลื่อม', min: 0, max: 5, step: 0.1, default: 1.2 }] },
  {
    kind: 'light-leak',
    label: 'แสงรั่ว',
    group: 'light',
    params: [{ ...AMOUNT, default: 60 }, { key: 'angle', label: 'ทิศทาง', min: 0, max: 360, default: 315 }, { key: 'size', label: 'ขนาด', min: 10, max: 100, default: 60 }],
    colors: { labels: ['สีแสง'], defaults: ['rgb(255 125 45)'] },
  },
];

export function effectDef(kind: ImageEffectKind | string): EffectDef | null {
  return EFFECT_DEFS.find((d) => d.kind === kind) ?? null;
}

/// เอฟเฟกต์ใหม่พร้อมค่าเริ่มต้น
export function newEffect(kind: ImageEffectKind): ImageEffect {
  const def = effectDef(kind)!;

  return {
    kind,
    params: Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    ...(def.colors ? { colors: [...def.colors.defaults] } : {}),
  };
}

/// ค่าพารามิเตอร์ที่ใช้จริง (เติมค่าเริ่มต้น + บีบให้อยู่ในช่วง)
export function effectParams(effect: ImageEffect): Record<string, number> {
  const def = effectDef(effect.kind);
  const out: Record<string, number> = {};

  for (const p of def?.params ?? []) {
    const raw = effect.params?.[p.key];
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.default;

    out[p.key] = Math.max(p.min, Math.min(p.max, v));
  }

  return out;
}

export function effectColors(effect: ImageEffect): [number, number, number][] {
  const def = effectDef(effect.kind);
  const defaults = def?.colors?.defaults ?? [];
  const list = effect.colors && effect.colors.length >= (def?.colors?.min ?? defaults.length) ? effect.colors : defaults;

  return list.map((c, i) => parseColor(c) ?? parseColor(defaults[i] ?? '') ?? [0, 0, 0]);
}

export function activeEffects(effects: ImageEffect[] | null | undefined): ImageEffect[] {
  return (effects ?? []).filter((e) => !e.off && effectDef(e.kind));
}

/// "rgb(r g b)" · "rgb(r, g, b)" · "rgba(…)" → [r, g, b]
export function parseColor(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);

  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// ── เครื่องมือพื้นฐาน ───────────────────────────────────────────────

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lumOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/// เลขสุ่มที่กำหนดได้ (ผลเหมือนเดิมทุกครั้ง → แคชและไฟล์ส่งออกตรงกับจอ)
export function seededRandom(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;

    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);

  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
}

/// box blur แยกแกน (ขอบยืดค่าปลาย) บนระนาบเดียว · ผลอยู่ใน `plane`
export function boxBlurPlane(plane: Float32Array, w: number, h: number, r: number, tmp: Float32Array = new Float32Array(plane.length)) {
  if (r < 1) return;

  const inv = 1 / (2 * r + 1);

  for (let y = 0; y < h; y++) {
    const base = y * w;
    const first = plane[base];
    const last = plane[base + w - 1];
    let acc = first * (r + 1);

    for (let k = 1; k <= r; k++) acc += k < w ? plane[base + k] : last;

    for (let x = 0; x < w; x++) {
      tmp[base + x] = acc * inv;
      acc += (x + r + 1 < w ? plane[base + x + r + 1] : last) - (x - r > 0 ? plane[base + x - r] : first);
    }
  }

  // แนวตั้ง: เดินทีละแถวพร้อมตัวสะสมของทุกคอลัมน์ (อ่านหน่วยความจำต่อเนื่อง เร็วกว่าเดินทีละคอลัมน์มาก)
  const acc = new Float64Array(w);
  const lastRow = (h - 1) * w;

  for (let x = 0; x < w; x++) acc[x] = tmp[x] * (r + 1);

  for (let k = 1; k <= r; k++) {
    const row = (k < h ? k : h - 1) * w;

    for (let x = 0; x < w; x++) acc[x] += tmp[row + x];
  }

  for (let y = 0; y < h; y++) {
    const base = y * w;
    const add = y + r + 1 < h ? (y + r + 1) * w : lastRow;
    const sub = y - r > 0 ? (y - r) * w : 0;

    for (let x = 0; x < w; x++) {
      plane[base + x] = acc[x] * inv;
      acc[x] += tmp[add + x] - tmp[sub + x];
    }
  }
}

/// เบลอแบบเกาส์โดยประมาณ (box blur 3 รอบ · ความแปรปรวนรวม = 3·r(r+1)/3 ≈ σ²)
export function gaussianPlane(plane: Float32Array, w: number, h: number, sigma: number, tmp: Float32Array = new Float32Array(plane.length)) {
  if (sigma < 0.5) return;

  const r = Math.max(1, Math.round(Math.sqrt(sigma * sigma + 0.25) - 0.5));

  for (let pass = 0; pass < 3; pass++) boxBlurPlane(plane, w, h, r, tmp);
}

function isOpaque(px: Uint8ClampedArray): boolean {
  for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) return false;

  return true;
}

/// ทำงานกับระนาบสีทีละช่อง โดยคูณ alpha ก่อน (premultiplied) เพื่อไม่ให้ขอบรูปโปร่งใสเกิดขอบดำ
function transformPlanes(img: Pixels, op: (plane: Float32Array) => Float32Array | void) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const plane = new Float32Array(n);

  if (isOpaque(data)) {
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < n; i++) plane[i] = data[i * 4 + c];

      const out = op(plane) ?? plane;

      for (let i = 0; i < n; i++) data[i * 4 + c] = out[i];
    }

    return;
  }

  const alpha = new Float32Array(n);

  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];

  const copy = alpha.slice();
  // op คืนระนาบใหม่ หรือแก้ในที่ (คืน void)
  const a = op(copy) ?? copy;

  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) plane[i] = (data[i * 4 + c] * alpha[i]) / 255;

    const out = op(plane) ?? plane;

    for (let i = 0; i < n; i++) data[i * 4 + c] = a[i] > 0.5 ? (out[i] * 255) / a[i] : 0;
  }

  for (let i = 0; i < n; i++) data[i * 4 + 3] = a[i];
}

/// อ่านค่าแบบ bilinear (ขอบยืดค่าปลาย) ของระนาบ
function sampleBilinear(plane: Float32Array, w: number, h: number, x: number, y: number): number {
  const xc = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
  const yc = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
  const x0 = Math.floor(xc);
  const y0 = Math.floor(yc);
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = xc - x0;
  const fy = yc - y0;
  const top = plane[y0 * w + x0] * (1 - fx) + plane[y0 * w + x1] * fx;
  const bottom = plane[y1 * w + x0] * (1 - fx) + plane[y1 * w + x1] * fx;

  return top * (1 - fy) + bottom * fy;
}

function lumPlane(img: Pixels): Float32Array {
  const { data } = img;
  const n = img.width * img.height;
  const out = new Float32Array(n);

  for (let i = 0; i < n; i++) out[i] = lumOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);

  return out;
}

// ── เอฟเฟกต์สี ─────────────────────────────────────────────────────

function gradientMap(img: Pixels, stops: [number, number, number][], amount: number) {
  const px = img.data;
  const lut = new Uint8ClampedArray(256 * 3);
  const segs = stops.length - 1;

  for (let v = 0; v < 256; v++) {
    const t = (v / 255) * segs;
    const i = Math.min(segs - 1, Math.floor(t));
    const f = t - i;

    for (let c = 0; c < 3; c++) lut[v * 3 + c] = stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f;
  }

  for (let i = 0; i < px.length; i += 4) {
    const l = Math.round(clamp255(lumOf(px[i], px[i + 1], px[i + 2])));

    for (let c = 0; c < 3; c++) px[i + c] = px[i + c] + (lut[l * 3 + c] - px[i + c]) * amount;
  }
}

function posterize(img: Pixels, levels: number) {
  const px = img.data;
  const step = 255 / (Math.max(2, Math.round(levels)) - 1);

  for (let i = 0; i < px.length; i += 4) {
    px[i] = Math.round(px[i] / step) * step;
    px[i + 1] = Math.round(px[i + 1] / step) * step;
    px[i + 2] = Math.round(px[i + 2] / step) * step;
  }
}

function threshold(img: Pixels, level: number, dark: [number, number, number], light: [number, number, number]) {
  const px = img.data;

  for (let i = 0; i < px.length; i += 4) {
    const c = lumOf(px[i], px[i + 1], px[i + 2]) >= level ? light : dark;

    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  }
}

function invert(img: Pixels, amount: number) {
  const px = img.data;

  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) px[i + c] = px[i + c] + (255 - 2 * px[i + c]) * amount;
  }
}

function colorOverlay(img: Pixels, color: [number, number, number], amount: number, mode: SeparableBlend) {
  const px = img.data;
  const s = color.map((v) => v / 255);
  const lut = [0, 1, 2].map((c) => {
    const table = new Uint8ClampedArray(256);

    for (let v = 0; v < 256; v++) table[v] = Math.round(v + (blendChannel(mode, v / 255, s[c]) * 255 - v) * amount);

    return table;
  });

  for (let i = 0; i < px.length; i += 4) {
    px[i] = lut[0][px[i]];
    px[i + 1] = lut[1][px[i + 1]];
    px[i + 2] = lut[2][px[i + 2]];
  }
}

// ── พื้นผิวและลวดลาย ────────────────────────────────────────────────

function halftone(img: Pixels, cell: number, angleDeg: number, amount: number, ink: [number, number, number], paper: [number, number, number]) {
  const { data: px, width: w, height: h } = img;
  const size = Math.max(2, cell);
  const lum = lumPlane(img);

  gaussianPlane(lum, w, h, size * 0.35);

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const maxR = size * 0.75;
  const inv = 1 / size;
  const d0 = ink[0] - paper[0];
  const d1 = ink[1] - paper[1];
  const d2 = ink[2] - paper[2];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      const cu = (Math.floor(u * inv) + 0.5) * size;
      const cv = (Math.floor(v * inv) + 0.5) * size;
      // ความสว่างที่จุดกึ่งกลางช่อง (ภาพเบลอแล้ว จึงอ่านพิกเซลใกล้สุดก็พอ)
      let cx = Math.round(cu * cos - cv * sin);
      let cy = Math.round(cu * sin + cv * cos);

      cx = cx < 0 ? 0 : cx >= w ? w - 1 : cx;
      cy = cy < 0 ? 0 : cy >= h ? h - 1 : cy;

      const l = lum[cy * w + cx] / 255;
      const r = maxR * Math.sqrt(l < 1 ? 1 - l : 0);
      const du = u - cu;
      const dv = v - cv;
      const t = r - Math.sqrt(du * du + dv * dv) + 0.5;
      const cover = t < 0 ? 0 : t > 1 ? 1 : t;
      const i = (y * w + x) * 4;

      px[i] += (paper[0] + d0 * cover - px[i]) * amount;
      px[i + 1] += (paper[1] + d1 * cover - px[i + 1]) * amount;
      px[i + 2] += (paper[2] + d2 * cover - px[i + 2]) * amount;
    }
  }
}

function pixelate(img: Pixels, block: number) {
  const { data: px, width: w, height: h } = img;
  const b = Math.max(1, Math.round(block));

  if (b <= 1) return;

  for (let by = 0; by < h; by += b) {
    for (let bx = 0; bx < w; bx += b) {
      const ye = Math.min(h, by + b);
      const xe = Math.min(w, bx + b);
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      let count = 0;

      for (let y = by; y < ye; y++) {
        for (let x = bx; x < xe; x++) {
          const i = (y * w + x) * 4;
          const al = px[i + 3];

          r += px[i] * al;
          g += px[i + 1] * al;
          bl += px[i + 2] * al;
          a += al;
          count++;
        }
      }

      const out = a > 0 ? [r / a, g / a, bl / a] : [0, 0, 0];
      const alpha = a / count;

      for (let y = by; y < ye; y++) {
        for (let x = bx; x < xe; x++) {
          const i = (y * w + x) * 4;

          px[i] = out[0];
          px[i + 1] = out[1];
          px[i + 2] = out[2];
          px[i + 3] = alpha;
        }
      }
    }
  }
}

function grain(img: Pixels, amount: number, grainSize: number, seed: number) {
  const { data: px, width: w, height: h } = img;
  const g = Math.max(1, grainSize);
  const strength = amount * 90;

  for (let y = 0; y < h; y++) {
    const gy = Math.floor(y / g);

    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = lumOf(px[i], px[i + 1], px[i + 2]) / 255;
      // เกรนชัดสุดที่โทนกลาง (แบบฟิล์มจริง)
      const n = (hash2(Math.floor(x / g), gy, seed) - 0.5) * strength * (1 - Math.abs(l - 0.5) * 1.2);

      px[i] += n;
      px[i + 1] += n;
      px[i + 2] += n;
    }
  }
}

function glitch(img: Pixels, offset: number, slices: number, seed: number) {
  const { data: px, width: w, height: h } = img;
  const src = new Uint8ClampedArray(px);
  const shift = new Int32Array(h);
  const rand = seededRandom(seed);
  const off = Math.round(offset);

  for (let s = 0; s < slices; s++) {
    const start = Math.floor(rand() * h);
    const height = Math.max(1, Math.floor((rand() * 0.08 + 0.01) * h));
    const dx = Math.round((rand() - 0.5) * 2 * Math.max(2, offset * 4));

    for (let y = start; y < Math.min(h, start + height); y++) shift[y] = dx;
  }

  const at = (x: number, y: number) => (y * w + (x < 0 ? 0 : x >= w ? w - 1 : x)) * 4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - shift[y];
      const i = (y * w + x) * 4;
      const ir = at(sx + off, y);
      const ig = at(sx, y);
      const ib = at(sx - off, y);

      px[i] = src[ir];
      px[i + 1] = src[ig + 1];
      px[i + 2] = src[ib + 2];
      px[i + 3] = Math.max(src[ir + 3], src[ig + 3], src[ib + 3]);
    }
  }
}

// ── ศิลปะ ──────────────────────────────────────────────────────────

/// ขนาดความชัน (Sobel) ของความสว่าง
function sobel(lum: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const row = y * w;
    const down = (y < h - 1 ? y + 1 : h - 1) * w;

    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x < w - 1 ? x + 1 : w - 1;
      const tl = lum[up + xl];
      const tr = lum[up + xr];
      const bl = lum[down + xl];
      const br = lum[down + xr];
      const gx = tr + 2 * lum[row + xr] + br - tl - 2 * lum[row + xl] - bl;
      const gy = bl + 2 * lum[down + x] + br - tl - 2 * lum[up + x] - tr;

      out[row + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return out;
}

function edgeMagnitude(img: Pixels, unit: number): Float32Array {
  const lum = lumPlane(img);

  gaussianPlane(lum, img.width, img.height, Math.max(0.5, unit * 0.08));

  return sobel(lum, img.width, img.height);
}

function sketch(img: Pixels, amount: number, detail: number, unit: number) {
  const px = img.data;
  const mag = edgeMagnitude(img, unit);
  const k = detail * 0.12;

  for (let p = 0, i = 0; p < mag.length; p++, i += 4) {
    const v = clamp255(255 - mag[p] * k);

    for (let c = 0; c < 3; c++) px[i + c] = px[i + c] + (v - px[i + c]) * amount;
  }
}

function edges(img: Pixels, amount: number, detail: number, unit: number) {
  const px = img.data;
  const mag = edgeMagnitude(img, unit);
  const k = detail * 0.004;

  for (let p = 0, i = 0; p < mag.length; p++, i += 4) {
    const glow = Math.min(1, mag[p] * k);

    for (let c = 0; c < 3; c++) {
      // สีเดิมสว่างขึ้นเล็กน้อยเพื่อให้เส้นเรืองบนพื้นดำ
      const v = Math.min(255, px[i + c] * 1.3 + 30) * glow;

      px[i + c] = px[i + c] + (v - px[i + c]) * amount;
    }
  }
}

function emboss(img: Pixels, amount: number, angleDeg: number, depth: number, unit: number) {
  const { data: px, width: w, height: h } = img;
  const lum = lumPlane(img);
  const dist = Math.max(1, unit * 0.15);
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * dist;
  const dy = -Math.sin(rad) * dist;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 128 + (sampleBilinear(lum, w, h, x - dx, y - dy) - sampleBilinear(lum, w, h, x + dx, y + dy)) * depth * 0.5;
      const i = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) px[i + c] = px[i + c] + (v - px[i + c]) * amount;
    }
  }
}

/// ค่าเฉลี่ยของหน้าต่าง q×q ที่มุมซ้ายบนอยู่ที่แต่ละพิกเซล (ขอบยืดค่าปลาย)
function anchoredMean(plane: Float32Array, w: number, h: number, q: number, tmp: Float32Array) {
  const inv = 1 / q;

  for (let y = 0; y < h; y++) {
    const base = y * w;
    const last = plane[base + w - 1];
    let acc = 0;

    for (let k = 0; k < q; k++) acc += k < w ? plane[base + k] : last;

    for (let x = 0; x < w; x++) {
      tmp[base + x] = acc * inv;
      acc += (x + q < w ? plane[base + x + q] : last) - plane[base + x];
    }
  }

  const acc = new Float64Array(w);
  const lastRow = (h - 1) * w;

  for (let k = 0; k < q; k++) {
    const row = k < h ? k * w : lastRow;

    for (let x = 0; x < w; x++) acc[x] += tmp[row + x];
  }

  for (let y = 0; y < h; y++) {
    const base = y * w;
    const add = y + q < h ? (y + q) * w : lastRow;

    for (let x = 0; x < w; x++) {
      plane[base + x] = acc[x] * inv;
      acc[x] += tmp[add + x] - tmp[base + x];
    }
  }
}

/// ภาพสีน้ำมัน: ฟิลเตอร์ Kuwahara — เลือกสีเฉลี่ยของมุมที่สีเรียบที่สุดในสี่มุมรอบพิกเซล
/// ค่าเฉลี่ยทุกหน้าต่างคำนวณด้วยผลรวมสะสม จึงใช้เวลาเท่าเดิมไม่ว่ารัศมีเท่าไร
function oil(img: Pixels, radius: number) {
  const { data: px, width: w, height: h } = img;
  const r = Math.max(1, Math.round(radius));
  const q = r + 1;
  const n = w * h;
  const tmp = new Float32Array(n);
  const plane = new Float32Array(n);
  const means: Uint8ClampedArray[] = [];

  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) plane[i] = px[i * 4 + c];
    anchoredMean(plane, w, h, q, tmp);

    const mean = new Uint8ClampedArray(n);

    for (let i = 0; i < n; i++) mean[i] = plane[i];
    means.push(mean);
  }

  const meanL = new Float32Array(n);
  const meanL2 = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const l = lumOf(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);

    meanL[i] = l;
    meanL2[i] = l * l;
  }

  anchoredMean(meanL, w, h, q, tmp);
  anchoredMean(meanL2, w, h, q, tmp);

  const variance = new Float32Array(n);

  for (let i = 0; i < n; i++) variance[i] = meanL2[i] - meanL[i] * meanL[i];

  for (let y = 0; y < h; y++) {
    const top = (y - r > 0 ? y - r : 0) * w;
    const row = y * w;

    for (let x = 0; x < w; x++) {
      const x0 = x - r > 0 ? x - r : 0;
      let best = top + x0;
      let bestVar = variance[best];
      let idx = top + x;

      if (variance[idx] < bestVar) {
        bestVar = variance[idx];
        best = idx;
      }

      idx = row + x0;

      if (variance[idx] < bestVar) {
        bestVar = variance[idx];
        best = idx;
      }

      idx = row + x;

      if (variance[idx] < bestVar) best = idx;

      const i = (row + x) * 4;

      px[i] = means[0][best];
      px[i + 1] = means[1][best];
      px[i + 2] = means[2][best];
    }
  }
}

// ── เบลอ ───────────────────────────────────────────────────────────

export function gaussianBlur(img: Pixels, sigma: number) {
  if (sigma < 0.5) return;

  const tmp = new Float32Array(img.width * img.height);

  transformPlanes(img, (plane) => gaussianPlane(plane, img.width, img.height, sigma, tmp));
}

function transpose(plane: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(plane.length);

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + y] = plane[y * w + x];

  return out;
}

/// เบลอตามแนวเส้นที่ชัน `t` (dy/dx, |t| ≤ 1) ยาว ±`half` พิกเซลตามแกน x
/// วิธี: เฉือนภาพให้เส้นนั้นเป็นแนวนอน → box blur แนวนอน → เฉือนกลับ (ทุกขั้น O(n))
function shearBlur(plane: Float32Array, w: number, h: number, t: number, half: number): Float32Array {
  const offset = t >= 0 ? (w - 1) * t : 0;
  const rows = Math.ceil(h - 1 + Math.abs(t) * (w - 1)) + 2;
  const sheared = new Float32Array(w * rows);
  const weight = new Float32Array(w * rows);

  // เดินทีละแถวของภาพเฉือน (|t| ≤ 1 → แถวต้นทางเปลี่ยนช้า อ่านหน่วยความจำเกือบต่อเนื่อง)
  for (let j = 0; j < rows; j++) {
    const base = j * w;

    for (let x = 0; x < w; x++) {
      const y = j - offset + x * t;

      if (y < -0.999 || y > h - 0.001) continue;

      const yc = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
      const y0 = Math.floor(yc);
      const y1 = y0 + 1 < h ? y0 + 1 : y0;
      const f = yc - y0;
      // น้ำหนักลดลงที่ขอบ เพื่อให้ค่าเฉลี่ยใช้แต่พิกเซลจริง (ขอบไม่จางเป็นดำ)
      const wgt = y < 0 ? 1 + y : y > h - 1 ? h - y : 1;

      sheared[base + x] = (plane[y0 * w + x] * (1 - f) + plane[y1 * w + x] * f) * wgt;
      weight[base + x] = wgt;
    }
  }

  const r = Math.max(1, Math.round(half));
  const line = new Float32Array(w);
  const lineW = new Float32Array(w);

  for (let j = 0; j < rows; j++) {
    const base = j * w;
    let acc = 0;
    let accW = 0;

    for (let k = -r; k <= r; k++) {
      if (k < 0 || k >= w) continue;
      acc += sheared[base + k];
      accW += weight[base + k];
    }

    for (let x = 0; x < w; x++) {
      line[x] = acc;
      lineW[x] = accW;

      const add = x + r + 1;
      const sub = x - r;

      if (add < w) {
        acc += sheared[base + add];
        accW += weight[base + add];
      }

      if (sub >= 0) {
        acc -= sheared[base + sub];
        accW -= weight[base + sub];
      }
    }

    sheared.set(line, base);
    weight.set(lineW, base);
  }

  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = y + offset - x * t;
      const j0 = Math.floor(s);
      const j1 = j0 + 1 < rows ? j0 + 1 : j0;
      const f = s - j0;
      const v = sheared[j0 * w + x] * (1 - f) + sheared[j1 * w + x] * f;
      const wv = weight[j0 * w + x] * (1 - f) + weight[j1 * w + x] * f;

      out[y * w + x] = wv > 1e-6 ? v / wv : plane[y * w + x];
    }
  }

  return out;
}

export function motionBlur(img: Pixels, length: number, angleDeg: number) {
  const { width: w, height: h } = img;

  if (length < 1) return;

  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  transformPlanes(img, (plane) => {
    if (Math.abs(dx) >= Math.abs(dy)) return shearBlur(plane, w, h, dy / dx, (length / 2) * Math.abs(dx));

    const blurred = shearBlur(transpose(plane, w, h), h, w, dx / dy, (length / 2) * Math.abs(dy));

    return transpose(blurred, h, w);
  });
}

/// เบลอซูม: ทำบนภาพย่อ (เบลอหนักอยู่แล้ว) ด้วยการเฉลี่ยภาพที่ขยาย/ย่อรอบจุดศูนย์กลางซ้ำแบบทวีคูณ
/// แล้วผสมกลับกับภาพคมตามระยะจากศูนย์กลาง (ใจกลางภาพยังคม)
function zoomBlur(img: Pixels, amount: number, cxRatio: number, cyRatio: number) {
  const { data: px, width: w, height: h } = img;
  const strength = amount * 0.5;

  if (strength <= 0) return;

  const scale = Math.min(1, 360 / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const n = sw * sh;
  // ภาพย่อแบบสลับช่อง RGBA (premultiplied) — อ่าน bilinear ครั้งเดียวได้ครบสี่ช่อง
  let cur = new Float32Array(n * 4);
  let next = new Float32Array(n * 4);
  const counts = new Float32Array(n);

  for (let y = 0; y < h; y++) {
    const ty = Math.min(sh - 1, Math.floor(y * scale));

    for (let x = 0; x < w; x++) {
      const t = ty * sw + Math.min(sw - 1, Math.floor(x * scale));
      const i = (y * w + x) * 4;
      const a = px[i + 3] / 255;

      cur[t * 4] += px[i] * a;
      cur[t * 4 + 1] += px[i + 1] * a;
      cur[t * 4 + 2] += px[i + 2] * a;
      cur[t * 4 + 3] += px[i + 3];
      counts[t]++;
    }
  }

  for (let i = 0; i < n; i++) {
    const k = 1 / Math.max(1, counts[i]);

    for (let c = 0; c < 4; c++) cur[i * 4 + c] *= k;
  }

  /// บวกค่า bilinear ของจุด (x, y) × น้ำหนัก ลง `out[o..o+3]`
  const addSample = (src: Float32Array, out: Float32Array, o: number, x: number, y: number, k: number) => {
    const xc = x < 0 ? 0 : x > sw - 1 ? sw - 1 : x;
    const yc = y < 0 ? 0 : y > sh - 1 ? sh - 1 : y;
    const x0 = Math.floor(xc);
    const y0 = Math.floor(yc);
    const x1 = x0 + 1 < sw ? x0 + 1 : x0;
    const y1 = y0 + 1 < sh ? y0 + 1 : y0;
    const fx = xc - x0;
    const fy = yc - y0;
    const w00 = (1 - fx) * (1 - fy) * k;
    const w10 = fx * (1 - fy) * k;
    const w01 = (1 - fx) * fy * k;
    const w11 = fx * fy * k;
    const i00 = (y0 * sw + x0) * 4;
    const i10 = (y0 * sw + x1) * 4;
    const i01 = (y1 * sw + x0) * 4;
    const i11 = (y1 * sw + x1) * 4;

    for (let c = 0; c < 4; c++) out[o + c] += src[i00 + c] * w00 + src[i10 + c] * w10 + src[i01 + c] * w01 + src[i11 + c] * w11;
  };

  const cx = cxRatio * (sw - 1);
  const cy = cyRatio * (sh - 1);
  const maxRadius = Math.hypot(Math.max(cx, sw - 1 - cx), Math.max(cy, sh - 1 - cy));
  let delta = -Math.log(1 - strength);

  while (delta * maxRadius > 0.5) {
    const up = Math.exp(delta / 2);
    const down = Math.exp(-delta / 2);

    next.fill(0);

    for (let y = 0; y < sh; y++) {
      const oy = y - cy;

      for (let x = 0; x < sw; x++) {
        const ox = x - cx;
        const o = (y * sw + x) * 4;

        addSample(cur, next, o, cx + ox * up, cy + oy * up, 0.5);
        addSample(cur, next, o, cx + ox * down, cy + oy * down, 0.5);
      }
    }

    [cur, next] = [next, cur];
    delta /= 2;
  }

  // ขยายกลับ แล้วผสมกับภาพเดิมตามระยะที่เบลอ (ศูนย์กลางเบลอน้อย → ใช้ภาพคม)
  const fullCx = cxRatio * (w - 1);
  const fullCy = cyRatio * (h - 1);
  const blurPerPx = -Math.log(1 - strength);
  const sample = new Float32Array(4);

  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) * scale - 0.5;
    const dy2 = (y - fullCy) * (y - fullCy);

    for (let x = 0; x < w; x++) {
      const reach = Math.sqrt((x - fullCx) * (x - fullCx) + dy2) * blurPerPx;
      const t = (reach - 1) / 6;

      if (t <= 0) continue;

      const mix = t > 1 ? 1 : t;
      const i = (y * w + x) * 4;

      sample.fill(0);
      addSample(cur, sample, 0, (x + 0.5) * scale - 0.5, sy, 1);

      const a = sample[3];

      for (let c = 0; c < 3; c++) {
        const v = a > 0.5 ? (sample[c] * 255) / a : 0;

        px[i + c] += (v - px[i + c]) * mix;
      }

      px[i + 3] += (a - px[i + 3]) * mix;
    }
  }
}

function tiltShift(img: Pixels, position: number, band: number, sigma: number) {
  const { data: px, width: w, height: h } = img;

  if (sigma < 0.5) return;

  const blurred: Pixels = { data: new Uint8ClampedArray(px), width: w, height: h };

  gaussianBlur(blurred, sigma);

  const half = band / 2;
  const fade = 0.15;

  for (let y = 0; y < h; y++) {
    const d = Math.abs(y / Math.max(1, h - 1) - position);
    const t = Math.max(0, Math.min(1, (d - half) / fade));
    const m = t * t * (3 - 2 * t);

    if (m <= 0) continue;

    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      for (let c = 0; c < 4; c++) px[i + c] = px[i + c] + (blurred.data[i + c] - px[i + c]) * m;
    }
  }
}

// ── แสงและเลนส์ ─────────────────────────────────────────────────────

function chromatic(img: Pixels, k: number) {
  const { data: px, width: w, height: h } = img;

  if (k <= 0) return;

  const n = w * h;
  const red = new Float32Array(n);
  const blue = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    red[i] = px[i * 4];
    blue[i] = px[i * 4 + 2];
  }

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ox = x - cx;
      const oy = y - cy;

      px[i] = sampleBilinear(red, w, h, cx + ox * (1 - k), cy + oy * (1 - k));
      px[i + 2] = sampleBilinear(blue, w, h, cx + ox * (1 + k), cy + oy * (1 + k));
    }
  }
}

function lightLeak(img: Pixels, color: [number, number, number], amount: number, angleDeg: number, size: number) {
  const { data: px, width: w, height: h } = img;
  const rad = (angleDeg * Math.PI) / 180;
  const lx = w / 2 + Math.cos(rad) * w * 0.55;
  const ly = h / 2 - Math.sin(rad) * h * 0.55;
  const radius = Math.max(1, size * Math.max(w, h));
  const s = color.map((v) => v / 255);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - lx, y - ly) / radius;

      if (d >= 1) continue;

      const wgt = amount * (1 - d) * (1 - d);
      const i = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const b = px[i + c] / 255;

        px[i + c] = (b + (blendChannel('screen', b, s[c]) - b) * wgt) * 255;
      }
    }
  }
}

// ── ตัวเรียกรวม ─────────────────────────────────────────────────────

/// ใช้เอฟเฟกต์หนึ่งตัวกับพิกเซลในที่ · `unit` = 1% ของด้านสั้น (พิกเซล)
export function applyEffect(img: Pixels, effect: ImageEffect, unit = Math.min(img.width, img.height) / 100) {
  if (img.width === 0 || img.height === 0) return;

  const p = effectParams(effect);
  const colors = effectColors(effect);
  const amount = (p.amount ?? 100) / 100;

  switch (effect.kind) {
    case 'duotone':
      return gradientMap(img, colors.slice(0, 2), amount);
    case 'gradient-map':
      return gradientMap(img, colors.length >= 2 ? colors.slice(0, 5) : [[0, 0, 0], [255, 255, 255]], amount);
    case 'posterize':
      return posterize(img, p.levels);
    case 'threshold':
      return threshold(img, p.level, colors[0], colors[1]);
    case 'invert':
      return invert(img, amount);
    case 'color-overlay':
      return colorOverlay(img, colors[0], amount, OVERLAY_MODES.find((m) => m.value === Math.round(p.mode))?.mode ?? 'normal');
    case 'halftone':
      return halftone(img, p.size * unit, p.angle, amount, colors[0], colors[1]);
    case 'pixelate':
      return pixelate(img, p.size * unit);
    case 'grain':
      return grain(img, amount, p.size * unit * 0.12, Math.round(p.seed));
    case 'glitch':
      return glitch(img, p.offset * unit, Math.round(p.slices), Math.round(p.seed));
    case 'sketch':
      return sketch(img, amount, p.detail, unit);
    case 'edges':
      return edges(img, amount, p.detail, unit);
    case 'emboss':
      return emboss(img, amount, p.angle, p.depth, unit);
    case 'oil':
      return oil(img, p.radius * unit * 0.25);
    case 'blur':
      return gaussianBlur(img, p.radius * unit);
    case 'motion-blur':
      return motionBlur(img, p.distance * unit, p.angle);
    case 'zoom-blur':
      return zoomBlur(img, amount, p.x / 100, p.y / 100);
    case 'tilt-shift':
      return tiltShift(img, p.position / 100, p.band / 100, p.blur * unit);
    case 'chromatic':
      return chromatic(img, p.shift / 100);
    case 'light-leak':
      return lightLeak(img, colors[0], amount, p.angle, p.size / 100);
  }
}

export function applyEffects(img: Pixels, effects: ImageEffect[] | null | undefined) {
  const unit = Math.min(img.width, img.height) / 100;

  for (const effect of activeEffects(effects)) applyEffect(img, effect, unit);
}
