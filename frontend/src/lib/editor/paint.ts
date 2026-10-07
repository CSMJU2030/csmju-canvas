/// สีพื้นแบบสีเดียวหรือกราเดียนต์ — เก็บเป็นข้อความ CSS เพื่อให้ CMS เอาไปใช้ใน CSS ได้ตรง ๆ
///
///   rgb(0 76 153)
///   linear-gradient(90deg, rgb(255 0 0) 0%, rgb(0 0 255) 100%)
///   radial-gradient(circle, rgb(255 255 255) 0%, rgb(0 0 0) 100%)
///
/// editor เขียนแค่รูปแบบข้างบน (มุมเป็น deg · ตำแหน่งเป็น %) ตัวอ่านจึงไม่ต้องรองรับ CSS ทั้งหมด

export interface GradientStop {
  color: string;
  /// 0–1
  at: number;
}

export interface Gradient {
  type: 'linear' | 'radial';
  /// องศาแบบ CSS (0 = ล่างขึ้นบน · 90 = ซ้ายไปขวา)
  angle: number;
  stops: GradientStop[];
}

export function isGradient(paint: string | null | undefined): boolean {
  return Boolean(paint && /^(linear|radial)-gradient\(/.test(paint));
}

/// แยกอาร์กิวเมนต์ระดับบนสุด (ไม่ตัดจุลภาคที่อยู่ใน rgb(…))
function splitTop(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());

  return parts;
}

export function parseGradient(paint: string): Gradient | null {
  const match = paint.trim().match(/^(linear|radial)-gradient\(([\s\S]*)\)$/);

  if (!match) return null;

  const parts = splitTop(match[2]);
  let angle = 180;

  if (match[1] === 'linear' && /deg$/.test(parts[0] ?? '')) angle = Number.parseFloat(parts.shift()!);
  if (match[1] === 'radial' && !/^(rgb|#|hsl)/.test(parts[0] ?? '')) parts.shift();

  const stops = parts.map((part, index) => {
    const pct = part.match(/\s([\d.]+)%$/);
    const color = pct ? part.slice(0, pct.index).trim() : part;

    return { color, at: pct ? Number(pct[1]) / 100 : index / Math.max(1, parts.length - 1) };
  });

  if (stops.length < 2) return null;

  return { type: match[1] as Gradient['type'], angle: Number.isFinite(angle) ? angle : 180, stops };
}

export function gradientCss(g: Gradient): string {
  const stops = g.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(', ');

  return g.type === 'linear' ? `linear-gradient(${Math.round(g.angle)}deg, ${stops})` : `radial-gradient(circle, ${stops})`;
}

/// ค่าสำหรับ fillStyle — กราเดียนต์คำนวณตามกรอบที่ให้มา (พิกัดหน้า)
export function canvasPaint(
  ctx: CanvasRenderingContext2D,
  paint: string,
  box: { x: number; y: number; width: number; height: number },
): string | CanvasGradient {
  if (!isGradient(paint)) return paint;

  const g = parseGradient(paint);

  if (!g) return 'rgb(0 0 0)';

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let gradient: CanvasGradient;

  if (g.type === 'radial') {
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(box.width, box.height) / 2);
  } else {
    // ความยาวเส้นกราเดียนต์ตามสูตร CSS ให้สีถึงมุมกล่องพอดี
    const rad = (g.angle * Math.PI) / 180;
    const half = (Math.abs(box.width * Math.sin(rad)) + Math.abs(box.height * Math.cos(rad))) / 2;
    const dx = Math.sin(rad) * half;
    const dy = -Math.cos(rad) * half;

    gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  }

  for (const stop of g.stops) {
    try {
      gradient.addColorStop(Math.min(1, Math.max(0, stop.at)), stop.color);
    } catch {
      // สีอ่านไม่ได้ — ข้ามจุดนั้น
    }
  }

  return gradient;
}

/// สีทุกสีในค่า paint (ใช้นับ "สีในดีไซน์นี้")
export function paintColors(paint: string | null | undefined): string[] {
  if (!paint) return [];
  if (!isGradient(paint)) return [paint];

  return parseGradient(paint)?.stops.map((s) => s.color) ?? [];
}

/// กราเดียนต์เริ่มต้นของตัวเลือกสี (แบบ Canva "สีกราเดียนต์ตามค่าเริ่มต้น")
export const DEFAULT_GRADIENTS: string[] = [
  'linear-gradient(90deg, rgb(0 0 0) 0%, rgb(115 115 115) 100%)',
  'linear-gradient(90deg, rgb(166 166 166) 0%, rgb(255 255 255) 100%)',
  'linear-gradient(90deg, rgb(0 0 0) 0%, rgb(201 160 60) 100%)',
  'linear-gradient(90deg, rgb(0 0 0) 0%, rgb(56 182 255) 100%)',
  'linear-gradient(90deg, rgb(255 222 89) 0%, rgb(255 145 77) 100%)',
  'linear-gradient(90deg, rgb(140 82 255) 0%, rgb(0 191 99) 100%)',
  'linear-gradient(90deg, rgb(92 225 230) 0%, rgb(255 222 89) 100%)',
  'linear-gradient(90deg, rgb(255 102 196) 0%, rgb(255 222 89) 100%)',
  'linear-gradient(90deg, rgb(140 82 255) 0%, rgb(255 145 77) 100%)',
  'linear-gradient(90deg, rgb(0 74 173) 0%, rgb(203 108 230) 100%)',
  'linear-gradient(90deg, rgb(255 87 87) 0%, rgb(140 82 255) 100%)',
  'linear-gradient(90deg, rgb(0 151 178) 0%, rgb(126 217 87) 100%)',
  'linear-gradient(90deg, rgb(255 189 89) 0%, rgb(255 102 196) 100%)',
  'linear-gradient(90deg, rgb(56 182 255) 0%, rgb(255 255 255) 100%)',
  'radial-gradient(circle, rgb(255 255 255) 0%, rgb(140 82 255) 100%)',
  'radial-gradient(circle, rgb(255 222 89) 0%, rgb(255 87 87) 100%)',
];
