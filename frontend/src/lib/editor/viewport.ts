import { useEditor } from './store';

/// การซูม/เลื่อนมุมมองของผืนผ้าใบแบบนุ่มนวล
///
/// - `pan` ใน store = ตำแหน่งบนจอ (px) ของมุมซ้ายบนของ "หน้าที่เปิดอยู่" · ทุกส่วน (ไม้บรรทัด กล่องแก้ข้อความ
///   หมุดความคิดเห็น) ใช้ความหมายนี้ ฟังก์ชันในไฟล์นี้จึงคิดเป็นพิกัดหน้าที่เปิดอยู่เสมอ
/// - การซูมจากล้อเมาส์/ปุ่ม/คีย์ลัดค่อย ๆ ไล่ไปหาเป้าด้วย requestAnimationFrame · กดต่อกันหลายครั้งเป้าจะสะสม
///   จึงรู้สึกต่อเนื่อง · ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหว (prefers-reduced-motion) จะกระโดดไปทันที

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/// ซูมได้ไม่เกิน ±12 % ต่อหนึ่งเหตุการณ์ล้อเมาส์ (กันล้อที่ส่งค่าใหญ่มากกระโดดไกล)
export const MAX_WHEEL_STEP = 0.12;

/// ความไวของล้อเมาส์ (ต่อพิกเซลของ deltaY) และของการถ่างนิ้วบนทัชแพด (Ctrl+wheel ค่าเล็ก ๆ ถี่ ๆ)
const WHEEL_SENSITIVITY = 0.0015;
const PINCH_SENSITIVITY = 0.008;

const LINE_PX = 16;
const PAGE_PX = 800;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/// deltaY ของ WheelEvent → พิกเซล (deltaMode 0 = พิกเซล · 1 = บรรทัด · 2 = หน้า)
export function wheelPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * LINE_PX;
  if (deltaMode === 2) return delta * PAGE_PX;

  return delta;
}

/// ตัวคูณการซูมของหนึ่งเหตุการณ์ล้อ · ค่าเล็กในโหมดพิกเซล (< 40 px) ถือว่าเป็นการถ่างนิ้วบนทัชแพด
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = wheelPixels(deltaY, deltaMode);
  const pinch = deltaMode === 0 && Math.abs(px) < 40;
  const raw = -px * (pinch ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY);
  const limit = Math.log(1 + MAX_WHEEL_STEP);

  return Math.exp(Math.max(-limit, Math.min(limit, raw)));
}

/// pan ใหม่ที่ทำให้จุด `anchor` บนจอยังชี้ที่ตำแหน่งเดิมของงานหลังเปลี่ยนซูม
export function zoomAround(zoom: number, pan: Point, nextZoom: number, anchor: Point): Point {
  const world = { x: (anchor.x - pan.x) / zoom, y: (anchor.y - pan.y) / zoom };

  return { x: anchor.x - world.x * nextZoom, y: anchor.y - world.y * nextZoom };
}

/// ซูม/pan ที่ทำให้กรอบ `rect` (พิกัดหน้าที่เปิดอยู่) อยู่กลางพื้นที่ `area` พอดี โดยเว้นขอบ `margin`
export function fitRect(rect: { x: number; y: number; width: number; height: number }, area: Size, margin: number): { zoom: number; pan: Point } {
  const zoom = clampZoom(
    Math.min((area.width - margin * 2) / Math.max(1, rect.width), (area.height - margin * 2) / Math.max(1, rect.height)),
  );

  return {
    zoom,
    pan: { x: (area.width - rect.width * zoom) / 2 - rect.x * zoom, y: (area.height - rect.height * zoom) / 2 - rect.y * zoom },
  };
}

/// ขั้นหนึ่งของการไล่เข้าหาเป้าแบบเอกซ์โพเนนเชียล (ไม่ขึ้นกับอัตราเฟรม) · คิดในสเกล log ให้ซูมเข้า/ออกเร็วเท่ากัน
export function easeZoomStep(current: number, target: number, dtMs: number, tauMs = 70): number {
  const t = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);

  return Math.exp(Math.log(current) + (Math.log(target) - Math.log(current)) * t);
}

// ── สถานะของแอนิเมชัน (ทั้งหน้ามีผืนผ้าใบเดียว) ─────────────────────────

type Animation =
  | { kind: 'anchor'; zoom: number; anchor: Point }
  | { kind: 'view'; from: { zoom: number; pan: Point }; to: { zoom: number; pan: Point }; start: number; duration: number };

let animation: Animation | null = null;
let raf: number | null = null;
let lastFrame = 0;
let stage: Size = { width: 0, height: 0 };

/// ผืนผ้าใบแจ้งขนาดพื้นที่วาด (ใช้เป็นจุดกึ่งกลางเมื่อซูมจากปุ่ม/คีย์ลัด)
export function setStageSize(size: Size) {
  stage = size;
}

export function stageSize(): Size {
  return stage;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/// หยุดแอนิเมชันที่ค้างอยู่ (เช่น ผู้ใช้เริ่มลาก/ถ่างนิ้วเอง)
export function cancelViewportAnimation() {
  animation = null;

  if (raf !== null && typeof window !== 'undefined') window.cancelAnimationFrame(raf);
  raf = null;
}

function tick(now: number) {
  raf = null;

  const anim = animation;

  if (!anim) return;

  const state = useEditor.getState();
  const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;

  lastFrame = now;

  if (anim.kind === 'anchor') {
    const next = easeZoomStep(state.zoom, anim.zoom, dt);
    const done = Math.abs(Math.log(next / anim.zoom)) < 0.002;
    const zoom = done ? anim.zoom : next;

    state.setViewport(zoom, zoomAround(state.zoom, state.pan, zoom, anim.anchor));

    if (done) {
      animation = null;
      return;
    }
  } else {
    const t = Math.min(1, (now - anim.start) / anim.duration);
    const e = 1 - Math.pow(1 - t, 3);
    const zoom = Math.exp(Math.log(anim.from.zoom) + (Math.log(anim.to.zoom) - Math.log(anim.from.zoom)) * e);

    state.setViewport(zoom, {
      x: anim.from.pan.x + (anim.to.pan.x - anim.from.pan.x) * e,
      y: anim.from.pan.y + (anim.to.pan.y - anim.from.pan.y) * e,
    });

    if (t >= 1) {
      animation = null;
      return;
    }
  }

  raf = window.requestAnimationFrame(tick);
}

function run() {
  if (raf !== null) return;

  lastFrame = 0;
  raf = window.requestAnimationFrame(tick);
}

function centerAnchor(): Point {
  return { x: stage.width / 2, y: stage.height / 2 };
}

/// ซูมไปที่ระดับ `zoom` โดยตรึงจุด `anchor` (พิกเซลในผืนผ้าใบ · ไม่ระบุ = กลางผืนผ้าใบ)
export function zoomTo(zoom: number, anchor: Point = centerAnchor(), options: { animate?: boolean } = {}) {
  const target = clampZoom(zoom);
  const state = useEditor.getState();

  if (options.animate === false || prefersReducedMotion() || typeof window === 'undefined') {
    cancelViewportAnimation();
    state.setViewport(target, zoomAround(state.zoom, state.pan, target, anchor));
    return;
  }

  animation = { kind: 'anchor', zoom: target, anchor };
  run();
}

/// ซูมเพิ่ม/ลดเป็นสัดส่วน (เช่น 1.2 = เข้า 20 %) · กดต่อกันระหว่างแอนิเมชันจะต่อจากเป้าเดิม
/// ใช้กับปุ่มซูม คีย์ลัด Ctrl +/- และล้อเมาส์
export function zoomBy(factor: number, anchor?: Point) {
  const state = useEditor.getState();
  const base = animation?.kind === 'anchor' ? animation.zoom : state.zoom;

  zoomTo(base * factor, anchor ?? (animation?.kind === 'anchor' ? animation.anchor : centerAnchor()));
}

/// เลื่อน/ซูมไปยังมุมมองที่กำหนดแบบนุ่มนวล (เลื่อนไปหน้าอื่น · พอดีจอ)
export function animateViewport(zoom: number, pan: Point, duration = 260) {
  const state = useEditor.getState();
  const to = { zoom: clampZoom(zoom), pan };

  if (prefersReducedMotion() || typeof window === 'undefined') {
    cancelViewportAnimation();
    state.setViewport(to.zoom, to.pan);
    return;
  }

  animation = { kind: 'view', from: { zoom: state.zoom, pan: state.pan }, to, start: performance.now(), duration };
  run();
}
