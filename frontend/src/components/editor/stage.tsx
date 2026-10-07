'use client';

import { LayoutGrid, Maximize } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { useToast } from '@/components/csmju/primitives';
import { cssFamily } from '@/lib/editor/fonts';
import {
  HANDLES,
  HANDLE_ANCHOR,
  angleFromCenter,
  boundingBox,
  center,
  corners,
  hitElement,
  normalizeAngle,
  normalizeRect,
  rectsIntersect,
  resizeRect,
  rotatePoint,
  type Handle,
  type Point,
  type Rect,
} from '@/lib/editor/geometry';
import { createImage, createPath } from '@/lib/editor/factory';
import { fillCell, hasImageDrag, isFrameLike, moveImageIntoCell, patchCellImage, readImageDragData, type FrameLike } from '@/lib/editor/frame-actions';
import { cellArea, cellAt, cellCorners, cellImages, clampZoom as clampFrameZoom, panOffset, toLocalDelta } from '@/lib/editor/frames';
import {
  autoArrange,
  edgePoint,
  keepInside,
  layoutPages,
  mostVisiblePage,
  pageAt,
  pageGap,
  pageOffset,
  rectsOverlap,
  unionRects,
  visibleFraction,
  type PagesLayout,
} from '@/lib/editor/page-layout';
import { previewLength, previewMotion } from '@/lib/editor/animation';
import { gifRedrawDelay, withGifClock } from '@/lib/editor/gif-player';
import { CURSOR_IDLE_MS, sendCursor, usePresence } from '@/lib/editor/presence';
import { brushStyle, drawFrameEditGhost, drawPage, getImage, pageGifSources, strokeFreehand, subscribeImageReady } from '@/lib/editor/render';
import { snapRect, type Guide } from '@/lib/editor/snapping';
import { tableCellAt, tableCellCorners } from '@/lib/editor/table-render';
import { activeCell, useTableUi } from '@/lib/editor/table-ui';
import { brushWidth, canEditDoc, cloneElements, currentPage, selectionBox, useEditor, type DrawBrush } from '@/lib/editor/store';
import { pageSizeOf, type CanvasElement, type ImageElement, type Page, type PathElement, type TextElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { animateViewport, cancelViewportAnimation, clampZoom, fitRect, setStageSize, stageSize, wheelPixels, wheelZoomFactor, zoomBy } from '@/lib/editor/viewport';
import { FileDropOverlay, dragHasFiles, imageUrlFrom, originFrom, useFileImport } from './file-import';
import { TableCellEditor } from './table-editor';

export { clampZoom } from '@/lib/editor/viewport';

/// ผืนผ้าใบหลักของ editor — วาดด้วย Canvas 2D ทุกเฟรมที่มีการเปลี่ยน (requestAnimationFrame)
///
/// สถานะระหว่างลากเก็บใน ref ไม่ใช่ React state เพื่อไม่ให้ React render ซ้ำทุก pointermove
/// (หัวใจของการลากลื่น 60 FPS) · ส่วนที่ต้องจำถาวรอยู่ใน store (zustand)
///
/// การจัดวางหน้า (`useEditorUi.pagesLayout`): ทีละหน้า · เลื่อนดูทุกหน้า · บอร์ดอิสระ
/// - ทุกหน้ามีกรอบใน "พิกัดโลก" (`layoutPages`) · `pan` ใน store ยังเป็นตำแหน่งบนจอของมุมซ้ายบนของหน้าที่เปิดอยู่
///   ส่วนอื่น (ไม้บรรทัด กล่องแก้ข้อความ หมุดความคิดเห็น) จึงทำงานเหมือนเดิม
/// - เมื่อหน้าที่เปิดเปลี่ยน (หรือหน้าถูกย้าย) ผืนผ้าใบชดเชย `pan` ให้กล้องอยู่ที่เดิมในพิกัดโลก — ภาพบนจอไม่กระโดด

const HANDLE_SIZE = 10;
const ROTATE_OFFSET = 28;
const SNAP_PX = 6;
const MIN_SIZE = 4;
/// ลากเข้าใกล้ขอบผืนผ้าใบภายในระยะนี้ (px) = เลื่อนมุมมองตามอัตโนมัติ
const EDGE_PX = 36;
const EDGE_SPEED = 18;
const ZERO: Point = { x: 0, y: 0 };

type PointerInput = { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; start: Point; pan: Point }
  | {
      kind: 'move';
      start: Point;
      origin: Map<string, Point>;
      box: Rect;
      moved: boolean;
      /// Alt ตอนเริ่มลาก = ลากสำเนาออกไป (ต้นฉบับอยู่ที่เดิม)
      duplicate: boolean;
      /// Shift+คลิกชิ้นที่เลือกอยู่แล้ว = เอาออกจากการเลือกเมื่อปล่อยโดยไม่ได้ลาก
      toggleOff: string[] | null;
      /// หน้าอื่นบนผืนผ้าใบที่เมาส์อยู่ (ปล่อย = ย้ายชิ้นงานไปหน้านั้น)
      cross: number | null;
      /// ภาพย่อหน้าในแถบภาพย่อที่เมาส์อยู่
      strip: number | null;
    }
  | { kind: 'resize'; handle: Handle; id: string; start: CanvasElement; keepAspect: boolean }
  | { kind: 'rotate'; id: string; startAngle: number; startRotation: number }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean; base: string[] }
  | { kind: 'pinch'; distance: number; zoom: number; mid: Point; pan: Point }
  | { kind: 'draw'; points: number[] }
  | { kind: 'erase'; last: Point }
  | { kind: 'image-erase'; id: string }
  | { kind: 'frame-pan'; id: string; cell: number; start: Point; origin: { offsetX: number; offsetY: number } }
  /// บอร์ด: ลากป้ายชื่อหน้าเพื่อย้ายหน้า (พิกัดโลก)
  | { kind: 'page-move'; index: number; start: Point; base: Point[]; moved: boolean };

type GestureKind = Gesture['kind'];

/// การลากที่กด Esc เพื่อยกเลิกได้
const CANCELABLE = new Set<GestureKind>(['move', 'resize', 'rotate', 'marquee', 'page-move', 'draw', 'erase', 'image-erase', 'frame-pan']);
/// การลากที่เลื่อนมุมมองตามเมื่อเข้าใกล้ขอบ
const AUTO_SCROLL = new Set<GestureKind>(['move', 'resize', 'rotate', 'marquee', 'page-move']);

interface LayoutSnapshot {
  pages: Page[];
  baseWidth: number;
  baseHeight: number;
  mode: PagesLayout;
  rects: Rect[];
}

interface LabelHit {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function inputOf(event: PointerInput): PointerInput {
  return { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
}

/// กรอบของทุกหน้าตามการจัดวางปัจจุบัน (พิกัดโลก)
export function currentLayoutRects(): { mode: PagesLayout; rects: Rect[] } {
  const state = useEditor.getState();
  const mode = useEditorUi.getState().pagesLayout;

  return { mode, rects: layoutPages(state.doc.pages, { width: state.baseWidth, height: state.baseHeight }, mode) };
}

/// ภาพย่อหน้า (แถบภาพย่อ) ใต้จุดนี้ — ใช้ตอนลากชิ้นงานออกจากผืนผ้าใบไปวางบนภาพย่อ
function stripTargetAt(clientX: number, clientY: number): number | null {
  if (typeof document === 'undefined') return null;

  const el = document.elementFromPoint(clientX, clientY)?.closest('[data-page-drop]');
  const index = el ? Number(el.getAttribute('data-page-drop')) : NaN;

  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function Stage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture>({ kind: 'none' });
  const pointers = useRef(new Map<number, Point>());
  const frame = useRef<number | null>(null);
  const marquee = useRef<Rect | null>(null);
  const spaceDown = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState('default');
  // ลากไฟล์จากเครื่อง/รูปจากเว็บอื่นอยู่เหนือผืนผ้าใบ → แสดงแผ่น "ปล่อยไฟล์ที่นี่"
  const [fileDrag, setFileDrag] = useState<'page' | 'cell' | null>(null);
  const { importFiles, importImageUrl } = useFileImport();
  const toast = useToast();
  const fitted = useRef<string | null>(null);
  const sizeRef = useRef(size);
  /// ตำแหน่งเมาส์ล่าสุด (พิกัดหน้า) — ใช้วาดวงยางลบ
  const hover = useRef<Point | null>(null);
  /// ใช้วาดเฟรมถัดไประหว่างเล่นตัวอย่างแอนิเมชัน (อ้างถึง draw ล่าสุดโดยไม่ต้องอ้างตัวเอง)
  const drawLoop = useRef<() => void>(() => undefined);
  const gifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /// กรอบ/ช่องที่จะรับรูปถ้าปล่อยตอนนี้ (ลากรูปจากแผง หรือลากรูปบนหน้าไปทับกรอบ)
  const dropTarget = useRef<{ id: string; cell: number } | null>(null);
  /// รวมการซูมด้วยล้อเมาส์ในโหมดจัดตำแหน่งรูปเป็น undo ขั้นเดียว
  const wheelTimer = useRef<number | null>(null);
  /// การจัดวางหน้าล่าสุด (คำนวณใหม่เมื่อรายการหน้า ขนาดงาน หรือโหมดเปลี่ยน)
  const layoutCache = useRef<LayoutSnapshot | null>(null);
  /// มุมซ้ายบน (พิกัดโลก) ของหน้าที่เปิดอยู่ตอนวาดล่าสุด — ใช้ชดเชย pan เมื่อหน้าที่เปิด/ตำแหน่งหน้าเปลี่ยน
  const anchor = useRef<{ mode: PagesLayout; designId: string; x: number; y: number } | null>(null);
  /// ผืนผ้าใบเป็นคนเปลี่ยนหน้าที่เปิดเอง (คลิก/เลื่อน/ลากข้ามหน้า) — ไม่ต้องเลื่อนมุมมองไปหาหน้านั้น
  const selfActivate = useRef(false);
  const activateTimer = useRef<number | null>(null);
  /// ป้ายชื่อหน้าที่วาดล่าสุด (พิกัดจอ) — คลิก = เปิดหน้า · บอร์ด: ลากเพื่อย้ายหน้า
  const labelRects = useRef<LabelHit[]>([]);
  const lastInput = useRef<PointerInput | null>(null);
  const autoScrollFrame = useRef<number | null>(null);
  const applyRef = useRef<(input: PointerInput) => void>(() => undefined);
  const cancelRef = useRef<() => void>(() => undefined);

  const editingTextId = useEditor((s) => s.editingTextId);
  const editingTable = useTableUi((s) => s.editing);
  const pagesLayout = useEditorUi((s) => s.pagesLayout);
  const visionSim = useEditorUi((s) => s.visionSim);

  // ── การจัดวางหน้า และการแปลงพิกัด ─────────────────────────────────

  const getLayout = useCallback((): LayoutSnapshot => {
    const state = useEditor.getState();
    const mode = useEditorUi.getState().pagesLayout;
    const cached = layoutCache.current;

    if (cached && cached.pages === state.doc.pages && cached.baseWidth === state.baseWidth && cached.baseHeight === state.baseHeight && cached.mode === mode) {
      return cached;
    }

    const next: LayoutSnapshot = {
      pages: state.doc.pages,
      baseWidth: state.baseWidth,
      baseHeight: state.baseHeight,
      mode,
      rects: layoutPages(state.doc.pages, { width: state.baseWidth, height: state.baseHeight }, mode),
    };

    layoutCache.current = next;

    return next;
  }, []);

  /// มุมซ้ายบนของหน้าที่เปิดอยู่ในพิกัดโลก (ทีละหน้า = 0, 0)
  const activeOrigin = useCallback((): Point => {
    const layout = getLayout();

    if (layout.mode === 'single') return ZERO;

    const state = useEditor.getState();
    const rect = layout.rects[Math.min(state.pageIndex, layout.rects.length - 1)];

    return { x: rect.x, y: rect.y };
  }, [getLayout]);

  /// พิกัดของหน้าที่เปิดอยู่
  const toPage = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { zoom, pan } = useEditor.getState();

    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }, []);

  const toScreen = useCallback((p: Point): Point => {
    const { zoom, pan } = useEditor.getState();

    return { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y };
  }, []);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const p = toPage(clientX, clientY);
      const o = activeOrigin();

      return { x: p.x + o.x, y: p.y + o.y };
    },
    [toPage, activeOrigin],
  );

  /// พื้นที่ที่มองเห็นในพิกัดโลก
  const viewWorld = useCallback((): Rect => {
    const { zoom, pan } = useEditor.getState();
    const o = activeOrigin();
    const area = sizeRef.current;

    return { x: o.x - pan.x / zoom, y: o.y - pan.y / zoom, width: area.width / zoom, height: area.height / zoom };
  }, [activeOrigin]);

  /// เปิดหน้าโดยผืนผ้าใบเอง (มุมมองไม่เลื่อนตาม)
  const activatePage = useCallback((index: number) => {
    const state = useEditor.getState();

    if (state.pageIndex === index || !state.doc.pages[index]) return;

    selfActivate.current = true;

    try {
      state.setPageIndex(index);
    } finally {
      selfActivate.current = false;
    }
  }, []);

  // ── การวาด ──────────────────────────────────────────────────────

  const draw = useCallback(() => {
    frame.current = null;

    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const state = useEditor.getState();
    const ui = useEditorUi.getState();
    const layout = getLayout();
    const multi = layout.mode !== 'single';
    const activeIndex = Math.min(state.pageIndex, state.doc.pages.length - 1);
    const page = state.doc.pages[activeIndex];
    const origin = activeOrigin();
    const { zoom, pan } = state;
    const primary = cssVar('--csmju-color-primary', 'rgb(0 76 153)');
    const ink = cssVar('--csmju-color-ink', 'rgb(15 23 42)');
    const stageColor = cssVar('--csmju-color-stage', 'rgb(235 236 240)');
    const g = gesture.current;
    const screenOf = (i: number): Point => ({ x: pan.x + (layout.rects[i].x - origin.x) * zoom, y: pan.y + (layout.rects[i].y - origin.y) * zoom });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = stageColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // วาดเฉพาะหน้าที่อยู่ในจอ (เผื่อระยะป้ายชื่อหน้า)
    const view = viewWorld();
    const gap = pageGap({ width: state.baseWidth, height: state.baseHeight });
    const visible = multi ? layout.rects.map((_, i) => i).filter((i) => rectsOverlap(layout.rects[i], view, gap)) : [activeIndex];

    // บอร์ด: ลูกศรจาง ๆ จากแต่ละหน้าไปหน้าถัดไป ให้เห็นลำดับ
    if (layout.mode === 'board') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawConnectors(ctx, layout.rects, (w) => ({ x: pan.x + (w.x - origin.x) * zoom, y: pan.y + (w.y - origin.y) * zoom }), ink);
    }

    // ตัวอย่างแอนิเมชันจากแผงแอนิเมต (เข้า → เส้นทาง/เน้น → ออก) — เล่นจนครบแล้วหยุดเอง
    const preview = ui.preview;
    const elapsed = preview ? performance.now() - preview.start : Infinity;
    const previewEls = preview ? page.elements.filter((el) => preview.ids.includes(el.id)) : [];
    const playing = preview && elapsed < previewLength(previewEls) + 50;
    const gifs: string[] = [];

    for (const i of visible) {
      const pg = state.doc.pages[i];
      const r = layout.rects[i];
      const s = screenOf(i);
      const isActive = i === activeIndex;

      // หน้า (พิกัดของหน้านั้น)
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * s.x, dpr * s.y);
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.15)';
      ctx.shadowBlur = 24 / zoom;
      ctx.fillStyle = 'rgb(255 255 255)';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.restore();

      if (!pg.background) drawChecker(ctx, r.width, r.height, zoom);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, r.width, r.height);
      ctx.clip();
      // ปิดการเล่น GIF = ค้างเฟรมแรก
      withGifClock(ui.gifPlaying ? null : 0, () =>
        drawPage(
          ctx,
          pg,
          { width: r.width, height: r.height },
          isActive
            ? {
                skipIds: state.editingTextId ? new Set([state.editingTextId]) : undefined,
                motion: playing ? (el: CanvasElement) => (preview.ids.includes(el.id) ? previewMotion(el, elapsed) : undefined) : undefined,
              }
            : {},
        ),
      );
      gifs.push(...pageGifSources(pg));

      // เส้นที่กำลังวาด (ยังไม่เป็น element จนกว่าจะปล่อย)
      if (isActive && g.kind === 'draw' && state.tool.brush !== 'eraser') {
        const brush = state.tool.brush;

        ctx.save();
        brushStyle(ctx, brush, state.tool.colors[brush], brushWidth(state.tool.weights[brush], state));
        strokeFreehand(ctx, g.points);
        ctx.restore();
      }

      ctx.restore();

      // หน้าที่ซ่อน (ไม่แสดงตอนพรีเซนต์/ดาวน์โหลด) แสดงจาง ๆ
      if (multi && pg.hidden) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = stageColor;
        ctx.fillRect(0, 0, r.width, r.height);
        ctx.restore();
      }
    }

    if (playing) frame.current = requestAnimationFrame(() => drawLoop.current());

    // GIF เคลื่อนไหวในจอ: วาดใหม่ตามจังหวะเฟรมที่สั้นที่สุด (ไม่วาดทุกเฟรมจอโดยไม่จำเป็น)
    if (gifTimer.current) clearTimeout(gifTimer.current);
    gifTimer.current = null;

    const gifDelay = ui.gifPlaying && !playing ? gifRedrawDelay(gifs) : null;

    if (gifDelay !== null) gifTimer.current = setTimeout(() => drawLoop.current(), Math.max(20, gifDelay));

    // ป้ายชื่อหน้า · กรอบหน้าที่เปิด · หน้าที่จะรับชิ้นงานที่ลากมา (พิกัดจอ)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (multi) {
      const danger = cssVar('--csmju-color-danger-text', 'rgb(185 28 28)');
      const font = cssVar('--csmju-font-body', 'system-ui, sans-serif');

      labelRects.current = drawPageLabels(ctx, state.doc.pages, visible, screenOf, layout.mode, activeIndex, { primary, ink, font });

      const a = screenOf(activeIndex);

      outline(ctx, rectCorners({ x: a.x, y: a.y, width: layout.rects[activeIndex].width * zoom, height: layout.rects[activeIndex].height * zoom }), primary, [], 2);

      const target = g.kind === 'move' && g.moved ? g.cross : null;

      if (target !== null && layout.rects[target]) {
        const t = screenOf(target);
        const box = { x: t.x, y: t.y, width: layout.rects[target].width * zoom, height: layout.rects[target].height * zoom };
        const blocked = Boolean(state.doc.pages[target].locked || page.locked);

        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = blocked ? danger : primary;
        ctx.fillRect(box.x, box.y, box.width, box.height);
        ctx.restore();
        outline(ctx, rectCorners(box), blocked ? danger : primary, [8, 5], 3);
      }
    } else {
      labelRects.current = [];
    }

    // โหมดจัดตำแหน่งรูปในกรอบ: รูปส่วนที่ล้นกรอบแสดงจาง ๆ (วาดนอกขอบหน้าได้)
    const frameEdit = ui.frameEdit;
    const editingFrame = frameEdit ? page.elements.find((el): el is FrameLike => el.id === frameEdit.id && isFrameLike(el)) : undefined;

    if (editingFrame && frameEdit) {
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * pan.x, dpr * pan.y);
      drawFrameEditGhost(ctx, editingFrame, frameEdit.cell);
    }

    // ส่วนควบคุม (พิกัดจอ)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const guide = 'rgb(236 72 153)';
    const selected = page.elements.filter((el) => state.selection.includes(el.id));

    for (const el of selected) {
      outline(ctx, corners(el).map(toScreen), primary, el.locked ? [4, 4] : []);
    }

    // ผู้ร่วมงานแบบสด: กรอบของชิ้นที่แต่ละคนเลือก (เส้นประสีของคนนั้น) และเคอร์เซอร์พร้อมป้ายชื่อ
    const live = usePresence.getState();

    if (live.status === 'live') {
      const font = cssVar('--csmju-font-body', 'system-ui, sans-serif');
      const now = Date.now();

      for (const [peerId, ids] of Object.entries(live.selections)) {
        const peer = live.peers[peerId];

        if (!peer || ids.length === 0) continue;

        for (const el of page.elements) {
          if (ids.includes(el.id)) outline(ctx, corners(el).map(toScreen), peer.color, [6, 4], 2);
        }
      }

      for (const [peerId, cur] of Object.entries(live.cursors)) {
        const peer = live.peers[peerId];

        if (!peer || now - cur.at > CURSOR_IDLE_MS || !layout.rects[cur.pageIndex] || (!multi && cur.pageIndex !== activeIndex) || (multi && !visible.includes(cur.pageIndex))) continue;

        const base = screenOf(cur.pageIndex);
        const sx = base.x + cur.x * zoom;
        const sy = base.y + cur.y * zoom;
        const name = peer.nickname ? `${peer.nickname}` : peer.label;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 17);
        ctx.lineTo(4.5, 13);
        ctx.lineTo(11.5, 13);
        ctx.closePath();
        ctx.fillStyle = peer.color;
        ctx.strokeStyle = 'rgb(255 255 255)';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.font = `600 13px ${font}`;

        const w = ctx.measureText(name).width + 14;

        ctx.beginPath();
        ctx.roundRect(10, 16, w, 22, 11);
        ctx.fill();
        ctx.fillStyle = 'rgb(255 255 255)';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 17, 27.5);
        ctx.restore();
      }
    }

    // เส้นทางเคลื่อนที่ของชิ้นที่เลือก: เส้นประจากกึ่งกลาง + จุดปลายทาง (ระหว่างเล่นตัวอย่างไม่แสดง)
    if (!playing) {
      for (const el of selected) {
        const pts = el.motionPath?.points;

        if (!pts || pts.length < 4) continue;

        const c = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
        const end = toScreen({ x: c.x + pts[pts.length - 2], y: c.y + pts[pts.length - 1] });

        ctx.save();
        ctx.beginPath();
        for (let k = 0; k < pts.length; k += 2) {
          const p = toScreen({ x: c.x + pts[k], y: c.y + pts[k + 1] });

          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = primary;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = primary;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ช่องที่เลือกของตาราง — พื้นจางและกรอบสีหลัก
    const tableCell = selected.length === 1 && selected[0].type === 'table' ? activeCell(selected[0], useTableUi.getState().cell) : null;

    if (tableCell && selected[0].type === 'table') {
      const cellCorners = tableCellCorners(selected[0], tableCell);

      if (cellCorners) {
        const pts = cellCorners.map(toScreen);

        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = primary;
        ctx.beginPath();
        pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.fill();
        ctx.restore();
        outline(ctx, pts, primary, []);
      }
    }

    // ช่องของกริดที่เลือก · ช่องที่กำลังจัดตำแหน่งรูป · ช่องที่จะรับรูปที่ลากมา
    const single = selected.length === 1 ? selected[0] : null;

    if (editingFrame && frameEdit) {
      outline(ctx, cellCorners(editingFrame, frameEdit.cell).map(toScreen), primary, [], 2.5);
    } else if (single?.type === 'grid' && ui.frameCell?.id === single.id) {
      outline(ctx, cellCorners(single, ui.frameCell.cell).map(toScreen), primary, [], 2.5);
    }

    const drop = dropTarget.current;
    const dropEl = drop ? page.elements.find((el): el is FrameLike => el.id === drop.id && isFrameLike(el)) : undefined;

    if (drop && dropEl) {
      const pts = cellCorners(dropEl, drop.cell).map(toScreen);

      ctx.save();
      ctx.fillStyle = 'rgba(0, 76, 153, 0.18)';
      ctx.beginPath();
      pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      outline(ctx, pts, primary, [6, 4], 2.5);
    }

    if (single && !single.locked && state.editingTextId !== single.id && frameEdit?.id !== single.id) {
      drawHandles(ctx, selected[0], toScreen, primary);
    } else if (selected.length > 1) {
      const box = selectionBox(page, state.selection)!;

      outline(ctx, rectCorners(box).map(toScreen), primary, [6, 4]);
    }

    ctx.strokeStyle = guide;
    ctx.lineWidth = 1;

    for (const gd of state.guides) {
      ctx.beginPath();

      if (gd.axis === 'x') {
        const a = toScreen({ x: gd.at, y: gd.from });
        const b = toScreen({ x: gd.at, y: gd.to });

        ctx.moveTo(Math.round(a.x) + 0.5, a.y);
        ctx.lineTo(Math.round(b.x) + 0.5, b.y);
      } else {
        const a = toScreen({ x: gd.from, y: gd.at });
        const b = toScreen({ x: gd.to, y: gd.at });

        ctx.moveTo(a.x, Math.round(a.y) + 0.5);
        ctx.lineTo(b.x, Math.round(b.y) + 0.5);
      }

      ctx.stroke();
    }

    const imageErase = ui.imageErase;

    if (((state.tool.mode === 'draw' && state.tool.brush === 'eraser') || imageErase) && hover.current) {
      const c = toScreen(hover.current);
      const radius = imageErase ? imageErase.size / 2 : brushWidth(state.tool.weights.eraser, state) / 2;

      ctx.beginPath();
      ctx.arc(c.x, c.y, radius * zoom, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();
      ctx.strokeStyle = 'rgb(100 116 139)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (marquee.current) {
      const m = marquee.current;
      const a = toScreen({ x: m.x, y: m.y });

      ctx.fillStyle = 'rgba(0, 76, 153, 0.08)';
      ctx.strokeStyle = primary;
      ctx.fillRect(a.x, a.y, m.width * zoom, m.height * zoom);
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, m.width * zoom, m.height * zoom);
    }
  }, [toScreen, getLayout, activeOrigin, viewWorld]);

  useEffect(() => {
    drawLoop.current = draw;
  }, [draw]);

  useEffect(
    () => () => {
      if (gifTimer.current) clearTimeout(gifTimer.current);
    },
    [],
  );

  const requestDraw = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // ── ขนาดของพื้นที่วาด และการซูมให้พอดีครั้งแรก ─────────────────────

  useEffect(() => {
    const wrap = wrapRef.current!;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;

      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });

    observer.observe(wrap);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    sizeRef.current = size;
    setStageSize(size);

    if (!canvas || size.width === 0) return;

    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);

    const state = useEditor.getState();

    // ซูมพอดีจอเมื่อเปิดงานใหม่หรือเปลี่ยนขนาดผืนผ้าใบ
    const key = `${state.designId}:${state.width}x${state.height}`;

    if (fitted.current !== key) {
      fitted.current = key;
      fitToScreen(size);
    }

    requestDraw();
  }, [size, requestDraw]);

  /// เลื่อนมุมมองไปหาหน้าที่ถูกเปิดจากที่อื่น (แถบภาพย่อ ลิงก์ ?page= ย้อนกลับ) ถ้ามองเห็นไม่ถึงครึ่ง
  const revealPage = useCallback(
    (index: number) => {
      const state = useEditor.getState();
      const rect = getLayout().rects[index];
      const area = sizeRef.current;

      if (!rect || area.width === 0 || visibleFraction(rect, viewWorld()) >= 0.6) return;

      const margin = area.width < 640 ? 24 : 56;
      const zoom = state.zoom;
      const x = (area.width - rect.width * zoom) / 2;
      const y = rect.height * zoom > area.height - margin * 2 ? margin : (area.height - rect.height * zoom) / 2;

      animateViewport(zoom, { x, y });
    },
    [getLayout, viewWorld],
  );

  /// โหมดเลื่อนดู: หน้าที่กินพื้นที่จอมากที่สุดกลายเป็นหน้าที่เปิด (ถ้ายังเลือกชิ้นงานอยู่ รอจนหน้านั้นพ้นจอ)
  const autoActivate = useCallback(() => {
    activateTimer.current = null;

    const state = useEditor.getState();
    const ui = useEditorUi.getState();
    const layout = getLayout();

    if (layout.mode !== 'scroll' || gesture.current.kind !== 'none' || state.editingTextId || ui.frameEdit || ui.imageErase || useTableUi.getState().editing) return;

    const view = viewWorld();
    const best = mostVisiblePage(layout.rects, view);
    const active = Math.min(state.pageIndex, layout.rects.length - 1);

    if (best < 0 || best === active) return;
    if (state.selection.length > 0 && visibleFraction(layout.rects[active], view) > 0.02) return;

    activatePage(best);
  }, [getLayout, viewWorld, activatePage]);

  useEffect(() => {
    /// ชดเชย pan เมื่อมุมซ้ายบนของหน้าที่เปิดย้ายในพิกัดโลก (เปลี่ยนหน้า · ย้ายหน้าบนบอร์ด · หน้าข้างบนเปลี่ยนขนาด)
    const syncCamera = () => {
      const state = useEditor.getState();
      const layout = getLayout();
      const origin = activeOrigin();
      const prev = anchor.current;

      anchor.current = { mode: layout.mode, designId: state.designId, x: origin.x, y: origin.y };

      if (!prev || prev.mode !== layout.mode || prev.designId !== state.designId) return;

      const dx = origin.x - prev.x;
      const dy = origin.y - prev.y;

      if (dx !== 0 || dy !== 0) state.setViewport(state.zoom, { x: state.pan.x + dx * state.zoom, y: state.pan.y + dy * state.zoom });
    };

    syncCamera();

    const unsubscribeImages = subscribeImageReady(requestDraw);
    // เคอร์เซอร์/ชิ้นที่ผู้ร่วมงานเลือกเปลี่ยน
    const unsubscribePresence = usePresence.subscribe((st, prev) => {
      if (st.cursors !== prev.cursors || st.selections !== prev.selections || st.peers !== prev.peers) requestDraw();
    });

    const unsubscribeUi = useEditorUi.subscribe((ui, prev) => {
      if (ui.pagesLayout !== prev.pagesLayout) {
        syncCamera();
        requestDraw();
      }

      if (ui.preview !== prev.preview || ui.imageErase !== prev.imageErase || ui.frameCell !== prev.frameCell || ui.frameEdit !== prev.frameEdit || ui.gifPlaying !== prev.gifPlaying) requestDraw();
    });
    // เลือกช่อง/เริ่มหรือเลิกพิมพ์ในตาราง
    const unsubscribeTable = useTableUi.subscribe(requestDraw);
    const unsubscribe = useEditor.subscribe((state, prev) => {
      const { imageErase: erasing, frameEdit, pagesLayout: mode } = useEditorUi.getState();

      syncCamera();

      // เลือกชิ้นอื่นหรือเปลี่ยนหน้า = ออกจากโหมดยางลบพิกเซล
      if (erasing && (state.selection.length !== 1 || state.selection[0] !== erasing.id || state.pageIndex !== prev.pageIndex)) {
        useEditorUi.getState().set({ imageErase: null });
      }

      // เช่นเดียวกับโหมดจัดตำแหน่งรูปในกรอบ (และเมื่อช่องนั้นไม่มีรูปแล้ว)
      if (frameEdit) {
        const target = currentPage(state).elements.find((el) => el.id === frameEdit.id);

        if (
          state.selection.length !== 1 ||
          state.selection[0] !== frameEdit.id ||
          state.pageIndex !== prev.pageIndex ||
          !isFrameLike(target) ||
          !cellImages(target)[frameEdit.cell]
        ) {
          useEditorUi.getState().set({ frameEdit: null });
        }
      }

      if (state.designId !== prev.designId || (mode === 'single' && (state.width !== prev.width || state.height !== prev.height))) {
        fitted.current = `${state.designId}:${state.width}x${state.height}`;
        fitToScreen(sizeRef.current);
      } else if (mode !== 'single' && state.pageIndex !== prev.pageIndex && !selfActivate.current) {
        revealPage(Math.min(state.pageIndex, state.doc.pages.length - 1));
      }

      if (mode === 'scroll' && (state.pan !== prev.pan || state.zoom !== prev.zoom)) {
        if (activateTimer.current !== null) window.clearTimeout(activateTimer.current);
        activateTimer.current = window.setTimeout(autoActivate, 160);
      }

      requestDraw();
    });

    return () => {
      unsubscribe();
      unsubscribeUi();
      unsubscribeTable();
      unsubscribeImages();
      unsubscribePresence();
      if (activateTimer.current !== null) window.clearTimeout(activateTimer.current);
    };
  }, [requestDraw, getLayout, activeOrigin, revealPage, autoActivate]);

  // ── การโต้ตอบด้วย pointer ────────────────────────────────────────

  const handleAt = useCallback(
    (screen: Point, el: CanvasElement): Handle | 'rotate' | null => {
      const c = center(el);
      const { zoom } = useEditor.getState();
      const up = rotatePoint({ x: c.x, y: el.y - ROTATE_OFFSET / zoom }, c, el.rotation);
      const rotateScreen = toScreen(up);

      if (Math.hypot(screen.x - rotateScreen.x, screen.y - rotateScreen.y) <= HANDLE_SIZE) return 'rotate';

      for (const handle of visibleHandles(el, zoom)) {
        const anchorPoint = HANDLE_ANCHOR[handle];
        const local = { x: el.x + anchorPoint.x * el.width, y: el.y + anchorPoint.y * el.height };
        const p = toScreen(rotatePoint(local, c, el.rotation));

        if (Math.abs(screen.x - p.x) <= HANDLE_SIZE && Math.abs(screen.y - p.y) <= HANDLE_SIZE) return handle;
      }

      return null;
    },
    [toScreen],
  );

  const topElementAt = useCallback((p: Point): CanvasElement | null => {
    const page = currentPage(useEditor.getState());
    const { zoom } = useEditor.getState();

    for (let i = page.elements.length - 1; i >= 0; i--) {
      const el = page.elements[i];

      if (!el.hidden && hitElement(el, p, 4 / zoom)) return el;
    }

    return null;
  }, []);

  /// กรอบ/ช่องบนสุดใต้จุดนี้ที่รับรูปได้ (ข้าม `exclude` = รูปที่กำลังลาก)
  const frameDropAt = useCallback((p: Point, exclude: string | null): { id: string; cell: number } | null => {
    const page = currentPage(useEditor.getState());

    for (let i = page.elements.length - 1; i >= 0; i--) {
      const el = page.elements[i];

      if (el.id === exclude || el.hidden || el.locked || !isFrameLike(el)) continue;

      const cell = cellAt(el, p);

      if (cell >= 0) return { id: el.id, cell };
    }

    return null;
  }, []);

  /// ป้ายชื่อหน้าใต้จุดนี้ (พิกัดจอ)
  const labelAt = (screen: Point): LabelHit | null =>
    labelRects.current.find((l) => screen.x >= l.x && screen.x <= l.x + l.width && screen.y >= l.y && screen.y <= l.y + l.height) ?? null;

  /// หน้าอื่นใต้เมาส์ (โหมดเลื่อนดู/บอร์ด) — ไม่นับถ้าเมาส์อยู่บนชิ้นงานของหน้าที่เปิดอยู่ (ชิ้นที่ล้นขอบหน้า)
  const otherPageAt = (clientX: number, clientY: number): number => {
    const layout = getLayout();

    if (layout.mode === 'single' || topElementAt(toPage(clientX, clientY))) return -1;

    const active = Math.min(useEditor.getState().pageIndex, layout.rects.length - 1);
    const under = pageAt(layout.rects, toWorld(clientX, clientY), active);

    return under >= 0 && under !== active ? under : -1;
  };

  /// ยางลบ: ลบเส้นวาด (path) ทุกเส้นที่อยู่ใกล้ส่วนของเส้นจาก a ไป b
  const eraseAlong = (a: Point, b: Point) => {
    const state = useEditor.getState();
    const radius = brushWidth(state.tool.weights.eraser, state) / 2;
    const hits = currentPage(state)
      .elements.filter((el): el is PathElement => el.type === 'path' && !el.locked && !el.hidden)
      .filter((el) => pathNear(el, a, b, radius))
      .map((el) => el.id);

    if (hits.length > 0) state.removeElements(hits);
  };

  // ── เลื่อนมุมมองอัตโนมัติเมื่อลากเข้าใกล้ขอบ ─────────────────────────

  const edgeVelocity = (input: PointerInput): Point => {
    const canvas = canvasRef.current;

    if (!canvas) return ZERO;

    const r = canvas.getBoundingClientRect();
    const x = input.clientX - r.left;
    const y = input.clientY - r.top;

    if (x < 0 || y < 0 || x > r.width || y > r.height) return ZERO;

    const speed = (distance: number) => (distance < EDGE_PX ? ((EDGE_PX - distance) / EDGE_PX) * EDGE_SPEED : 0);

    return { x: speed(r.width - x) - speed(x), y: speed(r.height - y) - speed(y) };
  };

  const stopAutoScroll = () => {
    if (autoScrollFrame.current !== null) cancelAnimationFrame(autoScrollFrame.current);
    autoScrollFrame.current = null;
  };

  function autoScrollStep() {
    autoScrollFrame.current = null;

    const input = lastInput.current;

    if (!input || !AUTO_SCROLL.has(gesture.current.kind)) return;

    const v = edgeVelocity(input);

    if (v.x === 0 && v.y === 0) return;

    const state = useEditor.getState();

    state.setViewport(state.zoom, { x: state.pan.x - v.x, y: state.pan.y - v.y });
    applyRef.current(input);
    autoScrollFrame.current = requestAnimationFrame(autoScrollStep);
  }

  const updateAutoScroll = (input: PointerInput) => {
    const v = edgeVelocity(input);

    if ((v.x !== 0 || v.y !== 0) && autoScrollFrame.current === null && AUTO_SCROLL.has(gesture.current.kind)) {
      autoScrollFrame.current = requestAnimationFrame(autoScrollStep);
    }
  };

  // ── เริ่มลาก ──────────────────────────────────────────────────────

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;

    canvas.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    cancelViewportAnimation();

    let state = useEditor.getState();

    if (state.editingTextId) state.setEditingText(null);

    // สองนิ้ว = ซูม/เลื่อนมุมมอง (ยกเลิกการลากชิ้นงานหรือเส้นที่เริ่มไปแล้ว)
    if (pointers.current.size === 2) {
      const current = gesture.current;

      if (current.kind === 'move' || current.kind === 'resize' || current.kind === 'rotate' || current.kind === 'erase' || current.kind === 'page-move') {
        state.endGesture();
      }

      if (current.kind === 'move' && current.strip !== null) useEditorUi.getState().set({ pageDropTarget: null });

      stopAutoScroll();
      dropTarget.current = null;

      const [a, b] = [...pointers.current.values()];

      gesture.current = {
        kind: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: state.zoom,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        pan: state.pan,
      };
      marquee.current = null;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const layout = getLayout();
    const multi = layout.mode !== 'single';
    const ui = useEditorUi.getState();
    const panning = event.button === 1 || spaceDown.current;

    // ป้ายชื่อหน้า: คลิก = เปิดหน้า · บอร์ด: ลากเพื่อย้ายหน้า
    if (multi && event.button === 0 && !panning) {
      const label = labelAt(screen);

      if (label) {
        activatePage(label.index);

        if (layout.mode === 'board' && canEditDoc(state)) {
          state = useEditor.getState();
          state.beginGesture();
          gesture.current = {
            kind: 'page-move',
            index: label.index,
            start: toWorld(event.clientX, event.clientY),
            base: getLayout().rects.map((r) => ({ x: r.x, y: r.y })),
            moved: false,
          };
          setCursor('grabbing');
        }

        return;
      }
    }

    // หน้าใต้เมาส์กลายเป็นหน้าที่เปิด (ยกเว้นกำลังจับ handle ของชิ้นที่เลือก หรืออยู่ในโหมดแก้รูปในกรอบ/ยางลบ)
    if (multi && !panning && !ui.frameEdit && !ui.imageErase) {
      const selected = currentPage(state).elements.filter((el) => state.selection.includes(el.id));
      const onHandle = canEditDoc(state) && selected.length === 1 && !selected[0].locked && handleAt(screen, selected[0]) !== null;
      const other = onHandle ? -1 : otherPageAt(event.clientX, event.clientY);

      if (other >= 0) {
        activatePage(other);
        state = useEditor.getState();
      }
    }

    // โหมดแสดงความคิดเห็น: คลิกชิ้นงานเพื่อเลือกแล้วเขียนความคิดเห็น (ไม่ลาก)
    if (state.viewMode === 'comment' && event.button === 0 && !spaceDown.current) {
      const hit = topElementAt(toPage(event.clientX, event.clientY));

      state.select(hit ? [hit.id] : []);
      useEditorUi.getState().set({ commentsOpen: true });

      if (!hit) gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan: state.pan };
      return;
    }

    if (panning || !canEditDoc(state)) {
      gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan: state.pan };
      setCursor('grabbing');
      return;
    }

    const p = toPage(event.clientX, event.clientY);

    // โหมดจัดตำแหน่งรูปในกรอบ: ลากในช่อง = เลื่อนรูป · คลิกนอกช่อง = เสร็จ
    const frameEdit = ui.frameEdit;

    if (frameEdit) {
      const target = currentPage(state).elements.find((el) => el.id === frameEdit.id);
      const image = isFrameLike(target) ? cellImages(target)[frameEdit.cell] : null;

      if (isFrameLike(target) && image && !target.locked && cellAt(target, p) === frameEdit.cell) {
        state.beginGesture();
        gesture.current = { kind: 'frame-pan', id: target.id, cell: frameEdit.cell, start: p, origin: { offsetX: image.offsetX, offsetY: image.offsetY } };
        setCursor('grabbing');
        return;
      }

      useEditorUi.getState().set({ frameEdit: null });
    }

    // ยางลบพิกเซล: ลากบนรูปที่เลือกเพื่อลบส่วนนั้นให้โปร่งใส (หนึ่งรอยลาก = undo หนึ่งขั้น)
    const imageErase = ui.imageErase;

    if (imageErase) {
      const target = currentPage(state).elements.find((el): el is ImageElement => el.id === imageErase.id && el.type === 'image');

      if (!target || target.locked) {
        useEditorUi.getState().set({ imageErase: null });
      } else {
        const point = imagePoint(target, p);

        if (point) {
          state.beginGesture();
          state.updateElements([target.id], () => ({
            erase: [...(target.erase ?? []), { points: [point.u, point.v], size: (imageErase.size / target.width) * (target.crop?.width ?? 1) }],
          }));
          gesture.current = { kind: 'image-erase', id: target.id };
        }
      }

      return;
    }

    // โหมดวาด: ปากกา/มาร์กเกอร์/ไฮไลท์เก็บจุดของเส้น · ยางลบลบเส้นวาดที่ลากผ่าน (รวมเป็น undo ขั้นเดียว)
    if (state.tool.mode === 'draw') {
      if (state.tool.brush === 'eraser') {
        state.beginGesture();
        gesture.current = { kind: 'erase', last: p };
        eraseAlong(p, p);
      } else {
        gesture.current = { kind: 'draw', points: [p.x, p.y] };
      }

      requestDraw();
      return;
    }

    const page = currentPage(state);
    const selected = page.elements.filter((el) => state.selection.includes(el.id));

    if (selected.length === 1 && !selected[0].locked) {
      const handle = handleAt(screen, selected[0]);

      if (handle === 'rotate') {
        state.beginGesture();
        gesture.current = {
          kind: 'rotate',
          id: selected[0].id,
          startAngle: angleFromCenter(center(selected[0]), p),
          startRotation: selected[0].rotation,
        };
        return;
      }

      if (handle) {
        state.beginGesture();
        gesture.current = {
          kind: 'resize',
          handle,
          id: selected[0].id,
          start: selected[0],
          keepAspect: selected[0].type === 'image' || selected[0].type === 'svg' || selected[0].type === 'frame' || selected[0].type === 'video',
        };
        return;
      }
    }

    const hit = topElementAt(p);

    // โหมดคัดลอกสไตล์: คลิกชิ้นงาน = วางสไตล์ (ไม่เริ่มลาก)
    if (useEditorUi.getState().painting) {
      if (hit) {
        state.pasteStyle(hit.groupId ? currentPage(state).elements.filter((el) => el.groupId === hit.groupId).map((el) => el.id) : [hit.id]);
        state.select([hit.id]);
      }

      useEditorUi.getState().setPainting(false);
      return;
    }

    if (hit) {
      const ids = state.selection;
      // ทั้งกลุ่มของชิ้นที่คลิก (คลิกชิ้นเดียวในกลุ่ม = ทั้งกลุ่ม)
      const group = hit.groupId ? page.elements.filter((el) => el.groupId === hit.groupId).map((el) => el.id) : [hit.id];
      let toggleOff: string[] | null = null;

      // ตาราง: คลิกแรกเลือกทั้งตาราง · คลิกตารางที่เลือกอยู่แล้ว = เลือกช่อง (แบบ Canva)
      if (hit.type === 'table' && !event.shiftKey) {
        const picked = ids.length === 1 && ids[0] === hit.id ? tableCellAt(hit, p) : null;

        useTableUi.getState().selectCell(picked && { id: hit.id, ...picked });
      }

      if (event.shiftKey) {
        // Shift+คลิกชิ้นที่เลือกอยู่ = เอาออกเมื่อปล่อย (ถ้าลาก = ลากทั้งหมดที่เลือกแบบล็อกแนว)
        if (ids.includes(hit.id)) toggleOff = group;
        else state.select([...ids, ...group]);
      } else if (!ids.includes(hit.id)) {
        state.select([hit.id]);
      }

      // คลิกบนกริด/กรอบ = เลือกช่องนั้นด้วย (ปุ่มแทนที่/ลบรูป และการเลือกรูปจากแผงทำกับช่องนี้)
      if (isFrameLike(hit)) {
        const cell = cellAt(hit, p);

        if (cell >= 0) useEditorUi.getState().set({ frameCell: { id: hit.id, cell } });
      }

      const fresh = useEditor.getState();
      const movable = currentPage(fresh).elements.filter((el) => fresh.selection.includes(el.id) && !el.locked);

      if (movable.length === 0) {
        if (toggleOff) state.select(fresh.selection.filter((id) => !toggleOff.includes(id)));
        return;
      }

      state.beginGesture();
      gesture.current = {
        kind: 'move',
        start: p,
        origin: new Map(movable.map((el) => [el.id, { x: el.x, y: el.y }])),
        box: selectionBox(currentPage(fresh), movable.map((el) => el.id))!,
        moved: false,
        duplicate: event.altKey,
        toggleOff,
        cross: null,
        strip: null,
      };
      return;
    }

    // พื้นที่ว่าง: นิ้ว = เลื่อนมุมมอง · เมาส์ = ลากกรอบเลือก
    if (event.pointerType === 'touch') {
      state.select([]);
      gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan: state.pan };
      return;
    }

    const base = event.shiftKey ? state.selection : [];

    if (!event.shiftKey) state.select([]);
    gesture.current = { kind: 'marquee', start: p, current: p, additive: event.shiftKey, base };
  };

  /// Alt+ลาก: สร้างสำเนาที่ตำแหน่งเดิมแล้วลากสำเนาออกไป (ต้นฉบับอยู่ที่เดิม · อยู่ในขั้น undo เดียวกับการลาก)
  const duplicateForDrag = (g: Extract<Gesture, { kind: 'move' }>) => {
    const state = useEditor.getState();
    const originals = currentPage(state).elements.filter((el) => g.origin.has(el.id));
    const clones = cloneElements(originals, 0);
    const origin = new Map<string, Point>();

    originals.forEach((el, i) => origin.set(clones[i].id, g.origin.get(el.id)!));
    state.addElements(clones);
    g.origin = origin;
    g.toggleOff = null;
  };

  // ── ระหว่างลาก (ใช้ซ้ำตอนเลื่อนมุมมองอัตโนมัติ) ─────────────────────

  const applyPointer = (input: PointerInput) => {
    const g = gesture.current;
    const state = useEditor.getState();

    if (g.kind === 'move') {
      const p = toPage(input.clientX, input.clientY);
      let dx = p.x - g.start.x;
      let dy = p.y - g.start.y;

      if (!g.moved && Math.hypot(dx, dy) * state.zoom < 3) return;
      if (!g.moved && g.duplicate) duplicateForDrag(g);

      g.moved = true;

      // Shift = ล็อกแนวนอน/แนวตั้ง ตามทิศที่ลากมากกว่า
      const lock = input.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical') : null;

      if (lock === 'horizontal') dy = 0;
      if (lock === 'vertical') dx = 0;

      const layout = getLayout();
      const activeIndex = Math.min(state.pageIndex, layout.rects.length - 1);
      const under = layout.mode === 'single' ? -1 : pageAt(layout.rects, toWorld(input.clientX, input.clientY), activeIndex);
      const cross = under >= 0 && under !== activeIndex ? under : null;
      const strip = cross === null ? stripTargetAt(input.clientX, input.clientY) : null;

      if (strip !== g.strip) {
        g.strip = strip;
        useEditorUi.getState().set({ pageDropTarget: strip });
      }

      g.cross = cross;

      const page = currentPage(state);
      const moving = { ...g.box, x: g.box.x + dx, y: g.box.y + dy };
      const ui = useEditorUi.getState();
      let bounds: Rect = { x: 0, y: 0, width: state.width, height: state.height };
      let targets: Rect[];

      if (cross !== null) {
        // ลากข้ามไปอีกหน้า: ดูดกับขอบ/ชิ้นงานของหน้านั้น (แปลงเป็นพิกัดของหน้าที่เปิดอยู่)
        const r = layout.rects[cross];
        const o = activeOrigin();
        const off = { x: r.x - o.x, y: r.y - o.y };

        bounds = { x: off.x, y: off.y, width: r.width, height: r.height };
        targets = state.doc.pages[cross].elements
          .filter((el) => !el.hidden)
          .map((el) => {
            const b = boundingBox(el);

            return { ...b, x: b.x + off.x, y: b.y + off.y };
          });
      } else {
        targets = [
          ...page.elements.filter((el) => !g.origin.has(el.id) && !el.hidden).map(boundingBox),
          // เส้นไกด์จากไม้บรรทัดเป็นเป้าดูดด้วย
          ...(ui.rulers ? ui.guideLines.map((guide) => (guide.axis === 'x' ? { x: guide.at, y: 0, width: 0, height: state.height } : { x: 0, y: guide.at, width: state.width, height: 0 })) : []),
        ];
      }

      // Ctrl/⌘ ค้าง = ปิดการดูดชั่วคราว
      const snap = input.ctrlKey || input.metaKey || strip !== null ? { dx: 0, dy: 0, guides: [] as Guide[] } : snapRect(moving, targets, bounds, SNAP_PX / state.zoom);

      dx += lock === 'vertical' ? 0 : snap.dx;
      dy += lock === 'horizontal' ? 0 : snap.dy;

      // ล็อกลงกริด: แกนที่ไม่ได้ดูดกับชิ้นงาน/เส้นไกด์ ปัดมุมซ้ายบนลงเส้นกริดที่ใกล้ที่สุด
      const grid = ui.gridSnap;

      if (grid && cross === null && strip === null && !(input.ctrlKey || input.metaKey)) {
        if (lock !== 'vertical' && !snap.guides.some((gd) => gd.axis === 'x')) dx = Math.round((g.box.x + dx) / grid) * grid - g.box.x;
        if (lock !== 'horizontal' && !snap.guides.some((gd) => gd.axis === 'y')) dy = Math.round((g.box.y + dy) / grid) * grid - g.box.y;
      }
      state.setGuides(snap.guides.filter((gd) => (lock === 'horizontal' ? gd.axis === 'x' : lock === 'vertical' ? gd.axis === 'y' : true)));
      state.updateElements([...g.origin.keys()], (el) => {
        const o = g.origin.get(el.id)!;

        return { x: Math.round((o.x + dx) * 10) / 10, y: Math.round((o.y + dy) * 10) / 10 };
      });

      // ลากรูปเดี่ยวไปทับกรอบ/ช่องของกริด → เน้นช่องที่จะรับรูปเมื่อปล่อย
      const movingId = g.origin.size === 1 ? [...g.origin.keys()][0] : null;
      const movingEl = movingId ? currentPage(useEditor.getState()).elements.find((el) => el.id === movingId) : undefined;

      dropTarget.current = movingEl?.type === 'image' && cross === null && strip === null ? frameDropAt(p, movingEl.id) : null;

      const blocked = cross !== null && Boolean(state.doc.pages[cross].locked || page.locked);

      setCursor(blocked || (strip !== null && strip !== activeIndex && (state.doc.pages[strip]?.locked || page.locked)) ? 'not-allowed' : 'move');
      return;
    }

    if (g.kind === 'resize') {
      const p = toPage(input.clientX, input.clientY);
      // Shift = สลับการล็อกสัดส่วน (มุม) · Alt = ย่อขยายจากกึ่งกลาง
      const next = resizeRect(g.start, g.handle, p, {
        keepAspect: g.keepAspect !== input.shiftKey,
        minSize: MIN_SIZE,
        fromCenter: input.altKey,
      });

      state.updateElements([g.id], (el) => {
        if (el.type === 'text' && g.start.type === 'text') {
          // ลากมุม = ย่อขยายตัวอักษรด้วย · ลากขอบซ้าย/ขวา = เปลี่ยนความกว้างกล่อง (ตัดบรรทัดใหม่)
          const corner = g.handle.length === 2;
          const scale = next.width / g.start.width;

          return corner
            ? { x: next.x, y: next.y, width: next.width, fontSize: Math.max(4, Math.round(g.start.fontSize * scale * 10) / 10) }
            : { x: next.x, width: next.width };
        }

        return { x: next.x, y: next.y, width: next.width, height: next.height };
      });
      return;
    }

    if (g.kind === 'rotate') {
      const p = toPage(input.clientX, input.clientY);
      const el = currentPage(state).elements.find((e) => e.id === g.id);

      if (!el) return;

      let rotation = normalizeAngle(g.startRotation + angleFromCenter(center(el), p) - g.startAngle);

      if (input.shiftKey) rotation = Math.round(rotation / 15) * 15;
      else for (const snapTo of [0, 90, 180, 270, 360]) if (Math.abs(rotation - snapTo) < 3) rotation = snapTo % 360;

      state.updateElements([g.id], () => ({ rotation: Math.round(rotation * 10) / 10 }));
      return;
    }

    if (g.kind === 'marquee') {
      const p = toPage(input.clientX, input.clientY);

      g.current = p;
      marquee.current = normalizeRect(g.start, p);

      const page = currentPage(state);
      const inside = page.elements
        .filter((el) => !el.hidden && rectsIntersect(boundingBox(el), marquee.current!))
        .map((el) => el.id);

      state.select(g.additive ? [...new Set([...g.base, ...inside])] : inside);
      requestDraw();
      return;
    }

    if (g.kind === 'page-move') {
      // พิกัดโลกคงที่ระหว่างลาก (pan ถูกชดเชยเมื่อหน้าที่เปิดย้าย)
      const w = toWorld(input.clientX, input.clientY);
      let dx = w.x - g.start.x;
      let dy = w.y - g.start.y;

      if (!g.moved && Math.hypot(dx, dy) * state.zoom < 3) return;

      g.moved = true;

      const lock = input.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical') : null;

      if (lock === 'horizontal') dy = 0;
      if (lock === 'vertical') dx = 0;

      const layout = getLayout();
      const base = g.base[g.index];
      const moving = { x: base.x + dx, y: base.y + dy, width: layout.rects[g.index].width, height: layout.rects[g.index].height };
      const others = g.base
        .map((b, i) => ({ x: b.x, y: b.y, width: layout.rects[i]?.width ?? 0, height: layout.rects[i]?.height ?? 0 }))
        .filter((_, i) => i !== g.index);
      const snap =
        others.length > 0 && !input.ctrlKey && !input.metaKey ? snapRect(moving, others.slice(1), others[0], SNAP_PX / state.zoom) : { dx: 0, dy: 0, guides: [] as Guide[] };
      const pos = {
        x: Math.round(moving.x + (lock === 'vertical' ? 0 : snap.dx)),
        y: Math.round(moving.y + (lock === 'horizontal' ? 0 : snap.dy)),
      };

      state.setBoardPositions(g.base.map((b, i) => (i === g.index ? pos : b)));
      // เส้นไกด์เก็บเป็นพิกัดของหน้าที่เปิดอยู่ (= หน้าที่กำลังย้าย)
      useEditor.getState().setGuides(
        snap.guides
          .filter((gd) => (lock === 'horizontal' ? gd.axis === 'x' : lock === 'vertical' ? gd.axis === 'y' : true))
          .map((gd) =>
            gd.axis === 'x' ? { ...gd, at: gd.at - pos.x, from: gd.from - pos.y, to: gd.to - pos.y } : { ...gd, at: gd.at - pos.y, from: gd.from - pos.x, to: gd.to - pos.x },
          ),
      );
    }
  };

  useEffect(() => {
    applyRef.current = applyPointer;
  });

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // เคอร์เซอร์ของเราให้ผู้ร่วมงานแบบสดเห็น (เมาส์/ปากกาเท่านั้น นิ้วไม่มีเคอร์เซอร์)
    if (event.pointerType !== 'touch') sendCursor(toPage(event.clientX, event.clientY), useEditor.getState().pageIndex);

    const g = gesture.current;
    const state = useEditor.getState();

    if (state.tool.mode === 'draw' || useEditorUi.getState().imageErase) {
      hover.current = toPage(event.clientX, event.clientY);
      if (state.tool.brush === 'eraser' || useEditorUi.getState().imageErase) requestDraw();
    }

    if (g.kind === 'image-erase') {
      const target = currentPage(state).elements.find((el): el is ImageElement => el.id === g.id && el.type === 'image');
      const point = target && imagePoint(target, toPage(event.clientX, event.clientY), true);

      if (target && point) {
        const strokes = target.erase ?? [];
        const last = strokes[strokes.length - 1];

        state.updateElements([target.id], () => ({ erase: [...strokes.slice(0, -1), { ...last, points: [...last.points, point.u, point.v] }] }));
      }

      return;
    }

    if (g.kind === 'frame-pan') {
      const p = toPage(event.clientX, event.clientY);
      const target = currentPage(state).elements.find((el) => el.id === g.id);
      const image = isFrameLike(target) ? cellImages(target)[g.cell] : null;
      const area = isFrameLike(target) ? cellArea(target, g.cell) : null;

      if (!target || !image || !area) return;

      const img = getImage(image.src);
      const natural = { width: img?.naturalWidth || image.naturalWidth, height: img?.naturalHeight || image.naturalHeight };
      const delta = toLocalDelta(target.rotation, p.x - g.start.x, p.y - g.start.y);

      patchCellImage(g.id, g.cell, panOffset(area, { ...image, ...g.origin }, natural, delta.dx, delta.dy));
      return;
    }

    if (g.kind === 'none') {
      updateHoverCursor(event);
      return;
    }

    if (g.kind === 'draw') {
      const p = toPage(event.clientX, event.clientY);

      // Shift ค้าง = เส้นตรงจากจุดเริ่ม ล็อกทุก 45° (แนวนอน · แนวตั้ง · ทแยง) แบบ Canva
      if (event.shiftKey) {
        const [sx = p.x, sy = p.y] = g.points;
        const length = Math.hypot(p.x - sx, p.y - sy);
        const angle = Math.round(Math.atan2(p.y - sy, p.x - sx) / (Math.PI / 4)) * (Math.PI / 4);

        g.points = [sx, sy, Math.round((sx + Math.cos(angle) * length) * 100) / 100, Math.round((sy + Math.sin(angle) * length) * 100) / 100];
        requestDraw();
        return;
      }

      const lastX = g.points[g.points.length - 2];
      const lastY = g.points[g.points.length - 1];

      // เก็บจุดเมื่อขยับเกินครึ่งพิกเซลจอ — เส้นเรียบและ JSON ไม่บวม
      if (Math.hypot(p.x - lastX, p.y - lastY) * state.zoom >= 0.5) {
        g.points.push(Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100);
        requestDraw();
      }

      return;
    }

    if (g.kind === 'erase') {
      const p = toPage(event.clientX, event.clientY);

      eraseAlong(g.last, p);
      g.last = p;
      return;
    }

    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = clampZoom(g.zoom * (distance / Math.max(1, g.distance)));
      const rect = canvasRef.current!.getBoundingClientRect();
      const startMid = { x: g.mid.x - rect.left, y: g.mid.y - rect.top };
      const worldAtStart = { x: (startMid.x - g.pan.x) / g.zoom, y: (startMid.y - g.pan.y) / g.zoom };

      state.setViewport(zoom, {
        x: mid.x - rect.left - worldAtStart.x * zoom,
        y: mid.y - rect.top - worldAtStart.y * zoom,
      });
      return;
    }

    if (g.kind === 'pan') {
      state.setViewport(state.zoom, {
        x: g.pan.x + event.clientX - g.start.x,
        y: g.pan.y + event.clientY - g.start.y,
      });
      return;
    }

    const input = inputOf(event);

    lastInput.current = input;
    applyPointer(input);
    updateAutoScroll(input);
  };

  /// ปล่อยชิ้นงานบนหน้าอื่น (บนผืนผ้าใบหรือบนภาพย่อ) = ย้ายไปหน้านั้นในขั้น undo เดียว
  const finishPageTransfer = (g: Extract<Gesture, { kind: 'move' }>) => {
    const state = useEditor.getState();
    const source = currentPage(state);
    const target = g.cross ?? g.strip;
    const targetPage = target === null ? undefined : state.doc.pages[target];

    if (target === null || !targetPage || target === state.pageIndex) {
      state.cancelGesture();
      return;
    }

    if (source.locked || targetPage.locked) {
      state.cancelGesture();
      toast(source.locked ? 'หน้านี้ล็อกอยู่ ย้ายชิ้นงานออกไม่ได้' : `หน้า ${target + 1} ล็อกอยู่ ย้ายชิ้นงานเข้าไปไม่ได้`, 'error');
      return;
    }

    const ids = [...g.origin.keys()];

    if (g.cross !== null) {
      const rect = getLayout().rects[target];

      selfActivate.current = true;

      try {
        state.transferElements(ids, target, pageOffset(activeOrigin(), rect));
      } finally {
        selfActivate.current = false;
      }
    } else {
      // ภาพย่อ: วางที่ตำแหน่งเดิมบนหน้าปลายทาง (หลุดนอกหน้าที่เล็กกว่า = ย้ายมากลางหน้า)
      state.updateElements(ids, (el) => ({ x: g.origin.get(el.id)!.x, y: g.origin.get(el.id)!.y }));

      const box = selectionBox(currentPage(useEditor.getState()), ids);
      const size = pageSizeOf(targetPage, { width: state.baseWidth, height: state.baseHeight });

      state.transferElements(ids, target, box ? keepInside(box, size) : { dx: 0, dy: 0 });
      toast(`ย้ายชิ้นงานไปหน้า ${target + 1} แล้ว`);
    }

    useEditor.getState().endGesture();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    stopAutoScroll();
    lastInput.current = null;

    const g = gesture.current;
    const state = useEditor.getState();

    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = { kind: 'none' };
      return;
    }

    // ปล่อยรูปเดี่ยวบนกรอบ/ช่อง = ย้ายรูปเข้าไปในช่อง (อยู่ใน gesture เดียวกับการลาก → ย้อนกลับขั้นเดียว)
    const drop = dropTarget.current;

    dropTarget.current = null;

    if (g.kind === 'move') {
      if (g.strip !== null) useEditorUi.getState().set({ pageDropTarget: null });

      if (g.moved && (g.cross !== null || g.strip !== null)) {
        finishPageTransfer(g);
        marquee.current = null;
        gesture.current = { kind: 'none' };
        setCursor('default');
        requestDraw();
        return;
      }

      if (g.moved && drop) {
        const image = currentPage(state).elements.find((el): el is ImageElement => el.type === 'image' && g.origin.has(el.id));

        if (image) moveImageIntoCell(image, drop.id, drop.cell);
      }

      if (!g.moved && g.toggleOff) {
        const off = g.toggleOff;

        state.select(useEditor.getState().selection.filter((id) => !off.includes(id)));
      }
    }

    if (
      g.kind === 'move' ||
      g.kind === 'resize' ||
      g.kind === 'rotate' ||
      g.kind === 'erase' ||
      g.kind === 'image-erase' ||
      g.kind === 'frame-pan' ||
      g.kind === 'page-move'
    ) {
      state.endGesture();
    }

    if (g.kind === 'pan') setCursor(spaceDown.current ? 'grab' : 'default');
    if (g.kind === 'frame-pan' || g.kind === 'page-move') setCursor('grab');
    if (g.kind === 'move') setCursor('move');

    if (g.kind === 'draw' && state.tool.brush !== 'eraser') {
      const brush = state.tool.brush;
      const path = createPath([g.points], {
        color: state.tool.colors[brush],
        strokeWidth: brushWidth(state.tool.weights[brush], state),
        brush,
      });

      // ไม่เลือกเส้นที่เพิ่งวาด — วาดต่อได้ทันทีโดยไม่มีกรอบเลือกบัง
      if (path) state.addElements([path], { select: false });
    }

    marquee.current = null;
    gesture.current = { kind: 'none' };
    requestDraw();
  };

  /// Esc ระหว่างลาก = ยกเลิก คืนทุกอย่างเป็นสภาพก่อนลาก
  const cancelDrag = () => {
    const g = gesture.current;
    const state = useEditor.getState();

    stopAutoScroll();

    if (g.kind === 'marquee') state.select(g.base);
    else if (g.kind !== 'draw') state.cancelGesture();

    if (g.kind === 'move' && g.strip !== null) useEditorUi.getState().set({ pageDropTarget: null });

    dropTarget.current = null;
    marquee.current = null;
    gesture.current = { kind: 'none' };
    setCursor('default');
    requestDraw();
  };

  useEffect(() => {
    cancelRef.current = cancelDrag;
  });

  useEffect(() => {
    // ฟังช่วง capture เพื่อให้ Esc ระหว่างลากไม่ไปถึงคีย์ลัดอื่น (เช่น ยกเลิกการเลือก)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !CANCELABLE.has(gesture.current.kind)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      cancelRef.current();
    };

    window.addEventListener('keydown', onKey, true);

    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const updateHoverCursor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (spaceDown.current) return setCursor('grab');

    const state = useEditor.getState();

    if (state.tool.mode === 'draw') return setCursor(drawCursor(state.tool.brush));
    if (useEditorUi.getState().imageErase) return setCursor('crosshair');
    if (useEditorUi.getState().painting) return setCursor(PAINT_CURSOR);

    const page = currentPage(state);
    const frameEdit = useEditorUi.getState().frameEdit;

    if (frameEdit) {
      const target = page.elements.find((el) => el.id === frameEdit.id);

      return setCursor(isFrameLike(target) && cellAt(target, toPage(event.clientX, event.clientY)) === frameEdit.cell ? 'grab' : 'default');
    }

    const selected = page.elements.filter((el) => state.selection.includes(el.id));
    const rect = canvasRef.current!.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const label = labelAt(screen);

    if (label) return setCursor(getLayout().mode === 'board' && canEditDoc(state) ? 'grab' : 'pointer');

    if (selected.length === 1 && !selected[0].locked) {
      const handle = handleAt(screen, selected[0]);

      if (handle === 'rotate') return setCursor('grab');
      if (handle) return setCursor(resizeCursor(handle, selected[0].rotation));
    }

    const hit = topElementAt(toPage(event.clientX, event.clientY));

    if (!hit && otherPageAt(event.clientX, event.clientY) >= 0) return setCursor('pointer');

    setCursor(hit ? (hit.locked ? 'not-allowed' : 'move') : 'default');
  };

  /// คลิกขวา: เลือกชิ้นใต้เมาส์ (ถ้ายังไม่ได้เลือก) แล้วเปิดเมนู
  const onContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const state = useEditor.getState();

    if (state.tool.mode === 'draw') return;

    const hit = topElementAt(toPage(event.clientX, event.clientY));

    if (hit && !state.selection.includes(hit.id)) state.select([hit.id]);
    if (!hit) state.select([]);
    useEditorUi.getState().openContextMenu({ x: event.clientX, y: event.clientY });
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (useEditor.getState().tool.mode === 'draw') return;

    const p = toPage(event.clientX, event.clientY);
    const hit = topElementAt(p);

    // ดับเบิลคลิกกรอบ/ช่องที่มีรูป = จัดตำแหน่งรูป · ช่องว่าง = เปิดแผงอัปโหลดเพื่อเลือกรูปใส่ช่องนี้
    if (isFrameLike(hit) && !hit.locked && canEditDoc(useEditor.getState())) {
      const cell = cellAt(hit, p);
      const ui = useEditorUi.getState();

      if (cell < 0) return;

      useEditor.getState().select([hit.id]);

      if (cellImages(hit)[cell]) {
        ui.set({ frameCell: { id: hit.id, cell }, frameEdit: { id: hit.id, cell } });
      } else {
        ui.set({ frameCell: { id: hit.id, cell } });
        ui.setPanel('uploads');
      }

      return;
    }

    if (hit?.type === 'text' && !hit.locked && canEditDoc(useEditor.getState())) {
      const state = useEditor.getState();

      state.select([hit.id]);
      state.setEditingText(hit.id);
    }

    // ตาราง: ดับเบิลคลิกช่อง = พิมพ์ในช่องนั้น
    if (hit?.type === 'table' && !hit.locked && canEditDoc(useEditor.getState())) {
      const cell = tableCellAt(hit, toPage(event.clientX, event.clientY));

      if (cell) {
        useEditor.getState().select([hit.id]);
        useTableUi.getState().startEditing({ id: hit.id, ...cell });
      }
    }

    // ดับเบิลคลิกชาร์ต = เปิดแผงแก้ไขข้อมูล (แบบ Canva)
    if (hit?.type === 'chart' && !hit.locked && canEditDoc(useEditor.getState())) {
      useEditor.getState().select([hit.id]);
      useEditorUi.getState().setPanel('chart-data');
    }
  };

  // ซูมด้วย Ctrl+ล้อ (หรือถ่างบนทัชแพด) แบบนุ่มนวลรอบเมาส์ · เลื่อนมุมมองด้วยล้อ (Shift+ล้อ = แนวนอน)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const state = useEditor.getState();
      const frameEdit = useEditorUi.getState().frameEdit;

      // โหมดจัดตำแหน่งรูปในกรอบ: ล้อเมาส์ = ซูมรูปในช่อง (Ctrl+ล้อยังซูมผืนผ้าใบ)
      if (frameEdit && !event.ctrlKey && !event.metaKey) {
        const target = currentPage(state).elements.find((el) => el.id === frameEdit.id);
        const image = isFrameLike(target) ? cellImages(target)[frameEdit.cell] : null;

        if (image) {
          if (wheelTimer.current === null) state.beginGesture();
          else window.clearTimeout(wheelTimer.current);

          wheelTimer.current = window.setTimeout(() => {
            wheelTimer.current = null;
            useEditor.getState().endGesture();
          }, 400);
          patchCellImage(frameEdit.id, frameEdit.cell, { zoom: clampFrameZoom(image.zoom * Math.exp(-wheelPixels(event.deltaY, event.deltaMode) * 0.002)) });
          return;
        }
      }

      if (event.ctrlKey || event.metaKey) {
        const rect = canvas.getBoundingClientRect();

        zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      } else {
        const dx = wheelPixels(event.deltaX, event.deltaMode);
        const dy = wheelPixels(event.deltaY, event.deltaMode);
        const sideways = event.shiftKey && dx === 0;

        cancelViewportAnimation();
        state.setViewport(state.zoom, { x: state.pan.x - (sideways ? dy : dx), y: state.pan.y - (sideways ? 0 : dy) });
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Space ค้าง = โหมดเลื่อนมุมมอง
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTyping(event.target)) {
        event.preventDefault();
        if (!spaceDown.current) {
          spaceDown.current = true;
          setCursor('grab');
        }
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceDown.current = false;
        setCursor('default');
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ── ลากมาวาง: รูปจากแผง (อัปโหลด/คลังภาพ) · ไฟล์จากเครื่อง · รูปจากเว็บอื่น ──
  // บนกรอบ/ช่อง = ใส่รูปลงช่อง · ที่อื่น = เพิ่มตรงจุดที่ปล่อย (โหมดเลื่อนดู/บอร์ด: ลงหน้าที่ปล่อย)

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer.types);
    const panelImage = hasImageDrag(event.dataTransfer);
    const external = !panelImage && (dragHasFiles(event.dataTransfer) || types.includes('text/uri-list') || types.includes('text/html'));

    if ((!panelImage && !external) || !canEditDoc(useEditor.getState())) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    const next = frameDropAt(toPage(event.clientX, event.clientY), null);
    const current = dropTarget.current;
    const overlay = external ? (next ? 'cell' : 'page') : null;

    if (overlay !== fileDrag) setFileDrag(overlay);

    if (next?.id !== current?.id || next?.cell !== current?.cell) {
      dropTarget.current = next;
      requestDraw();
    }
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // ยังอยู่ในผืนผ้าใบ (แค่ข้ามไปลูกข้างใน) ไม่นับว่าออก
    if (event.relatedTarget instanceof Node && wrapRef.current?.contains(event.relatedTarget)) return;
    setFileDrag(null);
    if (!dropTarget.current) return;

    dropTarget.current = null;
    requestDraw();
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    setFileDrag(null);

    // ปล่อยบนหน้าอื่น = เปิดหน้านั้นก่อน แล้วใส่ลงหน้านั้น
    const other = otherPageAt(event.clientX, event.clientY);

    if (other >= 0 && canEditDoc(useEditor.getState())) activatePage(other);

    if (!hasImageDrag(event.dataTransfer)) {
      const files = Array.from(event.dataTransfer.files);
      const url = files.length === 0 ? imageUrlFrom(event.dataTransfer) : null;

      if (files.length === 0 && !url) return;

      event.preventDefault();

      const p = toPage(event.clientX, event.clientY);
      const cell = frameDropAt(p, null);

      dropTarget.current = null;
      requestDraw();
      const origin = originFrom(event.dataTransfer, url);

      if (files.length > 0) void importFiles(files, { at: p, cell, origin });
      else if (url) void importImageUrl(url, { at: p, cell, origin });
      return;
    }

    event.preventDefault();

    const state = useEditor.getState();
    const source = readImageDragData(event.dataTransfer);
    const p = toPage(event.clientX, event.clientY);
    const target = frameDropAt(p, null);

    dropTarget.current = null;
    requestDraw();

    if (!source || !canEditDoc(state)) return;

    if (target) {
      fillCell(target.id, target.cell, source);
      return;
    }

    const image = createImage({ width: state.width, height: state.height }, source);

    state.addElements([{ ...image, x: Math.round(p.x - image.width / 2), y: Math.round(p.y - image.height / 2) }]);
  };

  return (
    <div
      ref={wrapRef}
      className="relative min-h-0 flex-1 touch-none overflow-hidden"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={
          pagesLayout === 'single'
            ? 'ผืนผ้าใบ — ใช้แผงเลเยอร์เพื่อเลือกชิ้นงานด้วยคีย์บอร์ด'
            : 'ผืนผ้าใบ แสดงทุกหน้า — คลิกหน้าเพื่อเปิด ลากชิ้นงานไปวางบนหน้าอื่นเพื่อย้าย · ใช้แผงเลเยอร์เพื่อเลือกชิ้นงานด้วยคีย์บอร์ด'
        }
        tabIndex={0}
        style={{ width: size.width, height: size.height, cursor, filter: visionSim ? `url(#csc-vision-${visionSim})` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          hover.current = null;
          sendCursor(null, useEditor.getState().pageIndex);
          if (useEditor.getState().tool.brush === 'eraser' || useEditorUi.getState().imageErase) requestDraw();
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        className="block outline-none"
      />
      {pagesLayout === 'board' && <BoardToolbar />}
      {editingTextId && <TextEditor id={editingTextId} />}
      {fileDrag && <FileDropOverlay target={fileDrag} />}
      {editingTable && <TableCellEditor />}
    </div>
  );
}

// ── แถบเครื่องมือของบอร์ด ────────────────────────────────────────

/// มุมซ้ายบนของบอร์ด: ดูทุกหน้า · จัดเรียงอัตโนมัติ (แถวเดียว/ตาราง)
function BoardToolbar() {
  const editable = useEditor((s) => canEditDoc(s));
  const pageCount = useEditor((s) => s.doc.pages.length);
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');

  const arrange = (mode: 'row' | 'grid') => {
    setOpen(false);

    const state = useEditor.getState();
    const base = { width: state.baseWidth, height: state.baseHeight };

    state.setBoardPositions(autoArrange(state.doc.pages.map((page) => pageSizeOf(page, base)), mode, pageGap(base)));
    fitView();
  };

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-csmju-md">
      <button
        type="button"
        onClick={() => fitView()}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-csmju-caption font-medium text-ink hover:bg-surface-muted"
      >
        <Maximize aria-hidden className="size-4" />
        ดูทุกหน้า
      </button>
      {editable && pageCount > 1 && (
        <>
          <button
            ref={anchorRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-csmju-caption font-medium text-ink hover:bg-surface-muted"
          >
            <LayoutGrid aria-hidden className="size-4" />
            จัดเรียงอัตโนมัติ
          </button>
          <FloatingPanel open={open} menuRef={menuRef} label="จัดเรียงอัตโนมัติ" className="w-64 rounded-xl border border-line bg-surface py-1.5 shadow-csmju-lg">
            <button type="button" role="menuitem" onClick={() => arrange('row')} className="flex min-h-10 w-full flex-col items-start px-3 py-1.5 text-left hover:bg-surface-muted">
              <span className="text-csmju-caption font-medium text-ink">เรียงเป็นแถวเดียว</span>
              <span className="text-csmju-caption text-muted">ตามลำดับหน้า จากซ้ายไปขวา</span>
            </button>
            <button type="button" role="menuitem" onClick={() => arrange('grid')} className="flex min-h-10 w-full flex-col items-start px-3 py-1.5 text-left hover:bg-surface-muted">
              <span className="text-csmju-caption font-medium text-ink">เรียงเป็นตาราง</span>
              <span className="text-csmju-caption text-muted">ตามลำดับหน้า ทีละแถว</span>
            </button>
          </FloatingPanel>
        </>
      )}
    </div>
  );
}

// ── ตัวแก้ข้อความที่วางทับบนผืนผ้าใบ ───────────────────────────────

function TextEditor({ id }: { id: string }) {
  const element = useEditor((s) => currentPage(s).elements.find((el) => el.id === id)) as TextElement | undefined;
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const state = useEditor.getState();

    state.beginGesture();
    ref.current?.focus();
    ref.current?.select();

    return () => {
      const after = useEditor.getState();
      const el = currentPage(after).elements.find((e) => e.id === id);

      after.endGesture();

      // ลบข้อความทั้งหมดแล้วออก = ลบกล่องข้อความทิ้ง
      if (el?.type === 'text' && el.text.trim() === '') {
        after.select([id]);
        useEditor.getState().removeSelected();
      }
    };
  }, [id]);

  if (!element || element.type !== 'text') return null;

  return (
    <textarea
      ref={ref}
      aria-label="แก้ข้อความ"
      value={element.text}
      onChange={(event) => useEditor.getState().updateElements([id], () => ({ text: event.target.value }))}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          useEditor.getState().setEditingText(null);
        }

        event.stopPropagation();
      }}
      onBlur={() => useEditor.getState().setEditingText(null)}
      spellCheck={false}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-2 outline-primary"
      style={{
        left: pan.x + element.x * zoom,
        top: pan.y + element.y * zoom,
        width: element.width * zoom,
        height: element.height * zoom,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: 'center',
        fontFamily: cssFamily(element.fontFamily),
        fontSize: element.fontSize * zoom,
        fontWeight: element.fontWeight,
        fontStyle: element.italic ? 'italic' : 'normal',
        textDecoration: element.underline ? 'underline' : 'none',
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing * zoom,
        textAlign: element.align,
        color: element.color,
        opacity: element.opacity,
      }}
    />
  );
}

// ── ตัวช่วย ──────────────────────────────────────────────────────

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;

  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
}

/// ซูมให้หน้าที่เปิดอยู่พอดีพื้นที่ (เว้นขอบ) · animate = เลื่อนไปแบบนุ่มนวล
export function fitToScreen(area: { width: number; height: number }, animate = false) {
  const state = useEditor.getState();

  if (area.width === 0 || area.height === 0) return;

  const margin = area.width < 640 ? 24 : 56;
  const { zoom, pan } = fitRect({ x: 0, y: 0, width: state.width, height: state.height }, area, margin);

  if (animate) animateViewport(zoom, pan);
  else state.setViewport(zoom, pan);
}

/// ปุ่ม "พอดีจอ": บอร์ด = เห็นทุกหน้า · โหมดอื่น = หน้าที่เปิดอยู่ (ใช้ขนาดผืนผ้าใบล่าสุด)
export function fitView() {
  const area = stageSize();

  if (area.width === 0 || area.height === 0) return;

  const { mode, rects } = currentLayoutRects();

  if (mode !== 'board' || rects.length < 2) {
    fitToScreen(area, true);
    return;
  }

  const state = useEditor.getState();
  const active = rects[Math.min(state.pageIndex, rects.length - 1)];
  const all = unionRects(rects)!;
  const { zoom, pan } = fitRect({ ...all, x: all.x - active.x, y: all.y - active.y }, area, area.width < 640 ? 24 : 56);

  animateViewport(zoom, pan);
}

function pageLabel(page: Page, index: number): string {
  return `หน้า ${index + 1}${page.name ? ` - ${page.name}` : ''}${page.hidden ? ' · ซ่อนอยู่' : ''}${page.locked ? ' · ล็อก' : ''}`;
}

/// ป้ายชื่อเหนือแต่ละหน้า (พิกัดจอ) · บอร์ด: มีวงกลมเลขลำดับหน้าขนาดใหญ่ และป้ายใช้เป็นที่จับลากหน้า
function drawPageLabels(
  ctx: CanvasRenderingContext2D,
  pages: Page[],
  visible: number[],
  screenOf: (i: number) => Point,
  mode: PagesLayout,
  activeIndex: number,
  colors: { primary: string; ink: string; font: string },
): LabelHit[] {
  const hits: LabelHit[] = [];

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  for (const i of visible) {
    const s = screenOf(i);
    const text = pageLabel(pages[i], i);
    const active = i === activeIndex;

    ctx.font = `${active ? 600 : 500} 14px ${colors.font}`;

    const textWidth = ctx.measureText(text).width;

    ctx.globalAlpha = pages[i].hidden ? 0.6 : 1;

    if (mode === 'board') {
      const r = 15;
      const cy = s.y - 10 - r;

      ctx.fillStyle = active ? colors.primary : colors.ink;
      ctx.beginPath();
      ctx.arc(s.x + r, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgb(255 255 255)';
      ctx.font = `700 15px ${colors.font}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), s.x + r, cy + 1);
      ctx.textAlign = 'left';
      ctx.font = `${active ? 600 : 500} 14px ${colors.font}`;
      ctx.fillStyle = active ? colors.primary : colors.ink;
      ctx.fillText(text, s.x + r * 2 + 8, cy);
      hits.push({ index: i, x: s.x - 4, y: cy - r - 4, width: r * 2 + 16 + textWidth, height: r * 2 + 8 });
    } else {
      const cy = s.y - 14;

      ctx.fillStyle = active ? colors.primary : colors.ink;
      ctx.fillText(text, s.x, cy);
      hits.push({ index: i, x: s.x - 4, y: cy - 12, width: textWidth + 8, height: 24 });
    }
  }

  ctx.restore();

  return hits;
}

/// บอร์ด: เส้นประจาง ๆ พร้อมหัวลูกศรจากหน้าหนึ่งไปหน้าถัดไปตามลำดับในรายการหน้า
function drawConnectors(ctx: CanvasRenderingContext2D, rects: Rect[], toScreenWorld: (p: Point) => Point, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;

  for (let i = 0; i < rects.length - 1; i++) {
    const a = rects[i];
    const b = rects[i + 1];

    if (rectsOverlap(a, b)) continue;

    const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const p1 = toScreenWorld(edgePoint(a, cb));
    const p2 = toScreenWorld(edgePoint(b, ca));
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    if (length < 24) continue;

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const head = 10;
    // เว้นระยะจากขอบหน้าเล็กน้อย
    const start = { x: p1.x + Math.cos(angle) * 6, y: p1.y + Math.sin(angle) * 6 };
    const end = { x: p2.x - Math.cos(angle) * 6, y: p2.y - Math.sin(angle) * 6 };

    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x - Math.cos(angle) * head, end.y - Math.sin(angle) * head);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - Math.cos(angle - 0.45) * head, end.y - Math.sin(angle - 0.45) * head);
    ctx.lineTo(end.x - Math.cos(angle + 0.45) * head, end.y - Math.sin(angle + 0.45) * head);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function rectCorners(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

function outline(ctx: CanvasRenderingContext2D, pts: Point[], color: string, dash: number[], width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/// handle ที่แสดง — ข้อความไม่มีขอบบน/ล่าง (ความสูงคิดจากเนื้อหา) · ชิ้นเล็กบนจอซ่อนขอบกลาง
function visibleHandles(el: CanvasElement, zoom: number): Handle[] {
  const small = el.width * zoom < 40 || el.height * zoom < 40;

  if (el.type === 'text') return small ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'ne', 'se', 'sw', 'e', 'w'];
  if (el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow')) return ['e', 'w'];

  return small ? ['nw', 'ne', 'se', 'sw'] : HANDLES;
}

function drawHandles(ctx: CanvasRenderingContext2D, el: CanvasElement, toScreen: (p: Point) => Point, color: string) {
  const { zoom } = useEditor.getState();
  const c = center(el);

  ctx.save();
  ctx.fillStyle = 'rgb(255 255 255)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  for (const handle of visibleHandles(el, zoom)) {
    const anchor = HANDLE_ANCHOR[handle];
    const p = toScreen(rotatePoint({ x: el.x + anchor.x * el.width, y: el.y + anchor.y * el.height }, c, el.rotation));

    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // จุดหมุน
  const top = toScreen(rotatePoint({ x: c.x, y: el.y }, c, el.rotation));
  const knob = toScreen(rotatePoint({ x: c.x, y: el.y - ROTATE_OFFSET / zoom }, c, el.rotation));

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(knob.x, knob.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawChecker(ctx: CanvasRenderingContext2D, width: number, height: number, zoom: number) {
  const cell = 12 / zoom;

  ctx.save();
  ctx.fillStyle = 'rgb(226 232 240)';

  for (let y = 0; y < height; y += cell) {
    for (let x = (Math.floor(y / cell) % 2) * cell; x < width; x += cell * 2) {
      ctx.fillRect(x, y, Math.min(cell, width - x), Math.min(cell, height - y));
    }
  }

  ctx.restore();
}

/// เคอร์เซอร์รูปปากกาตามหัวที่เลือก (ภาพบรีฟ "ตอนวาดมี icon ปากกา") · ยางลบใช้วงกลมที่วาดบนผืนผ้าใบแทน
function drawCursor(brush: DrawBrush): string {
  if (brush === 'eraser') return 'crosshair';

  const tip = brush === 'highlighter' ? 'rgb(250 204 21)' : brush === 'marker' ? 'rgb(34 34 34)' : 'rgb(1 24 78)';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    `<path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z" fill="rgb(255 255 255)" stroke="rgb(15 23 42)" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M3.3 17l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3z" fill="${tip}"/>` +
    '</svg>';

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 22, crosshair`;
}

/// เส้นวาดอยู่ใกล้ส่วนของเส้น a→b ไม่เกิน radius หรือไม่ (คิดในพิกัดของกล่องก่อนหมุน)
function pathNear(el: PathElement, a: Point, b: Point, radius: number): boolean {
  const c = center(el);
  const la = el.rotation ? rotatePoint(a, c, -el.rotation) : a;
  const lb = el.rotation ? rotatePoint(b, c, -el.rotation) : b;
  const reach = radius + el.strokeWidth / 2;

  if (
    Math.max(la.x, lb.x) < el.x - reach ||
    Math.min(la.x, lb.x) > el.x + el.width + reach ||
    Math.max(la.y, lb.y) < el.y - reach ||
    Math.min(la.y, lb.y) > el.y + el.height + reach
  ) {
    return false;
  }

  for (const stroke of el.strokes) {
    for (let i = 0; i < stroke.length; i += 2) {
      const px = el.x + stroke[i] * el.width;
      const py = el.y + stroke[i + 1] * el.height;

      if (distanceToSegment({ x: px, y: py }, la, lb) <= reach) return true;

      if (i + 3 < stroke.length) {
        const qx = el.x + stroke[i + 2] * el.width;
        const qy = el.y + stroke[i + 3] * el.height;

        if (distanceToSegment(la, { x: px, y: py }, { x: qx, y: qy }) <= reach) return true;
      }
    }
  }

  return false;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));

  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/// เคอร์เซอร์ลูกกลิ้งทาสีตอนวางสไตล์
const PAINT_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="rgb(255 255 255)" stroke="rgb(15 23 42)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="2" width="16" height="6" rx="2"/><path d="M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="8" y="16" width="4" height="6" rx="1"/></svg>';

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 4, copy`;
})();

function resizeCursor(handle: Handle, rotation: number): string {
  const base: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const angle = normalizeAngle(base[handle] + rotation);
  const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

  return cursors[Math.round(angle / 45) % 4];
}

/// จุดบนหน้า → พิกัดสัดส่วน 0–1 บนรูปเต็มก่อนครอป (ย้อนการหมุน พลิก และครอป) · null ถ้าอยู่นอกรูป
function imagePoint(el: ImageElement, p: Point, allowOutside = false): { u: number; v: number } | null {
  const local = el.rotation ? rotatePoint(p, center(el), -el.rotation) : p;
  let u = (local.x - el.x) / el.width;
  let v = (local.y - el.y) / el.height;

  if (!allowOutside && (u < 0 || u > 1 || v < 0 || v > 1)) return null;
  if (el.flipX) u = 1 - u;
  if (el.flipY) v = 1 - v;

  const crop = el.crop ?? { x: 0, y: 0, width: 1, height: 1 };

  return { u: crop.x + u * crop.width, v: crop.y + v * crop.height };
}
