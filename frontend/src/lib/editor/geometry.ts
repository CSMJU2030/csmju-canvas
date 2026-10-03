import type { CanvasElement } from './types';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEG = Math.PI / 180;

export function center(el: Rect): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

export function rotatePoint(p: Point, origin: Point, degrees: number): Point {
  const rad = degrees * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;

  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

/// มุมทั้งสี่ของกล่องหลังหมุน (ซ้ายบน ขวาบน ขวาล่าง ซ้ายล่าง)
export function corners(el: Rect & { rotation: number }): Point[] {
  const c = center(el);
  const raw = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ];

  return el.rotation ? raw.map((p) => rotatePoint(p, c, el.rotation)) : raw;
}

/// กล่องตั้งตรงที่ครอบ element หลังหมุนแล้ว — ใช้กับ snapping และการเลือกด้วยการลากกรอบ
export function boundingBox(el: Rect & { rotation: number }): Rect {
  const pts = corners(el);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function unionBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;

  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));

  return { x, y, width: right - x, height: bottom - y };
}

/// จุดอยู่ในกล่องที่หมุนแล้วหรือไม่ — แปลงจุดกลับเข้าพิกัดของกล่องก่อนเทียบ
export function hitElement(el: CanvasElement, p: Point, tolerance = 0): boolean {
  const local = el.rotation ? rotatePoint(p, center(el), -el.rotation) : p;
  // เส้นตรงบางมาก ให้ระยะคลิกขั้นต่ำ
  const padY = el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow') ? Math.max(tolerance, 8) : tolerance;

  return (
    local.x >= el.x - tolerance &&
    local.x <= el.x + el.width + tolerance &&
    local.y >= el.y - padY &&
    local.y <= el.y + el.height + padY
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/// ตำแหน่งของ handle ในพิกัด 0..1 ของกล่อง
export const HANDLE_ANCHOR: Record<Handle, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
};

/// ย่อขยายกล่องที่หมุนอยู่จากการลาก handle — ฝั่งตรงข้ามของ handle อยู่กับที่
///
/// คิดในพิกัดของกล่อง (หมุนกลับ) แล้วหมุนตำแหน่งใหม่กลับไปในพิกัดหน้า
/// เพื่อให้มุมที่ถูกตรึงไม่เลื่อนแม้กล่องเอียงอยู่
export function resizeRect(
  start: Rect & { rotation: number },
  handle: Handle,
  pointer: Point,
  options: { keepAspect: boolean; minSize: number },
): Rect {
  const c = center(start);
  const local = rotatePoint(pointer, c, -start.rotation);
  const anchor = HANDLE_ANCHOR[handle];
  const fixed = { x: start.x + (1 - anchor.x) * start.width, y: start.y + (1 - anchor.y) * start.height };
  const movesX = anchor.x !== 0.5;
  const movesY = anchor.y !== 0.5;

  let width = movesX ? Math.abs(local.x - fixed.x) : start.width;
  let height = movesY ? Math.abs(local.y - fixed.y) : start.height;

  width = Math.max(options.minSize, width);
  height = Math.max(options.minSize, height);

  if (options.keepAspect && movesX && movesY) {
    const ratio = start.width / start.height;

    if (width / height > ratio) height = width / ratio;
    else width = height * ratio;
  }

  // กล่องใหม่ในพิกัดท้องถิ่น (ยังไม่หมุน) โดยตรึงฝั่งตรงข้ามไว้ — ลากเลยฝั่งตรึงได้ (กล่องกลับด้าน)
  const localBox = {
    x: movesX ? (local.x >= fixed.x ? fixed.x : fixed.x - width) : start.x + (start.width - width) / 2,
    y: movesY ? (local.y >= fixed.y ? fixed.y : fixed.y - height) : start.y + (start.height - height) / 2,
    width,
    height,
  };

  if (!start.rotation) return localBox;

  // จุดศูนย์กลางใหม่ในพิกัดท้องถิ่น → หมุนรอบศูนย์กลางเดิมกลับไปพิกัดหน้า
  const newCenterLocal = center(localBox);
  const newCenter = rotatePoint(newCenterLocal, c, start.rotation);

  return { x: newCenter.x - width / 2, y: newCenter.y - height / 2, width, height };
}

export function angleFromCenter(c: Point, p: Point): number {
  return Math.atan2(p.y - c.y, p.x - c.x) / DEG;
}

export function normalizeAngle(degrees: number): number {
  const a = degrees % 360;

  return a < 0 ? a + 360 : a;
}
