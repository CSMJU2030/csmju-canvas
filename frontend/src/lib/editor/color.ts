import type { DesignDocument } from './types';

/// แปลงสี CSS ใด ๆ เป็นรูปที่ <input type="color"> รับได้ (#rrggbb)
///
/// ใช้ canvas ให้เบราว์เซอร์แปลงให้ — รองรับ rgb() hsl() ชื่อสี ฯลฯ โดยไม่ต้องเขียน parser เอง
let ctx: CanvasRenderingContext2D | null = null;

export function toInputColor(color: string | null | undefined, fallback = 'rgb(0 0 0)'): string {
  if (typeof document === 'undefined') return '';

  ctx ??= document.createElement('canvas').getContext('2d');

  if (!ctx) return '';

  ctx.fillStyle = fallback;
  ctx.fillStyle = color ?? fallback;

  const value = String(ctx.fillStyle);

  if (value.startsWith('#')) return value;

  // rgba(r, g, b, a) → #rrggbb (ช่องโปร่งใสตัดทิ้ง input type=color ไม่รองรับ)
  const match = value.match(/\d+(\.\d+)?/g);

  if (!match) return '';

  const hex = match
    .slice(0, 3)
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0'))
    .join('');

  return `#${hex}`;
}

/// สีจาก <input type="color"> เก็บเป็น rgb() ให้รูปแบบเดียวกันทั้งเอกสาร
export function fromInputColor(value: string): string {
  const raw = value.replace(/^#/, '');

  if (raw.length !== 6) return value;

  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);

  return `rgb(${r} ${g} ${b})`;
}

/// ชุดสีเริ่มต้นในตัวเลือกสี (สีขององค์กรนำ แล้วตามด้วยสีพื้นฐาน)
export const SWATCHES = [
  'rgb(0 76 153)',
  'rgb(14 165 233)',
  'rgb(20 184 166)',
  'rgb(139 92 246)',
  'rgb(245 158 11)',
  'rgb(220 38 38)',
  'rgb(22 163 74)',
  'rgb(236 72 153)',
  'rgb(15 23 42)',
  'rgb(100 116 139)',
  'rgb(226 232 240)',
  'rgb(255 255 255)',
];

/// กลุ่มสีของตัวกรองเทมเพลต (ภาพบรีฟ "พรีเซนเทชั่น 1.1") — key ตรงกับ colorTags ของหลังบ้าน
export const COLOR_FILTERS: { key: string; label: string; swatch: string }[] = [
  { key: 'gray', label: 'เทา', swatch: 'rgb(115 115 115)' },
  { key: 'blue', label: 'น้ำเงิน', swatch: 'rgb(79 110 247)' },
  { key: 'sky', label: 'ฟ้า', swatch: 'rgb(56 182 255)' },
  { key: 'teal', label: 'เขียวอมฟ้า', swatch: 'rgb(92 225 230)' },
  { key: 'green', label: 'เขียว', swatch: 'rgb(126 217 87)' },
  { key: 'lime', label: 'เขียวมะนาว', swatch: 'rgb(201 226 101)' },
  { key: 'yellow', label: 'เหลือง', swatch: 'rgb(255 222 89)' },
  { key: 'orange', label: 'ส้ม', swatch: 'rgb(255 145 77)' },
  { key: 'red', label: 'แดง', swatch: 'rgb(255 87 87)' },
  { key: 'pink', label: 'ชมพู', swatch: 'rgb(255 102 196)' },
  { key: 'purple', label: 'ม่วง', swatch: 'rgb(140 82 255)' },
  { key: 'white', label: 'ขาว', swatch: 'rgb(255 255 255)' },
  { key: 'black', label: 'ดำ', swatch: 'rgb(0 0 0)' },
];

/// สีใด ๆ → กลุ่มสีของตัวกรอง (เกณฑ์เดียวกับ backend/src/modules/templates/template-tags.ts)
export function colorFilterOf(color: string): string {
  const hex = toInputColor(color).replace(/^#/, '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (l >= 0.93) return 'white';
  if (l <= 0.12) return 'black';
  if (s < 0.15) return l > 0.85 ? 'white' : 'gray';

  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;

  h = (h * 60 + 360) % 360;

  const bands: [number, string][] = [[15, 'red'], [40, 'orange'], [62, 'yellow'], [85, 'lime'], [160, 'green'], [185, 'teal'], [215, 'sky'], [255, 'blue'], [290, 'purple'], [345, 'pink']];

  return bands.find(([edge]) => h < edge)?.[1] ?? 'red';
}

/// สีที่ใช้อยู่ในงานนี้ ("สีในดีไซน์นี้" ของตัวเลือกสี) — เรียงตามที่พบ ไม่ซ้ำ
export function documentColors(doc: DesignDocument, limit = 10): string[] {
  const seen = new Map<string, string>();
  const add = (color: string | null | undefined) => {
    if (!color) return;

    const key = toInputColor(color);

    if (key && !seen.has(key)) seen.set(key, color);
  };

  for (const page of doc.pages) {
    add(page.background);

    for (const el of page.elements) {
      if (el.type === 'text' || el.type === 'svg' || el.type === 'path') add(el.color);
      if (el.type === 'shape') {
        add(el.fill);
        add(el.stroke);
      }
    }
  }

  return [...seen.values()].slice(0, limit);
}
