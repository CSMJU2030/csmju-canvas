/// ตัวสร้างของในงาน (แผง "ตัวสร้าง"): ลวดลายซ้ำ · ปฏิทินเดือน · ชุดสีตามทฤษฎีสี · กราเดียนต์ — คำนวณในเครื่องทั้งหมด

import { gradientCss } from './paint';

// ── สี ─────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

/// อ่าน rgb()/rgba() และรหัสสีแบบ # (3/6 หลัก) · อ่านไม่ได้ = null
export function parseRgb(color: string): Rgb | null {
  const fn = color.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);

  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as Rgb;

  const hex = color.trim().replace(/^#/, '');

  if (/^[\da-f]{3}$/i.test(hex)) return [...hex].map((c) => parseInt(c + c, 16)) as Rgb;
  if (/^[\da-f]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

  return null;
}

export const rgbCss = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;

  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];

  return [r, g, b].map((v) => Math.round((v + m) * 255)) as Rgb;
}

export type Harmony = 'analogous' | 'complementary' | 'triadic' | 'split' | 'tetradic' | 'monochrome';

export const HARMONIES: { key: Harmony; label: string }[] = [
  { key: 'analogous', label: 'สีใกล้เคียง' },
  { key: 'complementary', label: 'สีตรงข้าม' },
  { key: 'triadic', label: 'สามเหลี่ยมสี' },
  { key: 'split', label: 'ตรงข้ามแยก' },
  { key: 'tetradic', label: 'สี่เหลี่ยมสี' },
  { key: 'monochrome', label: 'โทนเดียว' },
];

/// ชุดสี 5 สีจากสีหลักตามทฤษฎีสี (สีแรกคือสีหลักเสมอ)
export function harmonyPalette(base: string, kind: Harmony): string[] {
  const rgb = parseRgb(base) ?? [0, 76, 153];
  const [h, s0, l0] = rgbToHsl(rgb);
  const s = Math.max(0.35, s0);
  const l = Math.min(0.62, Math.max(0.38, l0));
  const at = (dh: number, ds = 0, dl = 0) => rgbCss(hslToRgb(h + dh, Math.min(1, Math.max(0, s + ds)), Math.min(0.95, Math.max(0.05, l + dl))));
  const offsets: Record<Harmony, [number, number, number][]> = {
    analogous: [[-30, 0, 0.08], [30, 0, -0.06], [-60, -0.1, 0.18], [60, -0.1, -0.15]],
    complementary: [[180, 0, 0], [0, -0.15, 0.3], [180, -0.15, 0.3], [0, 0, -0.25]],
    triadic: [[120, 0, 0], [240, 0, 0], [0, -0.2, 0.3], [120, -0.2, -0.2]],
    split: [[150, 0, 0], [210, 0, 0], [0, -0.2, 0.3], [180, -0.3, -0.25]],
    tetradic: [[90, 0, 0], [180, 0, 0], [270, 0, 0], [0, -0.25, 0.32]],
    monochrome: [[0, 0, 0.18], [0, 0, 0.32], [0, 0, -0.16], [0, -0.2, -0.3]],
  };

  return [rgbCss(rgb), ...offsets[kind].map(([dh, ds, dl]) => at(dh, ds, dl))];
}

/// กราเดียนต์สองถึงสามสีที่ไล่เฉดกลมกลืนจากสีหลัก
export function harmonyGradient(base: string, spread: number, angle: number, three = false): string {
  const rgb = parseRgb(base) ?? [0, 76, 153];
  const [h, s, l] = rgbToHsl(rgb);
  const sat = Math.max(0.45, s);
  const light = Math.min(0.6, Math.max(0.4, l));
  const stops = three
    ? [
        { color: rgbCss(hslToRgb(h - spread, sat, light + 0.08)), at: 0 },
        { color: rgbCss(hslToRgb(h, sat, light)), at: 0.5 },
        { color: rgbCss(hslToRgb(h + spread, sat, light - 0.06)), at: 1 },
      ]
    : [
        { color: rgbCss(hslToRgb(h, sat, light)), at: 0 },
        { color: rgbCss(hslToRgb(h + spread, sat, light + 0.06)), at: 1 },
      ];

  return gradientCss({ type: 'linear', angle, stops });
}

// ── ลวดลาย ─────────────────────────────────────────────────────────

export type PatternKind = 'dots' | 'stripes' | 'grid' | 'checker' | 'waves' | 'zigzag' | 'triangles' | 'crosses' | 'rings' | 'diagonal';

export const PATTERNS: { key: PatternKind; label: string }[] = [
  { key: 'dots', label: 'จุด' },
  { key: 'stripes', label: 'ลายทาง' },
  { key: 'grid', label: 'ตาราง' },
  { key: 'checker', label: 'หมากรุก' },
  { key: 'waves', label: 'คลื่น' },
  { key: 'zigzag', label: 'ซิกแซก' },
  { key: 'triangles', label: 'สามเหลี่ยม' },
  { key: 'crosses', label: 'กากบาท' },
  { key: 'rings', label: 'วงแหวน' },
  { key: 'diagonal', label: 'เส้นทแยง' },
];

/// รูปในช่องลายหนึ่งช่อง (ขนาด s×s) ใช้ currentColor
function tile(kind: PatternKind, s: number): string {
  const h = s / 2;
  const w = Math.max(1, s / 14);

  switch (kind) {
    case 'dots':
      return `<circle cx="${h}" cy="${h}" r="${s / 7}" fill="currentColor"/>`;
    case 'stripes':
      return `<rect width="${s}" height="${h / 2}" fill="currentColor"/>`;
    case 'grid':
      return `<path d="M${s} 0H0V${s}" fill="none" stroke="currentColor" stroke-width="${w}"/>`;
    case 'checker':
      return `<rect width="${h}" height="${h}" fill="currentColor"/><rect x="${h}" y="${h}" width="${h}" height="${h}" fill="currentColor"/>`;
    case 'waves':
      return `<path d="M0 ${h} Q ${s / 4} ${h - s / 4} ${h} ${h} T ${s} ${h}" fill="none" stroke="currentColor" stroke-width="${w * 1.5}"/>`;
    case 'zigzag':
      return `<path d="M0 ${s * 0.65} L ${h} ${s * 0.35} L ${s} ${s * 0.65}" fill="none" stroke="currentColor" stroke-width="${w * 1.5}"/>`;
    case 'triangles':
      return `<path d="M${h} ${s * 0.2} L ${s * 0.8} ${s * 0.75} H ${s * 0.2} Z" fill="currentColor"/>`;
    case 'crosses':
      return `<path d="M${h} ${s * 0.3} V ${s * 0.7} M ${s * 0.3} ${h} H ${s * 0.7}" stroke="currentColor" stroke-width="${w * 1.5}" stroke-linecap="round"/>`;
    case 'rings':
      return `<circle cx="${h}" cy="${h}" r="${s / 4}" fill="none" stroke="currentColor" stroke-width="${w}"/>`;
    case 'diagonal':
      return `<path d="M0 ${s} L ${s} 0 M ${-h} ${h} L ${h} ${-h} M ${h} ${s + h} L ${s + h} ${h}" stroke="currentColor" stroke-width="${w}"/>`;
  }
}

/// SVG ลายซ้ำเต็มกรอบ `width`×`height` · `density` = จำนวนช่องตามด้านกว้าง · โปร่งใสส่วนที่ไม่มีลาย
export function patternSvg(kind: PatternKind, width: number, height: number, density: number): string {
  const s = Math.max(4, Math.round(width / Math.max(2, density)));
  const id = `p-${kind}-${s}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" width="${Math.round(width)}" height="${Math.round(height)}">` +
    `<defs><pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${tile(kind, s)}</pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#${id})"/></svg>`
  );
}

// ── ปฏิทิน ─────────────────────────────────────────────────────────

export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/// ช่องของปฏิทินเดือน (แถวแรกเป็นชื่อวัน) · `month` 0–11 · ปีเป็น ค.ศ.
export function calendarGrid(year: number, month: number, mondayFirst: boolean): string[][] {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const shift = mondayFirst ? (first + 6) % 7 : first;
  const header = mondayFirst ? [...THAI_DAYS.slice(1), THAI_DAYS[0]] : THAI_DAYS;
  const cells: string[] = [...Array(shift).fill(''), ...Array.from({ length: days }, (_, i) => String(i + 1))];

  while (cells.length % 7 !== 0) cells.push('');

  const rows = [header];

  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return rows;
}

/// ชื่อเดือนแบบไทย (พ.ศ.)
export function thaiMonthTitle(year: number, month: number): string {
  return `${THAI_MONTHS[month]} ${year + 543}`;
}
