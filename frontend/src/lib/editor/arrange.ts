/// จัดวางอัตโนมัติ: จัดให้เป็นระเบียบ (tidy up) · จัดกึ่งกลางหน้า · นับคำ — ใช้กับเครื่องมือในศูนย์รวมเครื่องมือ

import type { CanvasElement } from './types';

type Box = Pick<CanvasElement, 'id' | 'x' | 'y' | 'width' | 'height'>;

/// เรียงชิ้นที่เลือกเป็นตาราง (ตามลำดับบน→ล่าง ซ้าย→ขวา) เริ่มที่มุมซ้ายบนของกลุ่มเดิม · ช่องห่างเท่ากัน
export function tidyUp(items: Box[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();

  if (items.length < 2) return out;

  const rowTolerance = Math.min(...items.map((b) => b.height)) / 2;
  const sorted = [...items].sort((a, b) => (Math.abs(a.y - b.y) <= rowTolerance ? a.x - b.x : a.y - b.y));
  const cols = Math.ceil(Math.sqrt(sorted.length));
  const cellW = Math.max(...sorted.map((b) => b.width));
  const cellH = Math.max(...sorted.map((b) => b.height));
  const gap = Math.round(Math.min(cellW, cellH) * 0.1);
  const left = Math.min(...items.map((b) => b.x));
  const top = Math.min(...items.map((b) => b.y));

  sorted.forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // ชิ้นอยู่กึ่งกลางช่องของตัวเอง
    out.set(b.id, {
      x: Math.round(left + col * (cellW + gap) + (cellW - b.width) / 2),
      y: Math.round(top + row * (cellH + gap) + (cellH - b.height) / 2),
    });
  });

  return out;
}

/// ระยะเลื่อนที่ทำให้กรอบรวมของชิ้นที่เลือกอยู่กึ่งกลางหน้า
export function centerOffset(items: Box[], page: { width: number; height: number }): { dx: number; dy: number } {
  if (items.length === 0) return { dx: 0, dy: 0 };

  const left = Math.min(...items.map((b) => b.x));
  const top = Math.min(...items.map((b) => b.y));
  const right = Math.max(...items.map((b) => b.x + b.width));
  const bottom = Math.max(...items.map((b) => b.y + b.height));

  return { dx: Math.round((page.width - (right - left)) / 2 - left), dy: Math.round((page.height - (bottom - top)) / 2 - top) };
}

/// นับคำ (ตัดคำภาษาไทยด้วย Intl.Segmenter ของเบราว์เซอร์) และตัวอักษร
export function textStats(texts: string[]): { words: number; chars: number; charsNoSpace: number } {
  const all = texts.join('\n');
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'word' | 'grapheme' }) => { segment(s: string): Iterable<{ segment: string; isWordLike?: boolean }> } }).Segmenter;
  let words = 0;
  let chars = 0;

  if (Seg) {
    for (const s of new Seg('th', { granularity: 'word' }).segment(all)) if (s.isWordLike) words++;
    for (const s of new Seg('th', { granularity: 'grapheme' }).segment(all)) if (s.segment !== '\n') chars++;
  } else {
    words = all.split(/\s+/).filter(Boolean).length;
    chars = all.replace(/\n/g, '').length;
  }

  const spaces = (all.match(/[ \t\u00a0]/g) ?? []).length;

  return { words, chars, charsNoSpace: chars - spaces };
}

/// ลบช่องว่างซ้ำ ช่องว่างต้น/ท้ายบรรทัด และบรรทัดว่างเกินสองบรรทัด
export function cleanSpaces(text: string): string {
  return text
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
