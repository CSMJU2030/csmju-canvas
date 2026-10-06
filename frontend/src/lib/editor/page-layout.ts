import { pageSizeOf, type Page } from './types';

/// การจัดวางหน้าบนผืนผ้าใบของ editor
///
/// - `single` ทีละหน้า (แบบเดิม)
/// - `scroll` ทุกหน้าเรียงต่อกันในแนวตั้ง เลื่อนดูได้แบบ Canva
/// - `board` บอร์ดอิสระแบบ Figma: วางหน้าตรงไหนก็ได้ · ตำแหน่งเก็บใน `page.boardX/boardY`
///   (ค่าสำหรับจัดวางใน editor เท่านั้น ตัว render/CMS ไม่ต้องสนใจ) · ลำดับหน้ายังเป็นลำดับในรายการหน้าเสมอ
///
/// ทุกฟังก์ชันคิดเป็น "พิกัดโลก" ซึ่งมุมซ้ายบนของแต่ละหน้าอยู่ที่ (rect.x, rect.y)

export type PagesLayout = 'single' | 'scroll' | 'board';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

type Size = { width: number; height: number };

/// ระยะห่างระหว่างหน้า (พิกัดหน้า) — เผื่อที่ให้ป้ายชื่อหน้าเหนือแต่ละหน้า
export function pageGap(base: Size): number {
  return Math.round(Math.max(80, Math.max(base.width, base.height) * 0.12));
}

/// หน้าทั้งหมดเรียงลงล่าง จัดกึ่งกลางตามแนวนอน
export function scrollLayout(sizes: Size[], gap: number): Rect[] {
  const widest = Math.max(0, ...sizes.map((s) => s.width));
  let y = 0;

  return sizes.map((size) => {
    const rect = { x: Math.round((widest - size.width) / 2), y, width: size.width, height: size.height };

    y += size.height + gap;

    return rect;
  });
}

/// ตำแหน่งที่จัดเรียงอัตโนมัติ: แถวเดียว หรือเป็นตาราง (จำนวนคอลัมน์ ≈ √จำนวนหน้า) · แต่ละแถวชิดบน
export function autoArrange(sizes: Size[], mode: 'row' | 'grid', gap: number): Point[] {
  const columns = mode === 'row' ? Math.max(1, sizes.length) : Math.max(1, Math.ceil(Math.sqrt(sizes.length)));
  const out: Point[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  sizes.forEach((size, i) => {
    if (i > 0 && i % columns === 0) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }

    out.push({ x, y });
    x += size.width + gap;
    rowHeight = Math.max(rowHeight, size.height);
  });

  return out;
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x && a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}

/// บอร์ด: หน้าที่มีตำแหน่งใช้ตำแหน่งนั้น · หน้าที่ยังไม่มี (หน้าใหม่) วางทางขวาของหน้าก่อนหน้าในจุดที่ว่าง
export function boardLayout(pages: Pick<Page, 'boardX' | 'boardY'>[], sizes: Size[], gap: number): Rect[] {
  const rects: Rect[] = pages.map((page, i) =>
    isPlaced(page) ? { x: page.boardX!, y: page.boardY!, width: sizes[i].width, height: sizes[i].height } : { x: NaN, y: NaN, ...sizes[i] },
  );

  for (let i = 0; i < rects.length; i++) {
    if (!Number.isNaN(rects[i].x)) continue;

    const prev = i > 0 ? rects[i - 1] : null;
    const candidate = { ...rects[i], x: prev ? prev.x + prev.width + gap : 0, y: prev ? prev.y : 0 };

    // ขยับไปทางขวาจนไม่ทับหน้าที่วางไว้แล้ว
    for (let guard = 0; guard < rects.length + 1; guard++) {
      const blocker = rects.find((r, j) => j !== i && !Number.isNaN(r.x) && rectsOverlap(candidate, r, gap / 2));

      if (!blocker) break;
      candidate.x = blocker.x + blocker.width + gap;
    }

    rects[i] = candidate;
  }

  return rects;
}

function isPlaced(page: Pick<Page, 'boardX' | 'boardY'>): boolean {
  return Number.isFinite(page.boardX) && Number.isFinite(page.boardY);
}

/// กรอบของทุกหน้าในพิกัดโลกตามการจัดวาง · `single` = ทุกหน้าอยู่ที่ (0, 0) (แสดงทีละหน้า)
export function layoutPages(pages: Page[], base: Size, layout: PagesLayout): Rect[] {
  const sizes = pages.map((page) => pageSizeOf(page, base));
  const gap = pageGap(base);

  if (layout === 'scroll') return scrollLayout(sizes, gap);
  if (layout === 'board') return boardLayout(pages, sizes, gap);

  return sizes.map((size) => ({ x: 0, y: 0, ...size }));
}

/// หน้าที่มีจุดนี้อยู่ข้างใน (หน้าที่อยู่หลังในรายการชนะเมื่อซ้อนกัน) · -1 = ไม่อยู่ในหน้าใด
export function pageAt(rects: Rect[], p: Point, prefer = -1): number {
  if (prefer >= 0 && rects[prefer] && contains(rects[prefer], p)) return prefer;

  for (let i = rects.length - 1; i >= 0; i--) if (contains(rects[i], p)) return i;

  return -1;
}

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/// เวกเตอร์ที่บวกกับพิกัดของหน้า `from` แล้วได้พิกัดเดียวกันบนหน้า `to` (จุดเดิมในพิกัดโลก)
export function pageOffset(from: Point, to: Point): { dx: number; dy: number } {
  return { dx: from.x - to.x, dy: from.y - to.y };
}

/// แปลงจุดจากพิกัดของหน้าหนึ่งไปเป็นพิกัดของอีกหน้า
export function convertPoint(p: Point, from: Point, to: Point): Point {
  const { dx, dy } = pageOffset(from, to);

  return { x: p.x + dx, y: p.y + dy };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;

  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));

  return { x, y, width: right - x, height: bottom - y };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return w > 0 && h > 0 ? w * h : 0;
}

/// สัดส่วน 0–1 ของหน้าที่มองเห็นในกรอบ `view`
export function visibleFraction(rect: Rect, view: Rect): number {
  return overlapArea(rect, view) / Math.max(1, rect.width * rect.height);
}

/// หน้าที่กินพื้นที่จอมากที่สุด · -1 = ไม่เห็นหน้าใดเลย
export function mostVisiblePage(rects: Rect[], view: Rect): number {
  let best = -1;
  let bestArea = 0;

  rects.forEach((rect, i) => {
    const area = overlapArea(rect, view);

    if (area > bestArea) {
      best = i;
      bestArea = area;
    }
  });

  return best;
}

/// จุดบนขอบกรอบที่เส้นจากกึ่งกลางกรอบไปยัง `toward` ตัดผ่าน (ใช้วาดลูกศรเชื่อมหน้าถัดไปบนบอร์ด)
export function edgePoint(rect: Rect, toward: Point): Point {
  const c = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;

  if (dx === 0 && dy === 0) return c;

  const sx = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);

  return { x: c.x + dx * s, y: c.y + dy * s };
}

/// เลื่อนกรอบที่หลุดออกนอกหน้าทั้งหมดให้กลับมาอยู่กลางหน้า (ใช้ตอนปล่อยชิ้นงานบนภาพย่อของหน้าที่เล็กกว่า)
export function keepInside(box: Rect, page: Size): { dx: number; dy: number } {
  const inside = box.x < page.width && box.x + box.width > 0 && box.y < page.height && box.y + box.height > 0;

  if (inside) return { dx: 0, dy: 0 };

  return { dx: (page.width - box.width) / 2 - box.x, dy: (page.height - box.height) / 2 - box.y };
}
