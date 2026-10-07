/// แอนิเมชันของชิ้นงานและการเปลี่ยนหน้า — ใช้ชุดเดียวกันทั้งตัวอย่างในหน้าแก้ไข พรีเซนต์ และการส่งออก GIF/วิดีโอ
///
/// ลำดับเวลาในหน้าหนึ่ง (มิลลิวินาทีหลังเข้าหน้า):
///   1. เข้า — ชิ้นที่มีแอนิเมชันเข้าเล่นต่อกันทีละชิ้น (เหลื่อม 150 ms ชิ้นละ 800 ms ÷ ความเร็ว)
///   2. หลังเข้าจบ — เดินตามเส้นทางเคลื่อนที่ และเล่นแอนิเมชันเน้นวนไปเรื่อย ๆ
///   3. ออก — เมื่อถึง `exitAt` (ก่อนเปลี่ยนหน้า) ชิ้นที่มีแอนิเมชันออกเล่นย้อนลำดับ
///
/// ทุกอย่างคำนวณจากเวลาอย่างเดียว (ไม่มีสถานะภายใน) จึงวาดเฟรมไหนก่อนหลังก็ได้ผลเท่ากัน

import type { AnimationKind, CanvasElement, EmphasisKind, ExitKind, MotionPath, Page, PageTransition, TextElement, TransitionKind } from './types';

export const ENTRY_MS = 800;
export const STAGGER_MS = 150;
export const EXIT_MS = 600;
const LOOP_MS = 1400;
const ROTATE_MS = 3000;
export const DEFAULT_TRANSITION_MS = 600;
export const DEFAULT_PATH_MS = 2000;

export const ENTRY_ANIMATIONS: { key: AnimationKind; label: string }[] = [
  { key: 'rise', label: 'ลอยขึ้น' },
  { key: 'pan', label: 'แพน' },
  { key: 'fade', label: 'จางเข้า' },
  { key: 'pop', label: 'ป๊อป' },
  { key: 'wipe', label: 'เช็ด' },
  { key: 'blur', label: 'เบลอ' },
  { key: 'drift', label: 'ล่องลอย' },
  { key: 'tumble', label: 'ตีลังกา' },
  { key: 'breathe', label: 'หายใจ' },
  { key: 'bounce', label: 'เด้ง' },
  { key: 'zoom', label: 'ซูมเข้า' },
  { key: 'drop', label: 'หล่นลง' },
  { key: 'slide-left', label: 'สไลด์จากขวา' },
  { key: 'flip', label: 'พลิก' },
  { key: 'spin', label: 'หมุนเข้า' },
  { key: 'stomp', label: 'กระแทก' },
  { key: 'typewriter', label: 'พิมพ์ดีด' },
  { key: 'flicker', label: 'ไฟนีออน' },
];

export const EMPHASIS_ANIMATIONS: { key: EmphasisKind; label: string }[] = [
  { key: 'pulse', label: 'เต้นเป็นจังหวะ' },
  { key: 'wiggle', label: 'ส่าย' },
  { key: 'rotate', label: 'หมุนวน' },
  { key: 'float', label: 'ลอยขึ้นลง' },
  { key: 'blink', label: 'กะพริบ' },
  { key: 'shake', label: 'สั่น' },
  { key: 'heartbeat', label: 'หัวใจเต้น' },
  { key: 'swing', label: 'แกว่ง' },
];

export const EXIT_ANIMATIONS: { key: ExitKind; label: string }[] = [
  { key: 'fade', label: 'จางออก' },
  { key: 'sink', label: 'จมลง' },
  { key: 'rise', label: 'ลอยออก' },
  { key: 'shrink', label: 'หดหาย' },
  { key: 'wipe', label: 'เช็ดออก' },
  { key: 'blur', label: 'เบลอออก' },
  { key: 'spin', label: 'หมุนออก' },
  { key: 'slide-right', label: 'สไลด์ออกขวา' },
];

export const TRANSITIONS: { key: TransitionKind; label: string }[] = [
  { key: 'fade', label: 'จางซ้อน' },
  { key: 'slide', label: 'สไลด์' },
  { key: 'push', label: 'ดันออก' },
  { key: 'wipe', label: 'เช็ด' },
  { key: 'zoom', label: 'ซูม' },
  { key: 'circle', label: 'วงกลม' },
  { key: 'flip', label: 'พลิกหน้า' },
  { key: 'blinds', label: 'มู่ลี่' },
];

export type PathPreset = 'line' | 'arc' | 'circle' | 'zigzag' | 'wave' | 'loop';

export const PATH_PRESETS: { key: PathPreset; label: string }[] = [
  { key: 'line', label: 'เส้นตรง' },
  { key: 'arc', label: 'โค้ง' },
  { key: 'circle', label: 'วงกลม' },
  { key: 'zigzag', label: 'ซิกแซก' },
  { key: 'wave', label: 'คลื่น' },
  { key: 'loop', label: 'ห่วง' },
];

/// สถานะการเคลื่อนไหวของชิ้นหนึ่ง ณ เวลาหนึ่ง — ไม่มีค่า = ส่วนนั้นไม่เล่น
export interface MotionState {
  /// ความคืบหน้าแอนิเมชันเข้า 0–1
  entry?: number;
  /// มิลลิวินาทีนับจากเริ่มแอนิเมชันเน้น
  loop?: number;
  /// ความคืบหน้าบนเส้นทาง 0–1
  path?: number;
  /// ความคืบหน้าแอนิเมชันออก 0–1
  exit?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeIn = (p: number) => p * p * p;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export function speedOf(el: Pick<CanvasElement, 'animationSpeed'>): number {
  const s = el.animationSpeed ?? 1;

  return Number.isFinite(s) ? Math.max(0.25, Math.min(4, s)) : 1;
}

export function isAnimated(el: CanvasElement): boolean {
  return Boolean(el.animation || el.animationLoop || el.animationExit || (el.motionPath && el.motionPath.points.length >= 4));
}

/// หน้านี้มีการเคลื่อนไหวต่อเนื่อง (แอนิเมชันเน้นหรือเส้นทางแบบวน) — ผืนที่แสดงต้องวาดทุกเฟรม
export function pageLoops(page: Page): boolean {
  return page.elements.some((el) => !el.hidden && (el.animationLoop || el.motionPath?.loop));
}

interface Schedule {
  entryStart: Map<string, number>;
  exitOrder: Map<string, number>;
}

function schedule(page: Page): Schedule {
  const entering = page.elements.filter((el) => el.animation);
  const exiting = page.elements.filter((el) => el.animationExit);

  return {
    entryStart: new Map(entering.map((el, i) => [el.id, i * STAGGER_MS])),
    // ออกย้อนลำดับ: ชิ้นบนสุดออกก่อน
    exitOrder: new Map(exiting.map((el, i) => [el.id, exiting.length - 1 - i])),
  };
}

function entryDuration(el: CanvasElement) {
  return ENTRY_MS / speedOf(el);
}

function entryEnd(el: CanvasElement, plan: Schedule) {
  const start = plan.entryStart.get(el.id);

  return start === undefined ? 0 : start + entryDuration(el);
}

/// เวลาที่แอนิเมชันเข้าของหน้านี้เล่นจบ (0 = ไม่มี)
export function entryLength(page: Page): number {
  const plan = schedule(page);

  return Math.max(0, ...page.elements.map((el) => entryEnd(el, plan)));
}

/// เวลาที่เส้นทางแบบไม่วนเดินถึงปลายทางครบทุกชิ้น
export function settleLength(page: Page): number {
  const plan = schedule(page);
  const paths = page.elements.filter((el) => el.motionPath && !el.motionPath.loop);

  return Math.max(entryLength(page), ...paths.map((el) => entryEnd(el, plan) + el.motionPath!.duration / speedOf(el)));
}

/// ความยาวของแอนิเมชันออกทั้งหน้า (0 = ไม่มี)
export function exitLength(page: Page): number {
  const exiting = page.elements.filter((el) => el.animationExit);

  return exiting.length === 0 ? 0 : Math.max(...exiting.map((el, i) => (exiting.length - 1 - i) * STAGGER_MS + EXIT_MS / speedOf(el)));
}

/// สถานะของทุกชิ้นในหน้า ณ `elapsed` มิลลิวินาทีหลังเข้าหน้า · `exitAt` = เวลาที่เริ่มออก (ไม่ใส่ = ไม่ออก)
export function pageMotion(page: Page, elapsed: number, exitAt = Number.POSITIVE_INFINITY): (el: CanvasElement) => MotionState | undefined {
  const plan = schedule(page);

  return (el) => {
    if (!isAnimated(el)) return undefined;

    const state: MotionState = {};
    const start = plan.entryStart.get(el.id);
    const settled = entryEnd(el, plan);

    if (start !== undefined) state.entry = clamp01((elapsed - start) / entryDuration(el));

    if (el.motionPath && el.motionPath.points.length >= 4 && Number.isFinite(elapsed)) {
      const travel = Math.max(1, el.motionPath.duration / speedOf(el));
      const t = Math.max(0, elapsed - settled) / travel;

      // วน = ไป-กลับ ไม่กระโดดกลับจุดเริ่ม
      state.path = el.motionPath.loop ? 1 - Math.abs((t % 2) - 1) : clamp01(t);
    } else if (el.motionPath && !el.motionPath.loop) {
      state.path = 1;
    }

    if (el.animationLoop && Number.isFinite(elapsed) && elapsed > settled) state.loop = elapsed - settled;

    if (el.animationExit && Number.isFinite(exitAt)) {
      const order = plan.exitOrder.get(el.id) ?? 0;

      state.exit = clamp01((elapsed - exitAt - order * STAGGER_MS) / (EXIT_MS / speedOf(el)));
    }

    return state;
  };
}

/// ภาพสุดท้ายของหน้าหลังเล่นแอนิเมชันออกครบ — ใช้เป็นหน้าเดิมระหว่างเปลี่ยนหน้า
export function finalMotion(page: Page): (el: CanvasElement) => MotionState | undefined {
  const exitAt = settleLength(page);

  return pageMotion(page, exitAt + exitLength(page), exitAt);
}

/// ตัวอย่างในหน้าแก้ไข: เข้า → เส้นทาง/เน้นหนึ่งรอบ → ออก
export function previewLength(els: CanvasElement[]): number {
  return Math.max(...els.map((el) => previewParts(el).total), 0);
}

function previewParts(el: CanvasElement) {
  const speed = speedOf(el);
  const entry = el.animation ? ENTRY_MS / speed : 0;
  const middle = Math.max(el.motionPath ? el.motionPath.duration / speed : 0, el.animationLoop ? (el.animationLoop === 'rotate' ? ROTATE_MS : LOOP_MS * 1.5) / speed : 0);
  const exit = el.animationExit ? EXIT_MS / speed + 200 : 0;

  return { entry, middle, exit, total: entry + middle + exit };
}

export function previewMotion(el: CanvasElement, elapsed: number): MotionState | undefined {
  if (!isAnimated(el)) return undefined;

  const parts = previewParts(el);
  const state: MotionState = {};

  if (el.animation) state.entry = clamp01(elapsed / parts.entry);
  if (el.motionPath && el.motionPath.points.length >= 4) {
    const t = clamp01((elapsed - parts.entry) / Math.max(1, el.motionPath.duration / speedOf(el)));

    // ตัวอย่างของเส้นทางแบบวนเดินไปแล้วกลับ ให้ชิ้นงานจบที่ตำแหน่งเดิม
    state.path = el.motionPath.loop ? 1 - Math.abs(t * 2 - 1) : t;
  }
  if (el.animationLoop && elapsed > parts.entry && elapsed < parts.entry + parts.middle) state.loop = elapsed - parts.entry;
  if (el.animationExit) state.exit = clamp01((elapsed - parts.entry - parts.middle) / (EXIT_MS / speedOf(el)));

  return state;
}

// ── เส้นทาง ────────────────────────────────────────────────────────

/// เส้นทางสำเร็จรูป: ระยะ `distance` px ไปทาง `angle` องศา (0 = ขวา · 90 = ลง)
export function pathPreset(kind: PathPreset, distance: number, angle: number): number[] {
  const steps = 48;
  const out: number[] = [];
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // จุดในแกนของเส้นทาง (u ตามทิศ, v ตั้งฉาก) แล้วหมุนไปตามมุม
  const push = (u: number, v: number) => out.push(Math.round((u * cos - v * sin) * 10) / 10, Math.round((u * sin + v * cos) * 10) / 10);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    switch (kind) {
      case 'line':
        if (i === 0 || i === steps) push(t * distance, 0);
        break;
      case 'arc':
        push(t * distance, -Math.sin(t * Math.PI) * distance * 0.35);
        break;
      case 'circle': {
        const r = distance / 2;

        push(r - r * Math.cos(t * Math.PI * 2), -r * Math.sin(t * Math.PI * 2));
        break;
      }
      case 'zigzag': {
        const seg = (t * 4) % 1;
        const up = Math.floor(t * 4) % 2 === 0;

        if (i % 6 === 0) push(t * distance, (up ? seg : 1 - seg) * distance * 0.2);
        break;
      }
      case 'wave':
        push(t * distance, Math.sin(t * Math.PI * 4) * distance * 0.12);
        break;
      case 'loop': {
        const a = t * Math.PI * 2;

        push(t * distance + Math.sin(a) * distance * 0.2, -(1 - Math.cos(a)) * distance * 0.2);
        break;
      }
    }
  }

  // จุดแรกต้องเป็น 0,0 เสมอ (ตำแหน่งเดิมของชิ้นงาน)
  return [0, 0, ...out.slice(2)];
}

/// จุดบนเส้นทางที่ความคืบหน้า `t` (0–1) ตามความยาวจริงของเส้น ไม่ใช่ตามจำนวนจุด
export function pointOnPath(points: number[], t: number): [number, number] {
  if (points.length < 4) return [0, 0];

  const lengths = [0];

  for (let i = 2; i < points.length; i += 2) {
    lengths.push(lengths[lengths.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]));
  }

  const total = lengths[lengths.length - 1];

  if (total === 0) return [points[0], points[1]];

  const target = clamp01(t) * total;
  let seg = 1;

  while (seg < lengths.length - 1 && lengths[seg] < target) seg++;

  const span = lengths[seg] - lengths[seg - 1] || 1;
  const f = (target - lengths[seg - 1]) / span;
  const i = seg * 2;

  return [points[i - 2] + (points[i] - points[i - 2]) * f, points[i - 1] + (points[i + 1] - points[i - 1]) * f];
}

/// แปลงเส้นที่ผู้ใช้วาด (พิกัดหน้า) เป็นเส้นทางของชิ้นงาน — เริ่มที่จุดกึ่งกลางชิ้นงาน
export function pathFromStroke(stroke: number[], el: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height'>): number[] {
  if (stroke.length < 4) return [];

  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  // เส้นที่เริ่มใกล้ชิ้นงานใช้ปลายนั้นเป็นจุดเริ่ม
  const startNear = Math.hypot(stroke[0] - cx, stroke[1] - cy) <= Math.hypot(stroke[stroke.length - 2] - cx, stroke[stroke.length - 1] - cy);
  const pts = startNear ? stroke : reversePairs(stroke);
  const out: number[] = [];
  // ลดจุดให้เหลือไม่เกิน ~120 จุด
  const every = Math.max(1, Math.floor(pts.length / 2 / 120));

  for (let i = 0; i < pts.length; i += 2 * every) out.push(Math.round(pts[i] - pts[0]), Math.round(pts[i + 1] - pts[1]));

  const lx = Math.round(pts[pts.length - 2] - pts[0]);
  const ly = Math.round(pts[pts.length - 1] - pts[1]);

  if (out[out.length - 2] !== lx || out[out.length - 1] !== ly) out.push(lx, ly);

  return out;
}

function reversePairs(points: number[]) {
  const out: number[] = [];

  for (let i = points.length - 2; i >= 0; i -= 2) out.push(points[i], points[i + 1]);

  return out;
}

export function defaultMotionPath(points: number[]): MotionPath {
  return { points, duration: DEFAULT_PATH_MS, loop: false };
}

// ── การวาด ─────────────────────────────────────────────────────────

/// ข้อความที่พิมพ์ออกมาแล้ว ณ ความคืบหน้า `p` (แอนิเมชันพิมพ์ดีด) — นับตามตัวอักษรที่มองเห็น ไม่ตัดสระ/วรรณยุกต์ไทยแยกจากพยัญชนะ
export function typewriterText(text: string, p: number): string {
  if (p >= 1) return text;

  const graphemes = splitGraphemes(text);

  return graphemes.slice(0, Math.floor(graphemes.length * clamp01(p))).join('');
}

function splitGraphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;

  if (Seg) return Array.from(new Seg('th', { granularity: 'grapheme' }).segment(text), (s) => s.segment);

  // สำรอง: รวมสระบน/ล่างและวรรณยุกต์ (U+0E31, U+0E34–U+0E3A, U+0E47–U+0E4E) เข้ากับตัวก่อนหน้า
  const out: string[] = [];

  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const combining = code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);

    if (combining && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
  }

  return out;
}

/// ปรับ transform/ความทึบ/ตัวกรองของ context ตามสถานะ — เรียกก่อนหมุนตามมุมของชิ้นงาน
export function applyMotion(ctx: CanvasRenderingContext2D, el: CanvasElement, state: MotionState) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const filters: string[] = [];
  const scaleAt = (sx: number, sy: number, px = cx, py = cy) => {
    ctx.translate(px, py);
    ctx.scale(Math.max(0.001, sx), Math.max(0.001, sy));
    ctx.translate(-px, -py);
  };
  const rotateAt = (rad: number, px = cx, py = cy) => {
    ctx.translate(px, py);
    ctx.rotate(rad);
    ctx.translate(-px, -py);
  };

  if (state.path !== undefined && el.motionPath) {
    const [dx, dy] = pointOnPath(el.motionPath.points, el.motionPath.loop ? state.path : easeInOut(state.path));

    ctx.translate(dx, dy);
  }

  if (state.loop !== undefined && el.animationLoop) applyLoop(ctx, el, state.loop, scaleAt, rotateAt);

  if (state.entry !== undefined && state.entry < 1 && el.animation) applyEntry(ctx, el, state.entry, scaleAt, rotateAt, filters);

  if (state.exit !== undefined && state.exit > 0 && el.animationExit) applyExit(ctx, el, state.exit, scaleAt, rotateAt, filters);

  if (filters.length) ctx.filter = filters.join(' ');
}

type ScaleAt = (sx: number, sy: number, px?: number, py?: number) => void;
type RotateAt = (rad: number, px?: number, py?: number) => void;

function applyLoop(ctx: CanvasRenderingContext2D, el: CanvasElement, ms: number, scaleAt: ScaleAt, rotateAt: RotateAt) {
  const speed = speedOf(el);
  const phase = ((ms * speed) % LOOP_MS) / LOOP_MS;
  const wave = Math.sin(phase * Math.PI * 2);

  switch (el.animationLoop) {
    case 'pulse': {
      const s = 1 + 0.06 * wave;

      scaleAt(s, s);
      break;
    }
    case 'wiggle':
      rotateAt(0.08 * Math.sin(phase * Math.PI * 4));
      break;
    case 'rotate':
      rotateAt((((ms * speed) % ROTATE_MS) / ROTATE_MS) * Math.PI * 2);
      break;
    case 'float':
      ctx.translate(0, -0.08 * el.height * wave);
      break;
    case 'blink':
      ctx.globalAlpha *= 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
      break;
    case 'shake':
      // สั่นครึ่งรอบแรก แล้วพัก
      ctx.translate(phase < 0.5 ? 0.04 * el.width * Math.sin(phase * Math.PI * 12) : 0, 0);
      break;
    case 'heartbeat': {
      const beat = (center: number) => Math.max(0, 1 - Math.abs(phase - center) / 0.08);
      const s = 1 + 0.12 * Math.max(beat(0.15), beat(0.35));

      scaleAt(s, s);
      break;
    }
    case 'swing':
      // แกว่งรอบจุดกึ่งกลางขอบบน
      rotateAt(0.15 * wave, el.x + el.width / 2, el.y);
      break;
  }
}

/// ไฟนีออน: กะพริบไม่สม่ำเสมอแล้วติดค้าง
const FLICKER = [0, 1, 0, 0.2, 1, 0, 1, 0.5, 1, 1];

function applyEntry(ctx: CanvasRenderingContext2D, el: CanvasElement, p: number, scaleAt: ScaleAt, rotateAt: RotateAt, filters: string[]) {
  const ease = easeOut(p);

  switch (el.animation) {
    case 'rise':
      ctx.globalAlpha *= ease;
      ctx.translate(0, (1 - ease) * el.height * 0.5);
      break;
    case 'pan':
      ctx.globalAlpha *= ease;
      ctx.translate(-(1 - ease) * el.width * 0.4, 0);
      break;
    case 'fade':
      ctx.globalAlpha *= ease;
      break;
    case 'pop': {
      const s = p < 0.7 ? (p / 0.7) * 1.1 : 1.1 - ((p - 0.7) / 0.3) * 0.1;

      ctx.globalAlpha *= Math.min(1, p * 2);
      scaleAt(s, s);
      break;
    }
    case 'wipe':
    case 'typewriter':
      // พิมพ์ดีดกับชิ้นที่ไม่ใช่ข้อความ = เช็ดเข้า (ข้อความตัดตัวอักษรที่ render.ts)
      if (el.animation === 'wipe' || el.type !== 'text') {
        ctx.beginPath();
        ctx.rect(el.x - el.width, el.y - el.height, el.width * (1 + 2 * ease), el.height * 3);
        ctx.clip();
      }
      break;
    case 'blur':
      ctx.globalAlpha *= ease;
      filters.push(`blur(${((1 - ease) * 12).toFixed(2)}px)`);
      break;
    case 'drift':
      ctx.globalAlpha *= ease;
      ctx.translate((1 - ease) * el.width * 0.15, (1 - ease) * el.height * 0.15);
      break;
    case 'tumble':
      ctx.globalAlpha *= ease;
      rotateAt((1 - ease) * -0.6);
      break;
    case 'breathe': {
      const s = 0.85 + 0.15 * ease;

      ctx.globalAlpha *= ease;
      scaleAt(s, s);
      break;
    }
    case 'bounce': {
      const b = Math.abs(Math.sin(p * Math.PI * 2.5)) * (1 - p);

      ctx.globalAlpha *= Math.min(1, p * 3);
      ctx.translate(0, -b * el.height * 0.4);
      break;
    }
    case 'zoom': {
      const s = 0.3 + 0.7 * ease;

      ctx.globalAlpha *= ease;
      scaleAt(s, s);
      break;
    }
    case 'drop':
      ctx.globalAlpha *= ease;
      ctx.translate(0, -(1 - ease) * el.height * 0.6);
      break;
    case 'slide-left':
      ctx.globalAlpha *= ease;
      ctx.translate((1 - ease) * el.width * 0.4, 0);
      break;
    case 'flip':
      scaleAt(Math.sin((ease * Math.PI) / 2), 1);
      break;
    case 'spin': {
      const s = 0.5 + 0.5 * ease;

      ctx.globalAlpha *= ease;
      rotateAt((1 - ease) * Math.PI * 2);
      scaleAt(s, s);
      break;
    }
    case 'stomp': {
      const s = 1.6 - 0.6 * ease;

      ctx.globalAlpha *= Math.min(1, p * 2.5);
      scaleAt(s, s);
      break;
    }
    case 'flicker':
      ctx.globalAlpha *= FLICKER[Math.min(FLICKER.length - 1, Math.floor(p * FLICKER.length))];
      break;
  }
}

function applyExit(ctx: CanvasRenderingContext2D, el: CanvasElement, p: number, scaleAt: ScaleAt, rotateAt: RotateAt, filters: string[]) {
  const e = easeIn(p);

  switch (el.animationExit) {
    case 'fade':
      ctx.globalAlpha *= 1 - e;
      break;
    case 'sink':
      ctx.globalAlpha *= 1 - e;
      ctx.translate(0, e * el.height * 0.5);
      break;
    case 'rise':
      ctx.globalAlpha *= 1 - e;
      ctx.translate(0, -e * el.height * 0.5);
      break;
    case 'shrink':
      scaleAt(1 - e, 1 - e);
      break;
    case 'wipe':
      ctx.beginPath();
      ctx.rect(el.x - el.width + e * el.width * 3, el.y - el.height, el.width * 3, el.height * 3);
      ctx.clip();
      break;
    case 'blur':
      ctx.globalAlpha *= 1 - e;
      filters.push(`blur(${(e * 12).toFixed(2)}px)`);
      break;
    case 'spin':
      ctx.globalAlpha *= 1 - e;
      rotateAt(e * Math.PI * 2);
      scaleAt(1 - e, 1 - e);
      break;
    case 'slide-right':
      ctx.globalAlpha *= 1 - e;
      ctx.translate(e * el.width * 0.6, 0);
      break;
  }
}

/// ข้อความระหว่างแอนิเมชันพิมพ์ดีด (ไม่ใช่ = ข้อความเดิม)
export function textForMotion(el: TextElement, state: MotionState | undefined): TextElement {
  if (el.animation !== 'typewriter' || state?.entry === undefined || state.entry >= 1) return el;

  return { ...el, text: typewriterText(el.text, state.entry) };
}

// ── การเปลี่ยนหน้า ─────────────────────────────────────────────────

export function transitionLength(page: Page): number {
  return page.transition ? Math.max(100, Math.min(3000, page.transition.duration || DEFAULT_TRANSITION_MS)) : 0;
}

/// วาดช่วงเปลี่ยนหน้าที่ความคืบหน้า `p` · `drawPrev`/`drawNext` วาดหน้าเต็มทั้งพื้นหลังในพิกัดหน้า
export function drawTransition(
  ctx: CanvasRenderingContext2D,
  transition: PageTransition,
  p: number,
  size: { width: number; height: number },
  drawPrev: () => void,
  drawNext: () => void,
) {
  const e = easeInOut(clamp01(p));
  const { width: w, height: h } = size;
  const layer = (fn: () => void, setup: () => void) => {
    ctx.save();
    setup();
    fn();
    ctx.restore();
  };

  switch (transition.kind) {
    case 'fade':
      drawPrev();
      layer(drawNext, () => (ctx.globalAlpha = e));
      break;
    case 'slide':
      drawPrev();
      layer(drawNext, () => ctx.translate((1 - e) * w, 0));
      break;
    case 'push':
      layer(drawPrev, () => ctx.translate(-e * w, 0));
      layer(drawNext, () => ctx.translate((1 - e) * w, 0));
      break;
    case 'wipe':
      drawPrev();
      layer(drawNext, () => {
        ctx.beginPath();
        ctx.rect(0, 0, e * w, h);
        ctx.clip();
      });
      break;
    case 'zoom':
      drawPrev();
      layer(drawNext, () => {
        const s = 0.6 + 0.4 * e;

        ctx.globalAlpha = e;
        ctx.translate(w / 2, h / 2);
        ctx.scale(s, s);
        ctx.translate(-w / 2, -h / 2);
      });
      break;
    case 'circle':
      drawPrev();
      layer(drawNext, () => {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (e * Math.hypot(w, h)) / 2, 0, Math.PI * 2);
        ctx.clip();
      });
      break;
    case 'flip': {
      ctx.save();
      ctx.fillStyle = 'rgb(15 23 42)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      const first = e < 0.5;
      const sx = Math.max(0.001, first ? 1 - e * 2 : e * 2 - 1);

      layer(first ? drawPrev : drawNext, () => {
        ctx.translate(w / 2, 0);
        ctx.scale(sx, 1);
        ctx.translate(-w / 2, 0);
      });
      break;
    }
    case 'blinds': {
      const strips = 8;
      const sw = w / strips;

      drawPrev();
      layer(drawNext, () => {
        ctx.beginPath();
        for (let i = 0; i < strips; i++) ctx.rect(i * sw, 0, sw * e, h);
        ctx.clip();
      });
      break;
    }
  }
}
