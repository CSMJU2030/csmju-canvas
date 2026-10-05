'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { brushStyle, drawFrameEditGhost, drawPage, getImage, strokeFreehand, subscribeImageReady } from '@/lib/editor/render';
import { snapRect } from '@/lib/editor/snapping';
import { brushWidth, canEditDoc, currentPage, selectionBox, useEditor, type DrawBrush } from '@/lib/editor/store';
import type { CanvasElement, ImageElement, PathElement, TextElement } from '@/lib/editor/types';
import { PREVIEW_MS, useEditorUi } from '@/lib/editor/ui-store';

/// ผืนผ้าใบหลักของ editor — วาดด้วย Canvas 2D ทุกเฟรมที่มีการเปลี่ยน (requestAnimationFrame)
///
/// สถานะระหว่างลากเก็บใน ref ไม่ใช่ React state เพื่อไม่ให้ React render ซ้ำทุก pointermove
/// (หัวใจของการลากลื่น 60 FPS) · ส่วนที่ต้องจำถาวรอยู่ใน store (zustand)

const HANDLE_SIZE = 10;
const ROTATE_OFFSET = 28;
const SNAP_PX = 6;
const MIN_SIZE = 4;

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; start: Point; pan: Point }
  | { kind: 'move'; start: Point; origin: Map<string, Point>; box: Rect; moved: boolean }
  | { kind: 'resize'; handle: Handle; id: string; start: CanvasElement; keepAspect: boolean }
  | { kind: 'rotate'; id: string; startAngle: number; startRotation: number }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean; base: string[] }
  | { kind: 'pinch'; distance: number; zoom: number; mid: Point; pan: Point }
  | { kind: 'draw'; points: number[] }
  | { kind: 'erase'; last: Point }
  | { kind: 'image-erase'; id: string }
  | { kind: 'frame-pan'; id: string; cell: number; start: Point; origin: { offsetX: number; offsetY: number } };

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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
  const fitted = useRef<string | null>(null);
  const sizeRef = useRef(size);
  /// ตำแหน่งเมาส์ล่าสุด (พิกัดหน้า) — ใช้วาดวงยางลบ
  const hover = useRef<Point | null>(null);
  /// ใช้วาดเฟรมถัดไประหว่างเล่นตัวอย่างแอนิเมชัน (อ้างถึง draw ล่าสุดโดยไม่ต้องอ้างตัวเอง)
  const drawLoop = useRef<() => void>(() => undefined);
  /// กรอบ/ช่องที่จะรับรูปถ้าปล่อยตอนนี้ (ลากรูปจากแผง หรือลากรูปบนหน้าไปทับกรอบ)
  const dropTarget = useRef<{ id: string; cell: number } | null>(null);
  /// รวมการซูมด้วยล้อเมาส์ในโหมดจัดตำแหน่งรูปเป็น undo ขั้นเดียว
  const wheelTimer = useRef<number | null>(null);

  const editingTextId = useEditor((s) => s.editingTextId);

  // ── การแปลงพิกัด ────────────────────────────────────────────────

  const toPage = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { zoom, pan } = useEditor.getState();

    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }, []);

  const toScreen = useCallback((p: Point): Point => {
    const { zoom, pan } = useEditor.getState();

    return { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y };
  }, []);

  // ── การวาด ──────────────────────────────────────────────────────

  const draw = useCallback(() => {
    frame.current = null;

    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const state = useEditor.getState();
    const page = currentPage(state);
    const { zoom, pan, width, height } = state;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = cssVar('--csmju-color-stage', 'rgb(235 236 240)');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // หน้า (พิกัดหน้า)
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * pan.x, dpr * pan.y);
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.15)';
    ctx.shadowBlur = 24 / zoom;
    ctx.fillStyle = 'rgb(255 255 255)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (!page.background) drawChecker(ctx, width, height, zoom);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    // ตัวอย่างแอนิเมชันจากแผงแอนิเมต — เล่นจนครบแล้วหยุดเอง
    const preview = useEditorUi.getState().preview;
    const elapsed = preview ? performance.now() - preview.start : Infinity;
    const playing = preview && elapsed < PREVIEW_MS;

    drawPage(ctx, page, { width, height }, {
      skipIds: state.editingTextId ? new Set([state.editingTextId]) : undefined,
      progress: playing ? (el) => (preview.ids.includes(el.id) ? elapsed / PREVIEW_MS : undefined) : undefined,
    });

    if (playing) frame.current = requestAnimationFrame(() => drawLoop.current());

    // เส้นที่กำลังวาด (ยังไม่เป็น element จนกว่าจะปล่อย)
    const g = gesture.current;

    if (g.kind === 'draw' && state.tool.brush !== 'eraser') {
      const brush = state.tool.brush;

      ctx.save();
      brushStyle(ctx, brush, state.tool.colors[brush], brushWidth(state.tool.weights[brush], state));
      strokeFreehand(ctx, g.points);
      ctx.restore();
    }

    ctx.restore();

    // โหมดจัดตำแหน่งรูปในกรอบ: รูปส่วนที่ล้นกรอบแสดงจาง ๆ (วาดนอกขอบหน้าได้)
    const ui = useEditorUi.getState();
    const frameEdit = ui.frameEdit;
    const editingFrame = frameEdit ? page.elements.find((el): el is FrameLike => el.id === frameEdit.id && isFrameLike(el)) : undefined;

    if (editingFrame && frameEdit) drawFrameEditGhost(ctx, editingFrame, frameEdit.cell);

    // ส่วนควบคุม (พิกัดจอ)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const primary = cssVar('--csmju-color-primary', 'rgb(0 76 153)');
    const guide = 'rgb(236 72 153)';
    const selected = page.elements.filter((el) => state.selection.includes(el.id));

    for (const el of selected) {
      outline(ctx, corners(el).map(toScreen), primary, el.locked ? [4, 4] : []);
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

    for (const g of state.guides) {
      ctx.beginPath();

      if (g.axis === 'x') {
        const a = toScreen({ x: g.at, y: g.from });
        const b = toScreen({ x: g.at, y: g.to });

        ctx.moveTo(Math.round(a.x) + 0.5, a.y);
        ctx.lineTo(Math.round(b.x) + 0.5, b.y);
      } else {
        const a = toScreen({ x: g.from, y: g.at });
        const b = toScreen({ x: g.to, y: g.at });

        ctx.moveTo(a.x, Math.round(a.y) + 0.5);
        ctx.lineTo(b.x, Math.round(b.y) + 0.5);
      }

      ctx.stroke();
    }

    const imageErase = useEditorUi.getState().imageErase;

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
  }, [toScreen]);

  useEffect(() => {
    drawLoop.current = draw;
  }, [draw]);

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

  useEffect(() => {
    const unsubscribeImages = subscribeImageReady(requestDraw);

    const unsubscribeUi = useEditorUi.subscribe((ui, prev) => {
      if (ui.preview !== prev.preview || ui.imageErase !== prev.imageErase || ui.frameCell !== prev.frameCell || ui.frameEdit !== prev.frameEdit) requestDraw();
    });
    const unsubscribe = useEditor.subscribe((state, prev) => {
      const { imageErase: erasing, frameEdit } = useEditorUi.getState();

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

      if (state.width !== prev.width || state.height !== prev.height) {
        fitted.current = `${state.designId}:${state.width}x${state.height}`;
        fitToScreen(sizeRef.current);
      }

      requestDraw();
    });

    return () => {
      unsubscribe();
      unsubscribeUi();
      unsubscribeImages();
    };
  }, [requestDraw]);


  // ── การโต้ตอบด้วย pointer ────────────────────────────────────────

  const handleAt = useCallback(
    (screen: Point, el: CanvasElement): Handle | 'rotate' | null => {
      const c = center(el);
      const { zoom } = useEditor.getState();
      const up = rotatePoint({ x: c.x, y: el.y - ROTATE_OFFSET / zoom }, c, el.rotation);
      const rotateScreen = toScreen(up);

      if (Math.hypot(screen.x - rotateScreen.x, screen.y - rotateScreen.y) <= HANDLE_SIZE) return 'rotate';

      for (const handle of visibleHandles(el, zoom)) {
        const anchor = HANDLE_ANCHOR[handle];
        const local = { x: el.x + anchor.x * el.width, y: el.y + anchor.y * el.height };
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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;

    canvas.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const state = useEditor.getState();

    if (state.editingTextId) state.setEditingText(null);

    // สองนิ้ว = ซูม/เลื่อนมุมมอง (ยกเลิกการลากชิ้นงานหรือเส้นที่เริ่มไปแล้ว)
    if (pointers.current.size === 2) {
      const kind = gesture.current.kind;

      if (kind === 'move' || kind === 'resize' || kind === 'rotate' || kind === 'erase') {
        state.endGesture();
      }

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

    // โหมดแสดงความคิดเห็น: คลิกชิ้นงานเพื่อเลือกแล้วเขียนความคิดเห็น (ไม่ลาก)
    if (state.viewMode === 'comment' && event.button === 0 && !spaceDown.current) {
      const hit = topElementAt(toPage(event.clientX, event.clientY));

      state.select(hit ? [hit.id] : []);
      useEditorUi.getState().set({ commentsOpen: true });

      if (!hit) gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan: state.pan };
      return;
    }

    if (event.button === 1 || spaceDown.current || !canEditDoc(state)) {
      gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan: state.pan };
      setCursor('grabbing');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const p = toPage(event.clientX, event.clientY);

    // โหมดจัดตำแหน่งรูปในกรอบ: ลากในช่อง = เลื่อนรูป · คลิกนอกช่อง = เสร็จ
    const frameEdit = useEditorUi.getState().frameEdit;

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
    const imageErase = useEditorUi.getState().imageErase;

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
          keepAspect: selected[0].type === 'image' || selected[0].type === 'svg' || selected[0].type === 'frame',
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
      let ids = state.selection;

      if (event.shiftKey) {
        ids = ids.includes(hit.id) ? ids.filter((id) => id !== hit.id) : [...ids, hit.id];
        state.select(ids);
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

      if (movable.length === 0) return;

      state.beginGesture();
      gesture.current = {
        kind: 'move',
        start: p,
        origin: new Map(movable.map((el) => [el.id, { x: el.x, y: el.y }])),
        box: selectionBox(currentPage(fresh), movable.map((el) => el.id))!,
        moved: false,
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

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

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

    const p = toPage(event.clientX, event.clientY);

    if (g.kind === 'move') {
      let dx = p.x - g.start.x;
      let dy = p.y - g.start.y;

      if (!g.moved && Math.hypot(dx, dy) * state.zoom < 3) return;

      g.moved = true;

      const page = currentPage(state);
      const moving = { ...g.box, x: g.box.x + dx, y: g.box.y + dy };
      const ui = useEditorUi.getState();
      const targets = [
        ...page.elements.filter((el) => !g.origin.has(el.id) && !el.hidden).map(boundingBox),
        // เส้นไกด์จากไม้บรรทัดเป็นเป้าดูดด้วย
        ...(ui.rulers ? ui.guideLines.map((guide) => (guide.axis === 'x' ? { x: guide.at, y: 0, width: 0, height: state.height } : { x: 0, y: guide.at, width: state.width, height: 0 })) : []),
      ];
      const snap = event.altKey
        ? { dx: 0, dy: 0, guides: [] }
        : snapRect(moving, targets, { x: 0, y: 0, width: state.width, height: state.height }, SNAP_PX / state.zoom);

      dx += snap.dx;
      dy += snap.dy;
      state.setGuides(snap.guides);
      state.updateElements([...g.origin.keys()], (el) => {
        const o = g.origin.get(el.id)!;

        return { x: Math.round((o.x + dx) * 10) / 10, y: Math.round((o.y + dy) * 10) / 10 };
      });

      // ลากรูปเดี่ยวไปทับกรอบ/ช่องของกริด → เน้นช่องที่จะรับรูปเมื่อปล่อย
      const movingId = g.origin.size === 1 ? [...g.origin.keys()][0] : null;
      const movingEl = movingId ? page.elements.find((el) => el.id === movingId) : undefined;

      dropTarget.current = movingEl?.type === 'image' ? frameDropAt(p, movingEl.id) : null;
      return;
    }

    if (g.kind === 'resize') {
      const next = resizeRect(g.start, g.handle, p, {
        keepAspect: g.keepAspect !== event.shiftKey,
        minSize: MIN_SIZE,
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
      const el = currentPage(state).elements.find((e) => e.id === g.id);

      if (!el) return;

      let rotation = normalizeAngle(g.startRotation + angleFromCenter(center(el), p) - g.startAngle);

      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      else for (const snapTo of [0, 90, 180, 270, 360]) if (Math.abs(rotation - snapTo) < 3) rotation = snapTo % 360;

      state.updateElements([g.id], () => ({ rotation: Math.round(rotation * 10) / 10 }));
      return;
    }

    if (g.kind === 'marquee') {
      g.current = p;
      marquee.current = normalizeRect(g.start, p);

      const page = currentPage(state);
      const inside = page.elements
        .filter((el) => !el.hidden && rectsIntersect(boundingBox(el), marquee.current!))
        .map((el) => el.id);

      state.select(g.additive ? [...new Set([...g.base, ...inside])] : inside);
      requestDraw();
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);

    const g = gesture.current;
    const state = useEditor.getState();

    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = { kind: 'none' };
      return;
    }

    // ปล่อยรูปเดี่ยวบนกรอบ/ช่อง = ย้ายรูปเข้าไปในช่อง (อยู่ใน gesture เดียวกับการลาก → ย้อนกลับขั้นเดียว)
    const drop = dropTarget.current;

    dropTarget.current = null;

    if (g.kind === 'move' && g.moved && drop) {
      const image = currentPage(state).elements.find((el): el is ImageElement => el.type === 'image' && g.origin.has(el.id));

      if (image) moveImageIntoCell(image, drop.id, drop.cell);
    }

    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'erase' || g.kind === 'image-erase' || g.kind === 'frame-pan') state.endGesture();
    if (g.kind === 'pan') setCursor(spaceDown.current ? 'grab' : 'default');
    if (g.kind === 'frame-pan') setCursor('grab');

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

    if (selected.length === 1 && !selected[0].locked) {
      const handle = handleAt(screen, selected[0]);

      if (handle === 'rotate') return setCursor('grab');
      if (handle) return setCursor(resizeCursor(handle, selected[0].rotation));
    }

    const hit = topElementAt(toPage(event.clientX, event.clientY));

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
  };

  // ซูมด้วย Ctrl+ล้อ (หรือถ่างบนทัชแพด) · เลื่อนมุมมองด้วยล้อ
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
          patchCellImage(frameEdit.id, frameEdit.cell, { zoom: clampFrameZoom(image.zoom * Math.exp(-event.deltaY * 0.002)) });
          return;
        }
      }

      if (event.ctrlKey || event.metaKey) {
        const rect = canvas.getBoundingClientRect();
        const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const zoom = clampZoom(state.zoom * Math.exp(-event.deltaY * 0.01));
        const world = { x: (mouse.x - state.pan.x) / state.zoom, y: (mouse.y - state.pan.y) / state.zoom };

        state.setViewport(zoom, { x: mouse.x - world.x * zoom, y: mouse.y - world.y * zoom });
      } else {
        state.setViewport(state.zoom, { x: state.pan.x - event.deltaX, y: state.pan.y - event.deltaY });
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

  // ── ลากรูปจากแผง (อัปโหลด/คลังภาพ) มาวาง: บนกรอบ/ช่อง = ใส่รูป · ที่อื่น = เพิ่มรูปตรงจุดที่ปล่อย ──

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageDrag(event.dataTransfer) || !canEditDoc(useEditor.getState())) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    const next = frameDropAt(toPage(event.clientX, event.clientY), null);
    const current = dropTarget.current;

    if (next?.id !== current?.id || next?.cell !== current?.cell) {
      dropTarget.current = next;
      requestDraw();
    }
  };

  const onDragLeave = () => {
    if (!dropTarget.current) return;

    dropTarget.current = null;
    requestDraw();
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageDrag(event.dataTransfer)) return;

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
        aria-label="ผืนผ้าใบ — ใช้แผงเลเยอร์เพื่อเลือกชิ้นงานด้วยคีย์บอร์ด"
        tabIndex={0}
        style={{ width: size.width, height: size.height, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          hover.current = null;
          if (useEditor.getState().tool.brush === 'eraser' || useEditorUi.getState().imageErase) requestDraw();
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        className="block outline-none"
      />
      {editingTextId && <TextEditor id={editingTextId} />}
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

export function clampZoom(zoom: number): number {
  return Math.min(8, Math.max(0.05, zoom));
}

/// ซูมให้หน้าพอดีพื้นที่ (เว้นขอบ 40px)
export function fitToScreen(area: { width: number; height: number }) {
  const state = useEditor.getState();

  if (area.width === 0 || area.height === 0) return;

  const margin = area.width < 640 ? 24 : 56;
  const zoom = clampZoom(Math.min((area.width - margin * 2) / state.width, (area.height - margin * 2) / state.height));

  state.setViewport(zoom, {
    x: (area.width - state.width * zoom) / 2,
    y: (area.height - state.height * zoom) / 2,
  });
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
