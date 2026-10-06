import type { ColorEdit, ImageAdjust } from './types';

/// การปรับรูปและฟิลเตอร์สำเร็จรูป (แผง "แก้ไขรูปภาพ" → ปรับ / ฟิลเตอร์)
///
/// ประมวลผลพิกเซลจริงบน canvas ฝั่งผู้ใช้ — ไม่ส่งรูปออกนอกเครื่อง ผลที่ได้เหมือนกันทั้งบนจอ
/// ภาพย่อ และไฟล์ที่ดาวน์โหลด · ค่าทุกตัว −100..100 (0 = ไม่ปรับ)

export const ADJUST_ZERO: ImageAdjust = {
  temperature: 0,
  tint: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vibrance: 0,
  saturation: 0,
  sharpness: 0,
  clarity: 0,
  vignette: 0,
  blur: 0,
};

export type FilterGroup = 'basic' | 'natural' | 'warm' | 'cool' | 'vintage' | 'mono' | 'duotone' | 'cinema' | 'neon';

type Rgb = [number, number, number];

export interface FilterPreset {
  key: string;
  label: string;
  group: FilterGroup;
  adjust: Partial<ImageAdjust>;
  /// แปลงเป็นขาวดำก่อนปรับ
  mono?: boolean;
  /// น้ำหนักสี [แดง, เขียว, น้ำเงิน] ตอนแปลงขาวดำ (แบบใส่ฟิลเตอร์สีหน้าเลนส์) · ไม่มี = ความสว่างมาตรฐาน
  monoMix?: Rgb;
  /// ลดจำนวนระดับสี (โปสเตอร์)
  posterize?: number;
  /// ทับสีโทนเดียว (duotone) — [เงา, แสง]
  duotone?: [Rgb, Rgb];
  /// ย้อมสีแยกโทน (split toning): เงาเอียงไปทาง `shadows` ส่วนสว่างเอียงไปทาง `highlights` · strength 0–1
  splitTone?: { shadows: Rgb; highlights: Rgb; strength: number };
}

export const FILTER_GROUPS: { key: FilterGroup; label: string }[] = [
  { key: 'basic', label: 'พื้นฐาน' },
  { key: 'natural', label: 'ธรรมชาติ' },
  { key: 'warm', label: 'อบอุ่น' },
  { key: 'cool', label: 'เย็น' },
  { key: 'vintage', label: 'วินเทจ/ฟิล์ม' },
  { key: 'mono', label: 'ขาวดำ' },
  { key: 'duotone', label: 'ดูโอโทน' },
  { key: 'cinema', label: 'ภาพยนตร์' },
  { key: 'neon', label: 'นีออน/ป๊อป' },
];

/// key ของฟิลเตอร์ถูกเก็บในงานของผู้ใช้ — ห้ามเปลี่ยนหรือลบ key เดิม (เพิ่มใหม่ได้)
export const FILTER_PRESETS: FilterPreset[] = [
  { key: 'mono', label: 'ขาวดำ', group: 'mono', adjust: { contrast: 10 }, mono: true },
  { key: 'pop', label: 'สีโดด', group: 'basic', adjust: { saturation: 45, contrast: 20, vibrance: 30 } },
  { key: 'vivid', label: 'สดจัด', group: 'basic', adjust: { saturation: 30, vibrance: 40, contrast: 15, clarity: 10 } },
  { key: 'crisp', label: 'คมชัด', group: 'basic', adjust: { clarity: 35, sharpness: 25, contrast: 10 } },
  { key: 'soft', label: 'นุ่มนวล', group: 'basic', adjust: { contrast: -20, highlights: -15, shadows: 15, clarity: -20 } },
  { key: 'poster', label: 'โปสเตอร์', group: 'basic', adjust: { saturation: 20 }, posterize: 5 },
  { key: 'fresh', label: 'สดใส', group: 'natural', adjust: { brightness: 8, vibrance: 25, clarity: 15 } },
  { key: 'meadow', label: 'ทุ่งหญ้า', group: 'natural', adjust: { tint: -12, saturation: 12, shadows: 15 } },
  { key: 'forest', label: 'ป่าเขียว', group: 'natural', adjust: { tint: -20, temperature: -5, saturation: 15, shadows: 10, contrast: 10 } },
  { key: 'bloom', label: 'ดอกไม้บาน', group: 'natural', adjust: { brightness: 10, vibrance: 30, tint: 10, highlights: -10 } },
  { key: 'sky', label: 'ฟ้าใส', group: 'natural', adjust: { temperature: -15, vibrance: 25, highlights: -20, contrast: 10 } },
  { key: 'mist', label: 'หมอก', group: 'natural', adjust: { contrast: -25, brightness: 10, saturation: -20, blacks: 25 } },
  { key: 'stone', label: 'หินผา', group: 'natural', adjust: { saturation: -35, contrast: 15, clarity: 20 } },
  { key: 'sunset', label: 'ยามเย็น', group: 'warm', adjust: { temperature: 35, saturation: 15, highlights: -10 } },
  { key: 'golden', label: 'แสงทอง', group: 'warm', adjust: { temperature: 40, highlights: 10, saturation: 15, vignette: 15 } },
  { key: 'honey', label: 'น้ำผึ้ง', group: 'warm', adjust: { temperature: 30, tint: 10, contrast: -10, blacks: 15, saturation: 10 } },
  {
    key: 'autumn',
    label: 'ใบไม้ร่วง',
    group: 'warm',
    adjust: { temperature: 25, tint: 10, saturation: 25, contrast: 15 },
    splitTone: { shadows: [90, 40, 20], highlights: [255, 190, 90], strength: 0.2 },
  },
  { key: 'latte', label: 'ลาเต้', group: 'warm', adjust: { temperature: 20, saturation: -20, contrast: -10, blacks: 15 } },
  { key: 'peach', label: 'พีช', group: 'warm', adjust: { temperature: 15, tint: 15, brightness: 8 } },
  { key: 'ocean', label: 'มหาสมุทร', group: 'cool', adjust: { temperature: -35, saturation: 10, contrast: 10 } },
  { key: 'frost', label: 'น้ำแข็ง', group: 'cool', adjust: { temperature: -25, brightness: 12, saturation: -15 } },
  { key: 'mint', label: 'มิ้นต์', group: 'cool', adjust: { temperature: -15, tint: -15, brightness: 10, saturation: -10 } },
  { key: 'arctic', label: 'ขั้วโลก', group: 'cool', adjust: { temperature: -40, brightness: 15, contrast: 15, saturation: -25 } },
  { key: 'rain', label: 'ฝนพรำ', group: 'cool', adjust: { temperature: -20, saturation: -35, contrast: -10, blacks: 15, vignette: 20 } },
  { key: 'night', label: 'ราตรี', group: 'cool', adjust: { temperature: -20, brightness: -15, contrast: 20, vignette: 40 } },
  { key: 'film', label: 'ฟิล์ม', group: 'vintage', adjust: { temperature: 15, contrast: -15, blacks: 30, saturation: -15, vignette: 30 } },
  {
    key: 'polaroid',
    label: 'โพลารอยด์',
    group: 'vintage',
    adjust: { temperature: 10, tint: 8, contrast: -10, blacks: 25, saturation: -10, vignette: 20 },
    splitTone: { shadows: [40, 60, 90], highlights: [255, 235, 200], strength: 0.25 },
  },
  {
    key: 'kodak',
    label: 'ฟิล์มอบอุ่น',
    group: 'vintage',
    adjust: { temperature: 20, saturation: 10, contrast: 10, blacks: 15 },
    splitTone: { shadows: [60, 40, 30], highlights: [255, 220, 170], strength: 0.3 },
  },
  {
    key: 'seventies',
    label: 'ยุค 70',
    group: 'vintage',
    adjust: { temperature: 25, saturation: -25, blacks: 40, contrast: -20 },
    splitTone: { shadows: [90, 60, 40], highlights: [255, 200, 120], strength: 0.3 },
  },
  {
    key: 'cross',
    label: 'ครอสโปรเซส',
    group: 'vintage',
    adjust: { contrast: 25, saturation: 20 },
    splitTone: { shadows: [0, 60, 120], highlights: [255, 240, 140], strength: 0.45 },
  },
  {
    key: 'retro-green',
    label: 'ฟิล์มเขียว',
    group: 'vintage',
    adjust: { tint: -20, blacks: 25, contrast: -10 },
    splitTone: { shadows: [30, 70, 50], highlights: [240, 230, 190], strength: 0.35 },
  },
  { key: 'sepia', label: 'ซีเปีย', group: 'vintage', adjust: {}, duotone: [[50, 30, 15], [245, 225, 190]] },
  { key: 'fade', label: 'ซีดจาง', group: 'vintage', adjust: { contrast: -30, blacks: 40, saturation: -30 } },
  { key: 'noir', label: 'นัวร์', group: 'mono', adjust: { contrast: 50, clarity: 20, vignette: 45 }, mono: true },
  { key: 'silver', label: 'เงินยวง', group: 'mono', adjust: { contrast: -10, brightness: 10, highlights: 10, blacks: 15 }, mono: true },
  { key: 'red-filter', label: 'ฟิลเตอร์แดง', group: 'mono', adjust: { contrast: 25 }, mono: true, monoMix: [0.8, 0.2, 0] },
  { key: 'soft-mono', label: 'ขาวดำนุ่ม', group: 'mono', adjust: { contrast: -25, blacks: 25, brightness: 5 }, mono: true },
  { key: 'high-key', label: 'ไฮคีย์', group: 'mono', adjust: { brightness: 25, contrast: -15, shadows: 30 }, mono: true },
  { key: 'duo-violet', label: 'ม่วงทูโทน', group: 'duotone', adjust: {}, duotone: [[40, 10, 90], [255, 170, 120]] },
  { key: 'duo-ocean', label: 'ทะเลลึก', group: 'duotone', adjust: { contrast: 10 }, duotone: [[10, 30, 80], [120, 230, 220]] },
  { key: 'duo-pink', label: 'ชมพูคราม', group: 'duotone', adjust: { contrast: 10 }, duotone: [[40, 20, 110], [255, 120, 170]] },
  { key: 'duo-lime', label: 'มะนาว', group: 'duotone', adjust: { contrast: 10 }, duotone: [[20, 60, 40], [210, 255, 90]] },
  { key: 'duo-fire', label: 'เพลิง', group: 'duotone', adjust: { contrast: 15 }, duotone: [[90, 10, 20], [255, 200, 60]] },
  { key: 'selenium', label: 'ซีลีเนียม', group: 'duotone', adjust: { contrast: 15 }, duotone: [[30, 25, 45], [235, 228, 238]] },
  {
    key: 'teal-orange',
    label: 'ฟ้าส้มฮอลลีวูด',
    group: 'cinema',
    adjust: { contrast: 15, saturation: 10 },
    splitTone: { shadows: [0, 128, 140], highlights: [255, 160, 80], strength: 0.5 },
  },
  {
    key: 'blockbuster',
    label: 'บล็อกบัสเตอร์',
    group: 'cinema',
    adjust: { contrast: 25, vibrance: 15, vignette: 25 },
    splitTone: { shadows: [20, 90, 140], highlights: [255, 190, 120], strength: 0.4 },
  },
  {
    key: 'matrix',
    label: 'เมทริกซ์',
    group: 'cinema',
    adjust: { tint: -40, saturation: -30, contrast: 20 },
    splitTone: { shadows: [10, 80, 40], highlights: [170, 255, 170], strength: 0.4 },
  },
  {
    key: 'moody',
    label: 'มู้ดดี้',
    group: 'cinema',
    adjust: { saturation: -35, contrast: 20, vignette: 35 },
    splitTone: { shadows: [30, 40, 70], highlights: [200, 180, 150], strength: 0.3 },
  },
  { key: 'bleach', label: 'บลีชบายพาส', group: 'cinema', adjust: { saturation: -55, contrast: 40, clarity: 25 } },
  {
    key: 'dune',
    label: 'ทะเลทราย',
    group: 'cinema',
    adjust: { temperature: 30, saturation: -10, contrast: 10 },
    splitTone: { shadows: [120, 70, 30], highlights: [255, 210, 150], strength: 0.35 },
  },
  {
    key: 'neon',
    label: 'นีออน',
    group: 'neon',
    adjust: { saturation: 60, contrast: 25 },
    splitTone: { shadows: [80, 0, 160], highlights: [0, 255, 230], strength: 0.45 },
  },
  {
    key: 'cyberpunk',
    label: 'ไซเบอร์พังก์',
    group: 'neon',
    adjust: { contrast: 25, saturation: 30, tint: 20 },
    splitTone: { shadows: [40, 0, 120], highlights: [255, 40, 200], strength: 0.5 },
  },
  {
    key: 'vaporwave',
    label: 'เวเปอร์เวฟ',
    group: 'neon',
    adjust: { contrast: -10, blacks: 20, saturation: 20 },
    splitTone: { shadows: [60, 40, 180], highlights: [255, 140, 220], strength: 0.5 },
  },
  {
    key: 'candy',
    label: 'ลูกกวาด',
    group: 'neon',
    adjust: { saturation: 35, brightness: 10, contrast: -10, tint: 15 },
    splitTone: { shadows: [140, 100, 255], highlights: [255, 200, 220], strength: 0.25 },
  },
  {
    key: 'acid',
    label: 'แอซิด',
    group: 'neon',
    adjust: { saturation: 80, contrast: 30 },
    splitTone: { shadows: [0, 160, 60], highlights: [255, 240, 0], strength: 0.4 },
  },
];

export function findFilter(key: string | null | undefined): FilterPreset | null {
  return FILTER_PRESETS.find((f) => f.key === key) ?? null;
}

/// รวมค่าปรับของผู้ใช้กับฟิลเตอร์ (ฟิลเตอร์คูณด้วยความแรง)
export function effectiveAdjust(adjust: Partial<ImageAdjust> | null | undefined, filter: FilterPreset | null, intensity: number): ImageAdjust {
  const out = { ...ADJUST_ZERO, ...(adjust ?? {}) };

  if (filter) {
    const k = intensity / 100;

    for (const [key, value] of Object.entries(filter.adjust) as [keyof ImageAdjust, number][]) {
      out[key] = Math.max(-100, Math.min(100, out[key] + value * k));
    }
  }

  return out;
}

export function isNeutral(adjust: ImageAdjust, filter: FilterPreset | null): boolean {
  return !filter && Object.values(adjust).every((v) => v === 0);
}

/// ImageData หรือบัฟเฟอร์ที่หน้าตาเหมือนกัน (เทสต์ใช้ได้โดยไม่ต้องมี canvas)
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const MONO_WEIGHTS: Rgb = [0.299, 0.587, 0.114];

/// ประมวลผลพิกเซลในที่ (ImageData ขนาดใดก็ได้)
export function applyAdjust(data: PixelBuffer, a: ImageAdjust, filter: FilterPreset | null, intensity: number) {
  const px = data.data;
  const w = data.width;
  const h = data.height;
  const k = intensity / 100;
  const contrast = (259 * (a.contrast * 1.6 + 255)) / (255 * (259 - a.contrast * 1.6));
  const sat = 1 + a.saturation / 100;
  const vib = a.vibrance / 100;
  const bright = a.brightness * 1.2;
  const blackPoint = a.blacks * 0.5;
  const whitePoint = 255 - a.whites * 0.5;
  const vignette = a.vignette / 100;
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.hypot(cx, cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = px[i];
      let g = px[i + 1];
      let b = px[i + 2];

      if (filter?.mono) {
        const mix = filter.monoMix ?? MONO_WEIGHTS;
        const l = mix[0] * r + mix[1] * g + mix[2] * b;

        r = r + (l - r) * k;
        g = g + (l - g) * k;
        b = b + (l - b) * k;
      }

      // อุณหภูมิ: อุ่น = เพิ่มแดงลดน้ำเงิน · สีอ่อน (tint): บวก = ม่วงแดง ลบ = เขียว
      r += a.temperature * 0.5;
      b -= a.temperature * 0.5;
      g -= a.tint * 0.4;

      r += bright;
      g += bright;
      b += bright;

      r = contrast * (r - 128) + 128;
      g = contrast * (g - 128) + 128;
      b = contrast * (b - 128) + 128;

      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // ไฮไลต์มีผลกับส่วนสว่าง · เงามีผลกับส่วนมืด
      const toneShift = a.highlights * 0.6 * l * l + a.shadows * 0.6 * (1 - l) * (1 - l);

      r += toneShift;
      g += toneShift;
      b += toneShift;

      // จุดดำ/จุดขาว
      if (blackPoint || whitePoint !== 255) {
        const range = Math.max(1, whitePoint - blackPoint);

        r = blackPoint + (r / 255) * range;
        g = blackPoint + (g / 255) * range;
        b = blackPoint + (b / 255) * range;
      }

      if (sat !== 1 || vib) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        // ความสดใส (vibrance) เพิ่มสีให้ส่วนที่ยังซีดมากกว่าส่วนที่สดอยู่แล้ว
        const s = sat + vib * (1 - (max - min) / 255);

        r = gray + (r - gray) * s;
        g = gray + (g - gray) * s;
        b = gray + (b - gray) * s;
      }

      if (filter?.splitTone) {
        const { shadows: dark, highlights: light, strength } = filter.splitTone;
        const t = clamp(0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const ws = (1 - t) * (1 - t) * strength * k;
        const wh = t * t * strength * k;

        r += (dark[0] - 128) * ws + (light[0] - 128) * wh;
        g += (dark[1] - 128) * ws + (light[1] - 128) * wh;
        b += (dark[2] - 128) * ws + (light[2] - 128) * wh;
      }

      if (filter?.duotone) {
        const t = clamp(0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const [dark, light] = filter.duotone;

        r = r + (dark[0] + (light[0] - dark[0]) * t - r) * k;
        g = g + (dark[1] + (light[1] - dark[1]) * t - g) * k;
        b = b + (dark[2] + (light[2] - dark[2]) * t - b) * k;
      }

      if (filter?.posterize) {
        const step = 255 / (filter.posterize - 1);

        r = Math.round(clamp(r) / step) * step;
        g = Math.round(clamp(g) / step) * step;
        b = Math.round(clamp(b) / step) * step;
      }

      if (vignette) {
        const d = Math.hypot(x - cx, y - cy) / maxDist;
        const f = 1 - vignette * Math.max(0, d - 0.35) * 1.4;

        r *= f;
        g *= f;
        b *= f;
      }

      px[i] = clamp(r);
      px[i + 1] = clamp(g);
      px[i + 2] = clamp(b);
    }
  }

  const sharpen = (a.sharpness + a.clarity * 0.6) / 100;

  if (sharpen) convolveSharpen(data, sharpen);
}

/// ความคมชัด: unsharp mask แบบ 3×3 (ค่าติดลบ = นุ่มลง)
function convolveSharpen(data: PixelBuffer, amount: number) {
  const { width: w, height: h } = data;
  const src = new Uint8ClampedArray(data.data);
  const px = data.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const blur =
          (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c] + src[i + c] * 4) / 8;

        px[i + c] = clamp(src[i + c] + (src[i + c] - blur) * amount * 2);
      }
    }
  }
}

/// สีเด่นในรูป ("สีในรูป" ของตัวเลือกสี) — ย่อรูปแล้วนับสีที่ปัดเป็นกลุ่ม
export function dominantColors(img: CanvasImageSource, count = 6): string[] {
  if (typeof document === 'undefined') return [];

  const canvas = document.createElement('canvas');
  const size = 48;

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) return [];

  try {
    ctx.drawImage(img, 0, 0, size, size);

    const px = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();

    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;

      const key = `${px[i] >> 5}-${px[i + 1] >> 5}-${px[i + 2] >> 5}`;
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };

      bucket.n++;
      bucket.r += px[i];
      bucket.g += px[i + 1];
      bucket.b += px[i + 2];
      buckets.set(key, bucket);
    }

    return [...buckets.values()]
      .sort((x, y) => y.n - x.n)
      .slice(0, count)
      .map((b) => `rgb(${Math.round(b.r / b.n)} ${Math.round(b.g / b.n)} ${Math.round(b.b / b.n)})`);
  } catch {
    // รูปข้ามโดเมน (canvas ถูก taint) อ่านพิกเซลไม่ได้
    return [];
  }
}

// ── แก้ไขสีเฉพาะช่วง ────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;

  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;

  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/// "rgb(r g b)" หรือ "rgb(r, g, b)" → [r, g, b]
function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);

  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const HUE_RANGE = 35;

/// ปรับเฉพาะพิกเซลที่เฉดสีใกล้สีที่เลือก (ห่างไม่เกิน ±35° ค่อยๆ จางลง) · สีเทาแทบไม่ถูกแตะ
export function applyColorEdits(data: PixelBuffer, edits: ColorEdit[]) {
  const targets = edits
    .filter((e) => e.hue || e.saturation || e.lightness)
    .map((e) => {
      const rgb = parseRgb(e.color);

      return rgb ? { hue: rgbToHsl(...rgb)[0], edit: e } : null;
    })
    .filter((t): t is { hue: number; edit: ColorEdit } => t !== null);

  if (targets.length === 0) return;

  const px = data.data;

  for (let i = 0; i < px.length; i += 4) {
    let [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);

    if (s < 0.08) continue;

    let changed = false;

    for (const { hue, edit } of targets) {
      const dist = Math.abs(((h - hue + 540) % 360) - 180);

      if (dist >= HUE_RANGE) continue;

      const w = (1 - dist / HUE_RANGE) * Math.min(1, s / 0.25);

      h += edit.hue * 0.6 * w;
      s = Math.max(0, Math.min(1, s * (1 + (edit.saturation / 100) * w)));
      l = Math.max(0, Math.min(1, l + (edit.lightness / 100) * 0.35 * w));
      changed = true;
    }

    if (!changed) continue;

    const [r, g, b] = hslToRgb(h, s, l);

    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
}
