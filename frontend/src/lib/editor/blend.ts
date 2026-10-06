import type { BlendMode } from './types';

/// โหมดผสมสีของชิ้นงาน (แบบ Photoshop) — ทุกชนิดใช้ได้
///
/// ชื่อโหมดตรงกับ CSS `mix-blend-mode` และเกือบตรงกับ canvas `globalCompositeOperation`
/// (ต่างกันแค่ `normal` ซึ่ง canvas เรียกว่า `source-over`) · CMS ใช้ค่าใน JSON ตรง ๆ กับ CSS ได้เลย

export const BLEND_MODES: { key: BlendMode; label: string }[] = [
  { key: 'normal', label: 'ปกติ' },
  { key: 'multiply', label: 'คูณ (Multiply)' },
  { key: 'screen', label: 'สกรีน (Screen)' },
  { key: 'overlay', label: 'ซ้อนทับ (Overlay)' },
  { key: 'darken', label: 'เลือกส่วนมืด (Darken)' },
  { key: 'lighten', label: 'เลือกส่วนสว่าง (Lighten)' },
  { key: 'color-dodge', label: 'เร่งแสง (Color Dodge)' },
  { key: 'color-burn', label: 'เผาสี (Color Burn)' },
  { key: 'hard-light', label: 'แสงแข็ง (Hard Light)' },
  { key: 'soft-light', label: 'แสงนุ่ม (Soft Light)' },
  { key: 'difference', label: 'ผลต่าง (Difference)' },
  { key: 'exclusion', label: 'ยกเว้น (Exclusion)' },
  { key: 'hue', label: 'เฉดสี (Hue)' },
  { key: 'saturation', label: 'ความอิ่มตัว (Saturation)' },
  { key: 'color', label: 'สี (Color)' },
  { key: 'luminosity', label: 'ความสว่าง (Luminosity)' },
];

const KNOWN = new Set<string>(BLEND_MODES.map((m) => m.key));

export function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && KNOWN.has(value);
}

/// ค่า `globalCompositeOperation` ของ canvas · ค่าที่ไม่รู้จัก/ไม่มี = วาดทับปกติ
export function compositeOperation(mode: BlendMode | string | null | undefined): GlobalCompositeOperation {
  if (!mode || mode === 'normal' || !KNOWN.has(mode)) return 'source-over';

  return mode as GlobalCompositeOperation;
}

/// ค่า CSS `mix-blend-mode` (ส่งออก SVG) · null = ไม่ต้องใส่
export function cssBlendMode(mode: BlendMode | string | null | undefined): string | null {
  return mode && mode !== 'normal' && KNOWN.has(mode) ? mode : null;
}

/// สูตรผสมสีแบบแยกช่อง (W3C Compositing Level 1) · `b` = พื้นล่าง, `s` = สีที่ทับ · ค่า 0–1
///
/// ใช้ในตัวประมวลผลพิกเซล (เอฟเฟกต์ "ทับสี") ให้ผลตรงกับโหมดผสมของ canvas
export type SeparableBlend = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';

export function blendChannel(mode: SeparableBlend, b: number, s: number): number {
  switch (mode) {
    case 'multiply':
      return b * s;
    case 'screen':
      return b + s - b * s;
    case 'overlay':
      return blendChannel('hard-light', s, b);
    case 'darken':
      return Math.min(b, s);
    case 'lighten':
      return Math.max(b, s);
    case 'color-dodge':
      if (b === 0) return 0;
      if (s >= 1) return 1;
      return Math.min(1, b / (1 - s));
    case 'color-burn':
      if (b >= 1) return 1;
      if (s <= 0) return 0;
      return 1 - Math.min(1, (1 - b) / s);
    case 'hard-light':
      return s <= 0.5 ? b * 2 * s : blendChannel('screen', b, 2 * s - 1);
    case 'soft-light': {
      if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);

      const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);

      return b + (2 * s - 1) * (d - b);
    }
    case 'difference':
      return Math.abs(b - s);
    case 'exclusion':
      return b + s - 2 * b * s;
    default:
      return s;
  }
}
