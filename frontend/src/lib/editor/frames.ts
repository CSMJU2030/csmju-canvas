import type { FrameElement, FrameImage, FrameShape, GridElement, GridLayout } from './types';

/// กรอบ (frame) และกริด (grid) แบบ Canva — คณิตศาสตร์ล้วน ไม่แตะ DOM (ทดสอบได้ใน vitest)
///
/// - กรอบ = รูปทรงที่เป็นหน้ากาก มีรูปได้หนึ่งรูป วางแบบเต็มช่อง (cover) แล้วซูม/เลื่อนในกรอบได้
/// - กริด = หลายช่องตามเค้าโครงสำเร็จรูป แต่ละช่องมีรูปของตัวเอง · `gap` = ระยะห่างระหว่างช่อง
///
/// รูปทรงทุกแบบเขียนเป็นสตริง path ของ SVG (`d`) ชุดเดียว ใช้ได้ทั้ง Canvas (`new Path2D(d)`)
/// ภาพตัวอย่างในแผง (`<path d>`) และ CMS ที่ render เอง

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── รายการกรอบและเค้าโครงกริด (ให้แผงองค์ประกอบใช้) ─────────────────────

export interface FrameShapeSpec {
  key: FrameShape;
  label: string;
  /// สัดส่วนกว้าง/สูงตอนเพิ่มลงหน้า
  aspect: number;
}

export const FRAME_SHAPES: FrameShapeSpec[] = [
  { key: 'circle', label: 'วงกลม', aspect: 1 },
  { key: 'rounded', label: 'สี่เหลี่ยมมุมมน', aspect: 1 },
  { key: 'square', label: 'สี่เหลี่ยม', aspect: 1 },
  { key: 'heart', label: 'หัวใจ', aspect: 1.1 },
  { key: 'star', label: 'ดาว', aspect: 1 },
  { key: 'blob', label: 'ทรงอิสระ', aspect: 1 },
  { key: 'arch', label: 'ซุ้มโค้ง', aspect: 0.75 },
  { key: 'polaroid', label: 'โพลารอยด์', aspect: 0.82 },
  { key: 'phone', label: 'หน้าจอมือถือ', aspect: 0.5 },
  { key: 'laptop', label: 'หน้าจอแล็ปท็อป', aspect: 1.5 },
];

export interface GridLayoutSpec {
  key: GridLayout;
  label: string;
  /// สัดส่วนกว้าง/สูงตอนเพิ่มลงหน้า
  aspect: number;
  /// ช่องเป็นสัดส่วน 0–1 ของกล่อง
  cells: Box[];
}

const third = 1 / 3;

export const GRID_LAYOUTS: GridLayoutSpec[] = [
  { key: 'cols-2', label: '2 คอลัมน์', aspect: 1.5, cells: [cell(0, 0, 0.5, 1), cell(0.5, 0, 0.5, 1)] },
  { key: 'rows-2', label: '2 แถว', aspect: 0.8, cells: [cell(0, 0, 1, 0.5), cell(0, 0.5, 1, 0.5)] },
  { key: 'cols-3', label: '3 คอลัมน์', aspect: 1.8, cells: [cell(0, 0, third, 1), cell(third, 0, third, 1), cell(2 * third, 0, third, 1)] },
  {
    key: 'grid-2x2',
    label: 'ตาราง 2×2',
    aspect: 1,
    cells: [cell(0, 0, 0.5, 0.5), cell(0.5, 0, 0.5, 0.5), cell(0, 0.5, 0.5, 0.5), cell(0.5, 0.5, 0.5, 0.5)],
  },
  {
    key: 'big-2',
    label: '1 ใหญ่ + 2 เล็ก',
    aspect: 1.4,
    cells: [cell(0, 0, 0.6, 1), cell(0.6, 0, 0.4, 0.5), cell(0.6, 0.5, 0.4, 0.5)],
  },
  {
    key: 'big-3',
    label: '1 ใหญ่ + 3 เล็ก',
    aspect: 1,
    cells: [cell(0, 0, 1, 0.6), cell(0, 0.6, third, 0.4), cell(third, 0.6, third, 0.4), cell(2 * third, 0.6, third, 0.4)],
  },
  {
    key: 'collage-5',
    label: 'คอลลาจ 5 ช่อง',
    aspect: 1.2,
    cells: [
      cell(0, 0, 0.5, 0.55),
      cell(0.5, 0, 0.5, 0.55),
      cell(0, 0.55, third, 0.45),
      cell(third, 0.55, third, 0.45),
      cell(2 * third, 0.55, third, 0.45),
    ],
  },
  {
    key: 'collage-6',
    label: 'คอลลาจ 6 ช่อง',
    aspect: 1,
    cells: [
      cell(0, 0, 2 * third, 2 * third),
      cell(2 * third, 0, third, third),
      cell(2 * third, third, third, third),
      cell(0, 2 * third, third, third),
      cell(third, 2 * third, third, third),
      cell(2 * third, 2 * third, third, third),
    ],
  },
];

function cell(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

export function frameShapeSpec(shape: FrameShape): FrameShapeSpec {
  return FRAME_SHAPES.find((s) => s.key === shape) ?? FRAME_SHAPES[2];
}

export function gridLayoutSpec(layout: GridLayout): GridLayoutSpec {
  return GRID_LAYOUTS.find((l) => l.key === layout) ?? GRID_LAYOUTS[3];
}

// ── การวางรูปแบบเต็มช่อง (cover) ซูม และเลื่อน ───────────────────────────

export const FRAME_ZOOM_MIN = 1;
export const FRAME_ZOOM_MAX = 5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, FRAME_ZOOM_MIN, FRAME_ZOOM_MAX) : 1;
}

/// กล่องที่วาดรูปจริง (อาจล้นช่อง) — ย่อให้เต็มช่องพอดี (cover) แล้วคูณซูม
/// `offsetX/offsetY` แบบ CSS object-position: 0 = ชิดซ้าย/บน · 0.5 = กึ่งกลาง · 1 = ชิดขวา/ล่าง
export function coverRect(area: Box, naturalWidth: number, naturalHeight: number, zoom = 1, offsetX = 0.5, offsetY = 0.5): Box {
  const nw = Math.max(1, naturalWidth);
  const nh = Math.max(1, naturalHeight);
  const scale = Math.max(area.width / nw, area.height / nh) * clampZoom(zoom);
  const width = nw * scale;
  const height = nh * scale;

  return {
    x: area.x + (area.width - width) * clamp(offsetX, 0, 1),
    y: area.y + (area.height - height) * clamp(offsetY, 0, 1),
    width,
    height,
  };
}

/// ลากรูปในกรอบไป dx, dy (พิกเซลของหน้า ในแกนของกล่องก่อนหมุน) → offset ใหม่ (ไม่ให้เห็นขอบรูป)
export function panOffset(
  area: Box,
  image: Pick<FrameImage, 'zoom' | 'offsetX' | 'offsetY'>,
  natural: { width: number; height: number },
  dx: number,
  dy: number,
): { offsetX: number; offsetY: number } {
  const dest = coverRect(area, natural.width, natural.height, image.zoom);
  const overflowX = area.width - dest.width;
  const overflowY = area.height - dest.height;

  return {
    offsetX: overflowX < -0.001 ? clamp(image.offsetX + dx / overflowX, 0, 1) : image.offsetX,
    offsetY: overflowY < -0.001 ? clamp(image.offsetY + dy / overflowY, 0, 1) : image.offsetY,
  };
}

/// ส่วนของรูปที่มองเห็นในช่อง เป็นสัดส่วน 0–1 ของรูป — ใช้ตอน "แยกรูปออก" ให้รูปที่ได้หน้าตาเหมือนเดิม
export function visibleCrop(area: Box, natural: { width: number; height: number }, image: Pick<FrameImage, 'zoom' | 'offsetX' | 'offsetY' | 'flipX' | 'flipY'>) {
  const dest = coverRect(area, natural.width, natural.height, image.zoom, image.offsetX, image.offsetY);
  const width = clamp(area.width / dest.width, 0, 1);
  const height = clamp(area.height / dest.height, 0, 1);
  let x = clamp((area.x - dest.x) / dest.width, 0, 1 - width);
  let y = clamp((area.y - dest.y) / dest.height, 0, 1 - height);

  // รูปพลิกภายในกล่องของมันเอง → ส่วนที่เห็นคือฝั่งตรงข้ามของรูปต้นฉบับ
  if (image.flipX) x = 1 - x - width;
  if (image.flipY) y = 1 - y - height;

  return { x, y, width, height };
}

// ── ช่องของกริด ──────────────────────────────────────────────────────

const EDGE = 0.001;

/// ช่องของกริดเป็นพิกัดหน้า (ก่อนหมุน) · ระยะห่างแบ่งครึ่งให้ขอบด้านในของแต่ละช่อง ขอบนอกชิดกล่อง
export function gridCellRects(el: Pick<GridElement, 'x' | 'y' | 'width' | 'height' | 'layout' | 'gap'>): Box[] {
  const gap = Math.max(0, el.gap || 0);
  const half = gap / 2;

  return gridLayoutSpec(el.layout).cells.map((c) => {
    const left = el.x + c.x * el.width + (c.x > EDGE ? half : 0);
    const top = el.y + c.y * el.height + (c.y > EDGE ? half : 0);
    const right = el.x + (c.x + c.width) * el.width - (c.x + c.width < 1 - EDGE ? half : 0);
    const bottom = el.y + (c.y + c.height) * el.height - (c.y + c.height < 1 - EDGE ? half : 0);

    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  });
}

export function gridCellCount(layout: GridLayout): number {
  return gridLayoutSpec(layout).cells.length;
}

/// ระยะห่างสูงสุดที่สไลเดอร์ให้เลือก (ไม่ให้ช่องหายไป)
export function maxGridGap(el: Pick<GridElement, 'width' | 'height'>): number {
  return Math.max(1, Math.round(Math.min(el.width, el.height) / 4));
}

/// หมุนจุดของหน้ากลับเป็นพิกัดก่อนหมุนของกล่อง
export function toLocal(el: Box & { rotation: number }, p: { x: number; y: number }): { x: number; y: number } {
  if (!el.rotation) return p;

  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = (-el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return { x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos };
}

/// หมุนเวกเตอร์การลาก (พิกัดหน้า) ให้อยู่ในแกนของกล่อง
export function toLocalDelta(rotation: number, dx: number, dy: number): { dx: number; dy: number } {
  if (!rotation) return { dx, dy };

  const rad = (-rotation * Math.PI) / 180;

  return { dx: dx * Math.cos(rad) - dy * Math.sin(rad), dy: dx * Math.sin(rad) + dy * Math.cos(rad) };
}

function inside(b: Box, p: { x: number; y: number }) {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}

/// พื้นที่รูปของช่อง (กรอบมีช่องเดียว = 0)
export function cellArea(el: FrameElement | GridElement, index: number): Box | null {
  if (el.type === 'frame') return index === 0 ? frameArea(el.shape, el) : null;

  return gridCellRects(el)[index] ?? null;
}

/// ช่องใต้จุดของหน้า · −1 = ไม่โดนช่องใด (เช่นตกร่องระยะห่าง)
export function cellAt(el: FrameElement | GridElement, p: { x: number; y: number }): number {
  const local = toLocal(el, p);

  if (el.type === 'frame') return inside(el, local) ? 0 : -1;

  return gridCellRects(el).findIndex((c) => inside(c, local));
}

/// มุมทั้งสี่ของช่องบนหน้า (หมุนตามกล่องแล้ว) — ใช้วาดกรอบเน้นช่อง
export function cellCorners(el: FrameElement | GridElement, index: number): { x: number; y: number }[] {
  const area = cellArea(el, index);

  if (!area) return [];

  const pts = [
    { x: area.x, y: area.y },
    { x: area.x + area.width, y: area.y },
    { x: area.x + area.width, y: area.y + area.height },
    { x: area.x, y: area.y + area.height },
  ];

  return el.rotation ? pts.map((p) => toLocal({ ...el, rotation: -el.rotation }, p)) : pts;
}

export function cellImages(el: FrameElement | GridElement): (FrameImage | null)[] {
  return el.type === 'frame' ? [el.image] : el.cells;
}

// ── รูปทรงของกรอบ (path ของ SVG) ───────────────────────────────────────

const f = (v: number) => String(Math.round(v * 100) / 100);

export function roundRectPath(b: Box, radius: number): string {
  const r = Math.max(0, Math.min(radius, b.width / 2, b.height / 2));
  const { x, y, width: w, height: h } = b;

  if (r <= 0) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;

  const arc = (ex: number, ey: number) => `A${f(r)} ${f(r)} 0 0 1 ${f(ex)} ${f(ey)}`;

  return (
    `M${f(x + r)} ${f(y)}H${f(x + w - r)}${arc(x + w, y + r)}V${f(y + h - r)}${arc(x + w - r, y + h)}` +
    `H${f(x + r)}${arc(x, y + h - r)}V${f(y + r)}${arc(x + r, y)}Z`
  );
}

function ellipsePath(b: Box): string {
  const rx = b.width / 2;
  const ry = b.height / 2;
  const cy = b.y + ry;

  return `M${f(b.x)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(b.x + b.width)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(b.x)} ${f(cy)}Z`;
}

/// หัวใจ: เส้นโค้งเบซิเยร์ในกล่อง 0–1
const HEART: [number, number][][] = [
  [[0.5, 0.18]],
  [[0.5, 0.14], [0.43, 0], [0.25, 0]],
  [[0.02, 0], [0, 0.26], [0, 0.31]],
  [[0, 0.52], [0.16, 0.73], [0.5, 1]],
  [[0.84, 0.73], [1, 0.52], [1, 0.31]],
  [[1, 0.26], [0.98, 0], [0.75, 0]],
  [[0.57, 0], [0.5, 0.14], [0.5, 0.18]],
];

function heartPath(b: Box): string {
  const px = (p: [number, number]) => `${f(b.x + p[0] * b.width)} ${f(b.y + p[1] * b.height)}`;

  return HEART.map((seg, i) => (i === 0 ? `M${px(seg[0])}` : `C${seg.map(px).join(' ')}`)).join('') + 'Z';
}

function starPath(b: Box): string {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 1 : 0.48;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;

    return `${f(cx + (Math.cos(a) * b.width * r) / 2)} ${f(cy + (Math.sin(a) * b.height * r) / 2)}`;
  });

  return `M${pts.join('L')}Z`;
}

/// ทรงอิสระ: รัศมีไม่เท่ากัน 8 จุด แล้วลากเส้นโค้งเรียบผ่านทุกจุด (Catmull-Rom → เบซิเยร์)
const BLOB_RADII = [1, 0.84, 0.97, 0.8, 0.95, 0.86, 1, 0.82];

function blobPath(b: Box): string {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const n = BLOB_RADII.length;
  const pts = BLOB_RADII.map((r, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;

    return { x: cx + (Math.cos(a) * b.width * r) / 2, y: cy + (Math.sin(a) * b.height * r) / 2 };
  });
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }

  return `${d}Z`;
}

function archPath(b: Box): string {
  const rx = b.width / 2;
  const ry = Math.min(rx, b.height / 2);

  return `M${f(b.x)} ${f(b.y + b.height)}V${f(b.y + ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(b.x + b.width)} ${f(b.y + ry)}V${f(b.y + b.height)}Z`;
}

/// พื้นที่ที่รูปแสดงภายในกล่องของกรอบ (โพลารอยด์ มือถือ แล็ปท็อปมีขอบรอบรูป)
export function frameArea(shape: FrameShape, b: Box): Box {
  const { x, y, width: w, height: h } = b;

  switch (shape) {
    case 'polaroid': {
      const pad = Math.min(w, h) * 0.06;

      return { x: x + pad, y: y + pad, width: Math.max(1, w - pad * 2), height: Math.max(1, h - pad - h * 0.2) };
    }
    case 'phone': {
      const padX = w * 0.055;
      const padY = Math.min(h * 0.05, w * 0.12);

      return { x: x + padX, y: y + padY, width: Math.max(1, w - padX * 2), height: Math.max(1, h - padY * 2) };
    }
    case 'laptop': {
      const lid = laptopLid(b);
      const pad = lid.width * 0.03;

      return { x: lid.x + pad, y: lid.y + pad, width: Math.max(1, lid.width - pad * 2), height: Math.max(1, lid.height - pad * 1.6) };
    }
    default:
      return b;
  }
}

function laptopLid(b: Box): Box {
  return { x: b.x + b.width * 0.08, y: b.y, width: b.width * 0.84, height: b.height * 0.9 };
}

/// หน้ากากของรูป (path ใน `area`)
export function frameMaskPath(shape: FrameShape, area: Box): string {
  const short = Math.min(area.width, area.height);

  switch (shape) {
    case 'circle':
      return ellipsePath(area);
    case 'rounded':
      return roundRectPath(area, short * 0.12);
    case 'heart':
      return heartPath(area);
    case 'star':
      return starPath(area);
    case 'blob':
      return blobPath(area);
    case 'arch':
      return archPath(area);
    case 'phone':
      return roundRectPath(area, short * 0.1);
    default:
      return roundRectPath(area, 0);
  }
}

export interface DecorLayer {
  d: string;
  fill: string;
  stroke?: string;
}

/// ส่วนประดับของกรอบที่เป็นอุปกรณ์/กระดาษ: `back` วาดก่อนรูป · `front` วาดทับรูป
export function frameDecor(shape: FrameShape, b: Box): { back: DecorLayer[]; front: DecorLayer[] } {
  const { x, y, width: w, height: h } = b;

  switch (shape) {
    case 'polaroid':
      return { back: [{ d: roundRectPath(b, Math.min(w, h) * 0.015), fill: 'rgb(255 255 255)', stroke: 'rgb(226 232 240)' }], front: [] };
    case 'phone': {
      const area = frameArea('phone', b);

      return {
        back: [{ d: roundRectPath(b, Math.min(w * 0.16, h * 0.08)), fill: 'rgb(30 41 59)' }],
        front: [{ d: roundRectPath({ x: x + w * 0.35, y: area.y + w * 0.025, width: w * 0.3, height: w * 0.06 }, w * 0.03), fill: 'rgb(30 41 59)' }],
      };
    }
    case 'laptop': {
      const lid = laptopLid(b);
      const top = y + h * 0.9;

      return {
        back: [
          { d: roundRectPath(lid, lid.width * 0.03), fill: 'rgb(30 41 59)' },
          { d: `M${f(x)} ${f(top)}H${f(x + w)}L${f(x + w * 0.96)} ${f(y + h)}H${f(x + w * 0.04)}Z`, fill: 'rgb(148 163 184)' },
          { d: roundRectPath({ x: x + w * 0.42, y: top, width: w * 0.16, height: h * 0.03 }, h * 0.015), fill: 'rgb(100 116 139)' },
        ],
        front: [],
      };
    }
    default:
      return { back: [], front: [] };
  }
}

/// ไอคอนรูปภาพบนช่องว่าง (เส้น ขนาด 24×24 แบบ lucide) — ผู้วาดย่อขยายเอง
export const PLACEHOLDER_ICON = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21M9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z';
export const PLACEHOLDER_HINT = 'ลากรูปมาวางที่นี่';
export const PLACEHOLDER_FILL = 'rgb(203 213 225)';
export const PLACEHOLDER_INK = 'rgb(71 85 105)';

// ── อ่าน JSON ที่บันทึกไว้ ────────────────────────────────────────────

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function normalizeFrameImage(input: unknown): FrameImage | null {
  const raw = input as Partial<FrameImage> | null;

  if (!raw || typeof raw !== 'object' || typeof raw.src !== 'string' || raw.src === '') return null;

  return {
    ...raw,
    src: raw.src,
    assetId: typeof raw.assetId === 'string' ? raw.assetId : null,
    naturalWidth: Math.max(1, num(raw.naturalWidth, 1000)),
    naturalHeight: Math.max(1, num(raw.naturalHeight, 1000)),
    zoom: clampZoom(num(raw.zoom, 1)),
    offsetX: clamp(num(raw.offsetX, 0.5), 0, 1),
    offsetY: clamp(num(raw.offsetY, 0.5), 0, 1),
  };
}

export function normalizeFrame<T extends FrameElement>(el: T): T {
  return {
    ...el,
    shape: FRAME_SHAPES.some((s) => s.key === el.shape) ? el.shape : 'square',
    image: normalizeFrameImage(el.image),
  };
}

export function normalizeGrid<T extends GridElement>(el: T): T {
  const layout = GRID_LAYOUTS.some((l) => l.key === el.layout) ? el.layout : 'grid-2x2';
  const count = gridCellCount(layout);
  const cells = Array.isArray(el.cells) ? el.cells : [];

  return {
    ...el,
    layout,
    gap: Math.max(0, num(el.gap, 0)),
    cornerRadius: Math.max(0, num(el.cornerRadius, 0)),
    cells: Array.from({ length: count }, (_, i) => normalizeFrameImage(cells[i])),
  };
}

/// เปลี่ยนเค้าโครงกริด — รูปเดิมย้ายตามลำดับช่อง (เกินจำนวนช่องใหม่ = ตัดออก)
export function relayoutCells(cells: (FrameImage | null)[], layout: GridLayout): (FrameImage | null)[] {
  const filled = cells.filter((c): c is FrameImage => Boolean(c));

  return Array.from({ length: gridCellCount(layout) }, (_, i) => filled[i] ?? null);
}
