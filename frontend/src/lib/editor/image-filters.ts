import type { ImageAdjust } from './types';

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

export interface FilterPreset {
  key: string;
  label: string;
  group: 'basic' | 'natural' | 'warm' | 'cool' | 'vintage';
  adjust: Partial<ImageAdjust>;
  /// แปลงเป็นขาวดำก่อนปรับ
  mono?: boolean;
  /// ลดจำนวนระดับสี (โปสเตอร์)
  posterize?: number;
  /// ทับสีโทนเดียว (duotone) — [เงา, แสง]
  duotone?: [[number, number, number], [number, number, number]];
}

export const FILTER_GROUPS: { key: FilterPreset['group']; label: string }[] = [
  { key: 'basic', label: 'พื้นฐาน' },
  { key: 'natural', label: 'ธรรมชาติ' },
  { key: 'warm', label: 'โทนร้อน' },
  { key: 'cool', label: 'โทนเย็น' },
  { key: 'vintage', label: 'ย้อนยุค' },
];

export const FILTER_PRESETS: FilterPreset[] = [
  { key: 'mono', label: 'ขาวดำ', group: 'basic', adjust: { contrast: 10 }, mono: true },
  { key: 'pop', label: 'สีโดด', group: 'basic', adjust: { saturation: 45, contrast: 20, vibrance: 30 } },
  { key: 'duo-violet', label: 'ม่วงทูโทน', group: 'basic', adjust: {}, duotone: [[40, 10, 90], [255, 170, 120]] },
  { key: 'poster', label: 'โปสเตอร์', group: 'basic', adjust: { saturation: 20 }, posterize: 5 },
  { key: 'fresh', label: 'สดใส', group: 'natural', adjust: { brightness: 8, vibrance: 25, clarity: 15 } },
  { key: 'meadow', label: 'ทุ่งหญ้า', group: 'natural', adjust: { tint: -12, saturation: 12, shadows: 15 } },
  { key: 'mist', label: 'หมอก', group: 'natural', adjust: { contrast: -25, brightness: 10, saturation: -20, blacks: 25 } },
  { key: 'stone', label: 'หินผา', group: 'natural', adjust: { saturation: -35, contrast: 15, clarity: 20 } },
  { key: 'sunset', label: 'ยามเย็น', group: 'warm', adjust: { temperature: 35, saturation: 15, highlights: -10 } },
  { key: 'latte', label: 'ลาเต้', group: 'warm', adjust: { temperature: 20, saturation: -20, contrast: -10, blacks: 15 } },
  { key: 'peach', label: 'พีช', group: 'warm', adjust: { temperature: 15, tint: 15, brightness: 8 } },
  { key: 'ocean', label: 'มหาสมุทร', group: 'cool', adjust: { temperature: -35, saturation: 10, contrast: 10 } },
  { key: 'frost', label: 'น้ำแข็ง', group: 'cool', adjust: { temperature: -25, brightness: 12, saturation: -15 } },
  { key: 'night', label: 'ราตรี', group: 'cool', adjust: { temperature: -20, brightness: -15, contrast: 20, vignette: 40 } },
  { key: 'film', label: 'ฟิล์ม', group: 'vintage', adjust: { temperature: 15, contrast: -15, blacks: 30, saturation: -15, vignette: 30 } },
  { key: 'sepia', label: 'ซีเปีย', group: 'vintage', adjust: {}, duotone: [[50, 30, 15], [245, 225, 190]] },
  { key: 'fade', label: 'ซีดจาง', group: 'vintage', adjust: { contrast: -30, blacks: 40, saturation: -30 } },
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

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/// ประมวลผลพิกเซลในที่ (ImageData ขนาดใดก็ได้)
export function applyAdjust(data: ImageData, a: ImageAdjust, filter: FilterPreset | null, intensity: number) {
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
        const l = 0.299 * r + 0.587 * g + 0.114 * b;

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
function convolveSharpen(data: ImageData, amount: number) {
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
