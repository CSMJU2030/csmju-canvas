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
