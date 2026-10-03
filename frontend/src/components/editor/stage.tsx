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
import { drawPage, setImageReadyListener } from '@/lib/editor/render';
import { snapRect } from '@/lib/editor/snapping';
import { currentPage, selectionBox, useEditor } from '@/lib/editor/store';
import type { CanvasElement, TextElement } from '@/lib/editor/types';

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
  | { kind: 'pinch'; distance: number; zoom: number; mid: Point; pan: Point };

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
    ctx.fillStyle = cssVar('--csmju-color-canvas', 'rgb(241 245 251)');
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
    drawPage(ctx, page, { width, height }, {
      skipIds: state.editingTextId ? new Set([state.editingTextId]) : undefined,
    });
    ctx.restore();

    // ส่วนควบคุม (พิกัดจอ)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const primary = cssVar('--csmju-color-primary', 'rgb(0 76 153)');
    const guide = 'rgb(236 72 153)';
    const selected = page.elements.filter((el) => state.selection.includes(el.id));

    for (const el of selected) {
      outline(ctx, corners(el).map(toScreen), primary, el.locked ? [4, 4] : []);
    }

    if (selected.length === 1 && !selected[0].locked && state.editingTextId !== selected[0].id) {
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

    if (marquee.current) {
      const m = marquee.current;
      const a = toScreen({ x: m.x, y: m.y });

      ctx.fillStyle = 'rgba(0, 76, 153, 0.08)';
      ctx.strokeStyle = primary;
      ctx.fillRect(a.x, a.y, m.width * zoom, m.height * zoom);
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, m.width * zoom, m.height * zoom);
    }
  }, [toScreen]);

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
    setImageReadyListener(requestDraw);

    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.width !== prev.width || state.height !== prev.height) {
        fitted.current = `${state.designId}:${state.width}x${state.height}`;
        fitToScreen(sizeRef.current);
      }

      requestDraw();
    });

    return () => {
      unsubscribe();
      setImageReadyListener(null);
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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;

    canvas.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const state = useEditor.getState();

    if (state.editingTextId) state.setEditingText(null);

    // สองนิ้ว = ซูม/เลื่อนมุมมอง (ยกเลิกการลากชิ้นงานที่เริ่มไปแล้ว)
    if (pointers.current.size === 2) {
      if (gesture.current.kind === 'move' || gesture.current.kind === 'resize' || gesture.current.kind === 'rotate') {
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

    if (event.button === 1 || spaceDown.current) {
      gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan: state.pan };
      setCursor('grabbing');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const p = toPage(event.clientX, event.clientY);
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
          keepAspect: selected[0].type === 'image' || selected[0].type === 'svg',
        };
        return;
      }
    }

    const hit = topElementAt(p);

    if (hit) {
      let ids = state.selection;

      if (event.shiftKey) {
        ids = ids.includes(hit.id) ? ids.filter((id) => id !== hit.id) : [...ids, hit.id];
        state.select(ids);
      } else if (!ids.includes(hit.id)) {
        state.select([hit.id]);
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

    if (g.kind === 'none') {
      updateHoverCursor(event);
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
      const targets = page.elements
        .filter((el) => !g.origin.has(el.id) && !el.hidden)
        .map(boundingBox);
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

    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate') state.endGesture();
    if (g.kind === 'pan') setCursor(spaceDown.current ? 'grab' : 'default');

    marquee.current = null;
    gesture.current = { kind: 'none' };
    requestDraw();
  };

  const updateHoverCursor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (spaceDown.current) return setCursor('grab');

    const state = useEditor.getState();
    const page = currentPage(state);
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

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = topElementAt(toPage(event.clientX, event.clientY));

    if (hit?.type === 'text' && !hit.locked) {
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

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none overflow-hidden">
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
        onDoubleClick={onDoubleClick}
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

function outline(ctx: CanvasRenderingContext2D, pts: Point[], color: string, dash: number[]) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
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

function resizeCursor(handle: Handle, rotation: number): string {
  const base: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const angle = normalizeAngle(base[handle] + rotation);
  const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

  return cursors[Math.round(angle / 45) % 4];
}
