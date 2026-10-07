/// หน้า "กราฟิก" ของแผงองค์ประกอบ (ภาพบรีฟ 247): น่าจะเข้ากับดีไซน์ของคุณ · แนะนำ · การไล่เฉดสี
///
/// คำนวณในเครื่องทั้งหมดจากคลังกราฟิกในระบบ (Tabler Icons) กับเนื้อหาของงานที่เปิดอยู่ — ไม่มีการส่งอะไรออกนอกระบบ
/// และไม่ใช้ AI: "เข้ากับดีไซน์" = แท็กของกราฟิกตรงกับคำในข้อความ ชื่องาน หรือประเภทงาน

import { searchTerms, type LibraryIcon } from './library';
import { DEFAULT_GRADIENTS } from './paint';
import type { DesignDocument, ShapeKind } from './types';

/// คำที่ไม่ช่วยบอกเรื่องของงาน (ข้อความตั้งต้นของกล่องข้อความ ฯลฯ)
const STOPWORDS = new Set([
  'เพิ่ม', 'หัวเรื่อง', 'หัวข้อ', 'หัวข้อย่อย', 'หัวเรื่องย่อย', 'ข้อความ', 'ใน', 'ส่วน', 'เนื้อหา', 'เล็กน้อย', 'และ', 'หรือ', 'ของ', 'ที่', 'การ', 'ความ',
  'ให้', 'ได้', 'มี', 'เป็น', 'กับ', 'จาก', 'นี้', 'นั้น', 'จะ', 'ไป', 'มา', 'แล้ว', 'ไม่', 'คุณ', 'เรา', 'the', 'and', 'for', 'with', 'your', 'you', 'our',
  'of', 'to', 'in', 'on', 'at', 'a', 'an', 'is', 'are', 'ไม่มีชื่อ', 'ดีไซน์', 'งาน',
]);

/// หัวข้อที่เข้ากับประเภทงานแต่ละแบบ (คำอังกฤษที่อยู่ในแท็กของ Tabler)
const DESIGN_TYPE_TERMS: Record<string, string[]> = {
  presentation: ['presentation', 'chart', 'bulb'],
  'presentation-4x3': ['presentation', 'chart', 'bulb'],
  'instagram-post': ['heart', 'camera', 'message'],
  'social-square': ['heart', 'share', 'message'],
  'facebook-post': ['thumb-up', 'share', 'message'],
  story: ['camera', 'heart', 'sparkles'],
  'youtube-thumbnail': ['player-play', 'video', 'camera'],
  'photo-edit': ['camera', 'photo', 'sparkles'],
  poster: ['speakerphone', 'calendar', 'map-pin'],
  flyer: ['speakerphone', 'calendar', 'phone'],
  certificate: ['award', 'certificate', 'trophy', 'medal'],
  'business-card': ['phone', 'mail', 'map-pin', 'world'],
  invitation: ['calendar', 'confetti', 'gift', 'balloon'],
  sticker: ['mood-smile', 'heart', 'star'],
  'document-a4': ['file', 'notes', 'clipboard'],
  'report-cover': ['file', 'report', 'book', 'school'],
  resume: ['user', 'briefcase', 'school', 'phone', 'mail'],
  infographic: ['chart', 'graph', 'number', 'arrow'],
  whiteboard: ['bulb', 'arrow', 'note', 'pencil'],
};

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

/// แยกคำ (ภาษาไทยไม่มีช่องว่าง จึงใช้ตัวตัดคำของเบราว์เซอร์ ถ้าไม่มีก็แยกตามช่องว่าง)
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const raw = segmenter
    ? [...segmenter.segment(lower)].filter((s) => s.isWordLike !== false).map((s) => s.segment)
    : lower.split(/[\s.,;:!?()[\]{}"'“”‘’/\\|<>+=*&^%$#@~`-]+/);

  return raw.map((w) => w.trim()).filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/// ข้อความทุกกล่องในงาน ต่อกันเป็นก้อนเดียว (ใช้เป็นค่าที่เทียบได้ใน selector — เปลี่ยนเฉพาะเมื่อข้อความเปลี่ยน)
export function documentText(doc: Pick<DesignDocument, 'pages'>): string {
  return doc.pages.flatMap((page) => page.elements.map((el) => (el.type === 'text' ? el.text : ''))).filter(Boolean).join('\n');
}

/// คำที่บอกเรื่องของงาน เรียงจากที่พบบ่อยสุด · ชื่องานมีน้ำหนักสองเท่า
export function rankWords(text: string, title = ''): string[] {
  const counts = new Map<string, number>();
  const add = (value: string, weight: number) => {
    for (const word of tokenize(value)) counts.set(word, (counts.get(word) ?? 0) + weight);
  };

  add(title, 2);
  add(text, 1);

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40).map(([w]) => w);
}

/// คำที่บอกเรื่องของงาน: ข้อความทุกหน้า + ชื่องาน
export function designWords(doc: Pick<DesignDocument, 'pages'>, title = ''): string[] {
  return rankWords(documentText(doc), title);
}

/// คำอังกฤษที่ใช้เทียบกับแท็กของกราฟิก (แปลคำไทยที่รู้จัก + หัวข้อของประเภทงาน) — ไม่ซ้ำ เรียงตามความสำคัญ
export function designTerms(words: string[], designType: string): string[] {
  const out: string[] = [];
  const push = (term: string) => {
    if (term.length >= 2 && !out.includes(term)) out.push(term);
  };

  for (const word of words) {
    // คำอังกฤษใช้ตรง ๆ · คำไทยใช้เฉพาะที่แปลได้ (คำไทยเองไม่อยู่ในแท็ก)
    if (/^[a-z][a-z-]*$/.test(word)) push(word);

    for (const term of searchTerms(word)) if (term !== word && /^[a-z]/.test(term)) push(term);
  }

  for (const term of DESIGN_TYPE_TERMS[designType] ?? []) push(term);

  return out;
}

/// คะแนนความเข้ากัน: ชื่อตรงคำ > ชื่อขึ้นต้นด้วยคำ > แท็กมีคำนั้นเป็นคำ · คำที่มาก่อนมีน้ำหนักมากกว่า
export function scoreIcon(icon: Pick<LibraryIcon, 'n' | 't'>, terms: string[]): number {
  const tags = new Set(icon.t.toLowerCase().split(/\s+/));
  let score = 0;

  terms.forEach((term, index) => {
    const weight = 1 + (terms.length - index) / terms.length;

    if (icon.n === term) score += 6 * weight;
    else if (icon.n.startsWith(`${term}-`)) score += 3 * weight;
    else if (tags.has(term)) score += 2 * weight;
  });

  // กราฟิกแบบ off/ตัดขีดไม่ค่อยเหมาะกับงานตกแต่ง
  if (/-off$/.test(icon.n)) score *= 0.3;

  return score;
}

/// กราฟิกที่น่าจะเข้ากับดีไซน์ (ว่าง = งานยังไม่มีคำที่ใช้เดาได้ → ไม่แสดงหัวข้อนี้)
export function suggestGraphics<T extends Pick<LibraryIcon, 'n' | 't'>>(icons: T[], terms: string[], limit = 60): T[] {
  if (terms.length === 0) return [];

  return icons
    .map((icon) => ({ icon, score: scoreIcon(icon, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.icon.n.localeCompare(b.icon.n))
    .slice(0, limit)
    .map((x) => x.icon);
}

/// ชุด "แนะนำ" ที่ทีมคัดไว้ (คงที่ ไม่สุ่ม) — กราฟิกที่ใช้ตกแต่งงานนักศึกษา/บุคลากรได้บ่อย
export const RECOMMENDED_GRAPHICS = [
  'heart', 'star', 'sparkles', 'confetti', 'balloon', 'bulb', 'rocket', 'trophy', 'award', 'school', 'book', 'music',
  'camera', 'plant', 'leaf', 'sun', 'cloud', 'moon', 'flower', 'coffee', 'gift', 'map-pin', 'message-circle', 'speakerphone',
  'calendar', 'clock', 'device-laptop', 'brush', 'palette', 'certificate', 'crown', 'diamond', 'flame', 'mood-smile', 'planet',
  'pencil', 'puzzle', 'target', 'thumb-up', 'world', 'butterfly', 'cat', 'dog', 'fish', 'tree', 'cake', 'pizza', 'ice-cream-2',
  'bike', 'car', 'plane',
];

export function recommendedGraphics<T extends Pick<LibraryIcon, 'n'>>(icons: T[]): T[] {
  const byName = new Map(icons.map((icon) => [icon.n, icon]));

  return RECOMMENDED_GRAPHICS.map((name) => byName.get(name)).filter((icon): icon is T => Boolean(icon));
}

/// สีของกราฟิกในหน้า "กราฟิก" (แบบ Canva ที่กราฟิกมีสีสัน) — ได้สีเดิมทุกครั้งตามชื่อ · เปลี่ยนสีได้หลังใส่ลงงาน
export const GRAPHIC_COLORS = [
  'rgb(255 87 87)',
  'rgb(255 145 77)',
  'rgb(230 170 30)',
  'rgb(0 191 99)',
  'rgb(0 151 178)',
  'rgb(56 132 255)',
  'rgb(140 82 255)',
  'rgb(255 102 196)',
];

export function graphicColor(name: string): string {
  let hash = 0;

  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

  return GRAPHIC_COLORS[hash % GRAPHIC_COLORS.length];
}

/// รูปทรงที่ใช้กับกราฟิกไล่เฉดสี · "rect-rounded" = สี่เหลี่ยมมุมโค้ง
export type GradientShape = Extract<ShapeKind, 'ellipse' | 'star' | 'hexagon' | 'diamond' | 'triangle'> | 'rect-rounded';

export const GRADIENT_SHAPES: GradientShape[] = ['ellipse', 'rect-rounded', 'star', 'hexagon', 'diamond', 'triangle'];

export interface GradientItem {
  /// "gradient:<ลำดับกราเดียนต์>:<รูปทรง>" — ใช้เป็น id ของ "ใช้งานล่าสุด" ได้ด้วย
  id: string;
  paint: string;
  shape: GradientShape;
}

/// กราฟิกไล่เฉดสี: กราเดียนต์ตั้งต้นของตัวเลือกสี (ข้ามสองชุดแรกที่เป็นขาวดำ) × รูปทรง
/// `featured` = ชุดสั้นสำหรับแถวแรก (กราเดียนต์ละหนึ่งรูปทรง หมุนรูปทรงไปเรื่อย ๆ)
export function gradientItems(featured = false): GradientItem[] {
  const paints = DEFAULT_GRADIENTS.map((paint, index) => ({ paint, index })).slice(2);

  if (featured) {
    return paints.map(({ paint, index }, i) => {
      const shape = GRADIENT_SHAPES[i % GRADIENT_SHAPES.length];

      return { id: `gradient:${index}:${shape}`, paint, shape };
    });
  }

  return GRADIENT_SHAPES.flatMap((shape) => paints.map(({ paint, index }) => ({ id: `gradient:${index}:${shape}`, paint, shape })));
}

/// อ่าน id ของกราฟิกไล่เฉดสีกลับเป็นสีและรูปทรง (null = id ไม่ถูกต้อง เช่นรายการเก่า)
export function parseGradientId(id: string): { paint: string; shape: GradientShape } | null {
  const [kind, index, shape] = id.split(':');
  const paint = DEFAULT_GRADIENTS[Number(index)];

  if (kind !== 'gradient' || !paint || !GRADIENT_SHAPES.includes(shape as GradientShape)) return null;

  return { paint, shape: shape as GradientShape };
}
