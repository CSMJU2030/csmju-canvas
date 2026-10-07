import { newEffect } from './image-effects';
import type { Border, ImageAdjust, ImageCurves, ImageEffect, ImageEffectKind, ImageElement, ImageLayerStyle, ImageLevels, Shadow } from './types';

/// สไตล์ภาพ (แผง "แก้ไขรูปภาพ" → สไตล์ภาพ): ชุดฟิลเตอร์ + เอฟเฟกต์ + การปรับ ที่กดครั้งเดียวได้ทั้งชุด
///
/// ผู้ใช้บันทึกชุดค่าปัจจุบันเป็นสไตล์ของตัวเองได้ — เก็บในเบราว์เซอร์เครื่องนั้น (localStorage) ไม่ส่งขึ้นเซิร์ฟเวอร์

export interface ImageStyleValues {
  adjust?: Partial<ImageAdjust> | null;
  filter?: string | null;
  filterIntensity?: number;
  effects?: ImageEffect[] | null;
  levels?: ImageLevels | null;
  curves?: ImageCurves | null;
  /// เฉพาะรูปเดี่ยว (รูปในกรอบ/กริดไม่มีสไตล์เลเยอร์)
  layerStyle?: ImageLayerStyle | null;
}

export interface ImageStylePreset {
  key: string;
  label: string;
  values: ImageStyleValues;
  /// ตกแต่งเพิ่มเฉพาะรูปเดี่ยว: ขอบกระดาษ (ความหนาเป็นสัดส่วนของด้านสั้น) และเงา
  decor?: { border?: { color: string; ratio: number }; shadow?: boolean };
}

function fx(kind: ImageEffectKind, params: Record<string, number> = {}, colors?: string[]): ImageEffect {
  const base = newEffect(kind);

  return { ...base, params: { ...base.params, ...params }, ...(colors ? { colors } : {}) };
}

export const IMAGE_STYLES: ImageStylePreset[] = [
  {
    key: 'polaroid-card',
    label: 'การ์ดโพลารอยด์',
    values: { filter: 'polaroid', filterIntensity: 100, effects: [fx('grain', { amount: 25 })] },
    decor: { border: { color: 'rgb(250 248 242)', ratio: 0.05 }, shadow: true },
  },
  {
    key: 'pop-art',
    label: 'ป๊อปอาร์ต',
    values: {
      adjust: { saturation: 45, contrast: 30 },
      effects: [fx('posterize', { levels: 5 }), fx('halftone', { size: 1.2, angle: 45, amount: 45 }, ['rgb(25 20 45)', 'rgb(255 255 255)'])],
    },
  },
  {
    key: 'street-film',
    label: 'สตรีทฟิล์ม',
    values: {
      filter: 'kodak',
      filterIntensity: 80,
      adjust: { clarity: 15, vignette: 30 },
      curves: { master: [[0, 12], [64, 54], [192, 206], [255, 245]] },
      effects: [fx('grain', { amount: 40 })],
    },
  },
  {
    key: 'daydream',
    label: 'ฝันกลางวัน',
    values: {
      filter: 'candy',
      filterIntensity: 60,
      adjust: { brightness: 10, contrast: -10, highlights: 10 },
      effects: [fx('light-leak', { amount: 55, angle: 45, size: 70 }, ['rgb(255 175 205)']), fx('grain', { amount: 15 })],
    },
  },
  {
    key: 'cyber',
    label: 'ไซเบอร์',
    values: {
      filter: 'cyberpunk',
      filterIntensity: 100,
      effects: [fx('chromatic', { shift: 1.5 }), fx('glitch', { offset: 1, slices: 6, seed: 11 }), fx('grain', { amount: 15 })],
    },
  },
  {
    key: 'noir-film',
    label: 'หนังนัวร์',
    values: { filter: 'noir', filterIntensity: 100, effects: [fx('grain', { amount: 35, size: 1.5 })] },
  },
  {
    key: 'sketchbook',
    label: 'สมุดสเก็ตช์',
    values: { effects: [fx('sketch', { amount: 100, detail: 6 }), fx('grain', { amount: 10 })] },
  },
  {
    key: 'cartoon',
    label: 'การ์ตูน',
    values: { adjust: { saturation: 30, contrast: 15 }, effects: [fx('oil', { radius: 2 }), fx('posterize', { levels: 6 })] },
  },
  {
    key: 'miniature',
    label: 'โลกจิ๋ว',
    values: { adjust: { saturation: 30, contrast: 15, brightness: 5 }, effects: [fx('tilt-shift', { position: 55, band: 25, blur: 2.5 })] },
  },
  {
    key: 'retro-print',
    label: 'ภาพพิมพ์ย้อนยุค',
    values: {
      effects: [
        fx('duotone', { amount: 100 }, ['rgb(30 40 95)', 'rgb(250 226 182)']),
        fx('halftone', { size: 0.8, angle: 30, amount: 30 }, ['rgb(30 40 95)', 'rgb(250 226 182)']),
        fx('grain', { amount: 20 }),
      ],
    },
  },
  {
    key: 'sticker',
    label: 'สติกเกอร์',
    values: { adjust: { vibrance: 20 }, layerStyle: { outline: { size: 3, color: 'rgb(255 255 255)' } } },
    decor: { shadow: true },
  },
  {
    key: 'neon-glow',
    label: 'นีออนเรืองแสง',
    values: { filter: 'neon', filterIntensity: 80, layerStyle: { glow: { size: 4, color: 'rgb(0 240 220)', opacity: 85 } } },
  },
];

/// ค่าที่ใส่ให้รูปเมื่อกดสไตล์ — ค่าที่สไตล์ไม่ได้กำหนดถูกล้าง เพื่อให้ได้หน้าตาตามสไตล์จริง (แก้สีเฉพาะช่วงยังอยู่)
export function styleToValues(values: ImageStyleValues, withLayerStyle: boolean): Partial<ImageElement> {
  return {
    adjust: values.adjust ?? null,
    filter: values.filter ?? null,
    filterIntensity: values.filterIntensity ?? 100,
    effects: values.effects ? values.effects.map((e) => ({ ...e, params: { ...e.params }, ...(e.colors ? { colors: [...e.colors] } : {}) })) : null,
    levels: values.levels ?? null,
    curves: values.curves ?? null,
    ...(withLayerStyle ? { layerStyle: values.layerStyle ?? null } : {}),
  };
}

/// การตกแต่งเพิ่มของสไตล์ (เฉพาะรูปเดี่ยว) ตามขนาดรูป
export function decorValues(preset: ImageStylePreset, size: { width: number; height: number }): { border?: Border | null; shadow?: Shadow | null } {
  const out: { border?: Border | null; shadow?: Shadow | null } = {};
  const short = Math.min(size.width, size.height);

  if (preset.decor?.border) out.border = { style: 'solid', width: Math.max(2, Math.round(short * preset.decor.border.ratio)), color: preset.decor.border.color };
  if (preset.decor?.shadow) out.shadow = { x: 0, y: Math.round(short * 0.02), blur: Math.round(short * 0.06), color: 'rgb(0 0 0 / 0.3)' };

  return out;
}

/// เก็บชุดค่าปัจจุบันของรูปเป็นสไตล์
export function captureStyle(image: ImageStyleValues): ImageStyleValues {
  return {
    adjust: image.adjust ?? null,
    filter: image.filter ?? null,
    filterIntensity: image.filterIntensity ?? 100,
    effects: image.effects ?? null,
    levels: image.levels ?? null,
    curves: image.curves ?? null,
    layerStyle: image.layerStyle ?? null,
  };
}

/// มีอะไรให้บันทึกหรือรีเซ็ตไหม
export function hasImageEdits(image: ImageStyleValues & { colorEdits?: unknown[] | null }): boolean {
  return Boolean(
    (image.adjust && Object.values(image.adjust).some((v) => v)) ||
      image.filter ||
      (image.effects && image.effects.length > 0) ||
      image.levels ||
      image.curves ||
      image.layerStyle ||
      (image.colorEdits && image.colorEdits.length > 0),
  );
}

// ── สไตล์ของผู้ใช้ (localStorage) ───────────────────────────────────

const STORAGE_KEY = 'csmju-canvas.image-styles.v1';
export const PERSONAL_LIMIT = 24;

export function loadPersonalStyles(): ImageStylePreset[] {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(list)) return [];

    return list
      .filter((p): p is ImageStylePreset => typeof p?.key === 'string' && typeof p?.label === 'string' && typeof p?.values === 'object' && p.values !== null)
      .slice(0, PERSONAL_LIMIT);
  } catch {
    return [];
  }
}

/// คืน false เมื่อบันทึกไม่ได้ (โหมดส่วนตัว พื้นที่เต็ม หรือเบราว์เซอร์ปิดการเก็บข้อมูล)
export function savePersonalStyles(list: ImageStylePreset[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, PERSONAL_LIMIT)));
    return true;
  } catch {
    return false;
  }
}
