'use client';

import {
  ChevronLeft, ChevronRight, Ellipsis, Eraser, Highlighter, Maximize, Minimize, Pause, PenLine, Play, RotateCcw,
  Sparkles, Timer, X, ZoomIn,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { cx } from '@/components/csmju/primitives';
import { mirrorFonts } from '@/lib/editor/fonts';
import { entryLength, entryProgress } from '@/lib/editor/motion-export';
import { PagePlayback, pageHasMedia } from '@/lib/editor/playback';
import { drawPage, preloadPage, strokeFreehand, subscribeImageReady } from '@/lib/editor/render';
import { useEditor } from '@/lib/editor/store';
import { pageSizeOf, type Page } from '@/lib/editor/types';
import { formatClock, useTimerStore } from './timer';

/// โหมดพรีเซนต์ (ภาพบรีฟ "พรีเซนต์") — เต็มหน้าจอ · มุมมองผู้พรีเซนต์ (หน้าต่างแยก) · เล่นอัตโนมัติ
///
/// หน้าที่ "ซ่อน" ไม่แสดง · แอนิเมชันของชิ้นงานเล่นตอนเข้าหน้า · ปุ่ม Magic สร้างเอฟเฟกต์บนจอด้วย canvas ล้วน

export type PresentMode = 'fullscreen' | 'presenter' | 'autoplay';

interface Ink {
  brush: 'pen' | 'highlighter';
  points: number[];
}

interface PresentState {
  mode: PresentMode | null;
  /// ตำแหน่งในรายการหน้าที่แสดงได้ (ไม่ใช่ index ในงาน)
  slide: number;
  enteredAt: number;
  playing: boolean;
  ink: Record<string, Ink[]>;
  tool: 'none' | 'pen' | 'highlighter' | 'eraser';
  effect: { kind: MagicKind; at: number } | null;
  blurred: boolean;
  quiet: boolean;
  startedAt: number;
  /// หน้าต่างผู้พรีเซนต์ (เปิดตอนกดปุ่ม เพื่อไม่ให้เบราว์เซอร์บล็อกป๊อปอัป)
  popup: Window | null;
  /// กล่องในหน้าต่างผู้พรีเซนต์ที่ React วาดลงไป (สร้างใหม่ทุกครั้งที่เปิด — ไม่ปนกับของค้างจากรอบก่อน)
  container: HTMLElement | null;
  /// เพิ่มขึ้นเมื่อฟอนต์ในหน้าต่างผู้พรีเซนต์โหลดเสร็จ ให้สไลด์วาดใหม่
  fontTick: number;
  start(mode: PresentMode, slide: number): void;
  stop(): void;
  go(slide: number): void;
  setTool(tool: PresentState['tool']): void;
  addInk(pageId: string, ink: Ink): void;
  clearInk(pageId: string): void;
  magic(kind: MagicKind): void;
  setPlaying(playing: boolean): void;
}

export type MagicKind = 'blur' | 'quiet' | 'bubbles' | 'confetti' | 'drumroll' | 'curtain' | 'mic' | 'clear';

export const usePresent = create<PresentState>((set, get) => ({
  mode: null,
  slide: 0,
  enteredAt: 0,
  playing: false,
  ink: {},
  tool: 'none',
  effect: null,
  blurred: false,
  quiet: false,
  startedAt: 0,
  popup: null,
  container: null,
  fontTick: 0,
  start(mode, slide) {
    let popup = get().popup;
    let container = get().container;

    if (mode === 'presenter' && (!popup || popup.closed || !container)) {
      popup = window.open('', 'csc-presenter', 'width=1180,height=760');
      // ป๊อปอัปถูกบล็อก — พรีเซนต์เต็มจอแทน
      if (!popup) mode = 'fullscreen';
      else container = setupPopup(popup);
    }

    if (mode !== 'presenter' && popup && !popup.closed) {
      popup.close();
      popup = null;
      container = null;
    }

    set({ mode, slide, popup, container, enteredAt: performance.now(), playing: mode === 'autoplay', ink: {}, tool: 'none', effect: null, blurred: false, quiet: false, startedAt: Date.now() });
  },
  stop() {
    const popup = get().popup;

    if (popup && !popup.closed) popup.close();
    set({ mode: null, effect: null, tool: 'none', popup: null, container: null });
  },
  go(slide) {
    set({ slide, enteredAt: performance.now(), effect: null });
  },
  setTool(tool) {
    set({ tool });
  },
  addInk(pageId, ink) {
    set({ ink: { ...get().ink, [pageId]: [...(get().ink[pageId] ?? []), ink] } });
  },
  clearInk(pageId) {
    set({ ink: { ...get().ink, [pageId]: [] } });
  },
  magic(kind) {
    if (kind === 'clear') return set({ effect: null, blurred: false, quiet: false });
    if (kind === 'blur') return set({ blurred: !get().blurred });
    if (kind === 'quiet') return set({ quiet: !get().quiet });

    set({ effect: { kind, at: performance.now() } });
  },
  setPlaying(playing) {
    set({ playing, enteredAt: performance.now() });
  },
}));

/// เตรียมหน้าต่างผู้พรีเซนต์ทันทีที่เปิด: คัดลอกสไตล์ (URL เต็ม) และล้างของค้าง
///
/// หน้าต่างตั้งชื่อไว้ จึงอาจเป็นหน้าต่างเดิมที่ค้างจากก่อนรีเฟรชหน้าแก้ไข — ต้องล้างเนื้อหาเก่าทิ้งก่อน
function setupPopup(win: Window): HTMLElement {
  const doc = win.document;

  doc.title = 'หน้าต่างผู้พรีเซนต์ · CS Canvas';
  doc.documentElement.lang = 'th';
  // ใช้ธีมเดียวกับหน้าแก้ไข · สีของเวทีพรีเซนต์ล็อกด้วย .csmju-stage อยู่แล้ว
  doc.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') ?? 'light');
  doc.head.querySelectorAll('[data-csc-clone]').forEach((node) => node.remove());

  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    const copy = node.cloneNode(true) as HTMLElement;

    if (node instanceof HTMLLinkElement) copy.setAttribute('href', node.href);
    copy.setAttribute('data-csc-clone', '');
    doc.head.appendChild(copy);
  }

  doc.body.className = document.body.className;
  doc.body.replaceChildren();

  const root = doc.createElement('div');

  root.id = 'csc-presenter-root';
  doc.body.appendChild(root);

  return root;
}

/// จบการพรีเซนต์เมื่อปิดหน้าต่างผู้พรีเซนต์ · ปิดหน้าต่างนั้นเมื่อหน้าแก้ไขถูกปิดหรือรีเฟรช · ติดตั้งฟอนต์ของงาน
function preparePopup(win: Window): () => void {
  const onClose = () => usePresent.getState().stop();
  const onLeave = () => win.close();
  const unmirror = mirrorFonts(win.document, () => usePresent.setState((st) => ({ fontTick: st.fontTick + 1 })));

  win.addEventListener('beforeunload', onClose);
  window.addEventListener('pagehide', onLeave);

  return () => {
    win.removeEventListener('beforeunload', onClose);
    window.removeEventListener('pagehide', onLeave);
    unmirror();
  };
}

function visiblePages(pages: Page[]): Page[] {
  const shown = pages.filter((p) => !p.hidden);

  return shown.length > 0 ? shown : pages;
}

const MAGIC: { kind: MagicKind; label: string; key: string }[] = [
  { kind: 'blur', label: 'เบลอ', key: 'B' },
  { kind: 'quiet', label: 'เงียบ', key: 'Q' },
  { kind: 'bubbles', label: 'ฟองสบู่', key: 'O' },
  { kind: 'confetti', label: 'คอนเฟตติ', key: 'C' },
  { kind: 'drumroll', label: 'รัวกลอง', key: 'D' },
  { kind: 'curtain', label: 'เปิดผ้าม่าน', key: 'U' },
  { kind: 'mic', label: 'ดรอปไมค์', key: 'M' },
  { kind: 'clear', label: 'ล้าง', key: 'X' },
];

/// คีย์ลัดของโหมดพรีเซนต์ (ใช้ทั้งจอหลักและหน้าต่างผู้พรีเซนต์)
function usePresentKeys(target: Window | null, total: number) {
  useEffect(() => {
    if (!target) return;

    const onKey = (event: KeyboardEvent) => {
      const p = usePresent.getState();

      if ((event.target as HTMLElement | null)?.closest?.('textarea, input')) return;

      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (p.slide < total - 1) p.go(p.slide + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp' || event.key === 'Backspace') {
        event.preventDefault();
        if (p.slide > 0) p.go(p.slide - 1);
      } else if (event.key === 'Home') {
        p.go(0);
      } else if (event.key === 'End') {
        p.go(total - 1);
      } else if (event.key === 'Escape') {
        if (p.tool !== 'none') p.setTool('none');
        else p.stop();
      } else {
        const magic = MAGIC.find((m) => m.key === event.key.toUpperCase());

        if (magic && !event.ctrlKey && !event.metaKey) p.magic(magic.kind);
      }
    };

    target.addEventListener('keydown', onKey);

    return () => target.removeEventListener('keydown', onKey);
  }, [target, total]);
}

export function Presenter() {
  const mode = usePresent((s) => s.mode);

  if (!mode) return null;

  return <PresenterInner mode={mode} />;
}

function PresenterInner({ mode }: { mode: PresentMode }) {
  const pages = visiblePages(useEditor((s) => s.doc.pages));
  const slide = Math.min(usePresent((s) => s.slide), pages.length - 1);
  const playing = usePresent((s) => s.playing);
  const enteredAt = usePresent((s) => s.enteredAt);
  const rootRef = useRef<HTMLDivElement>(null);
  const popup = usePresent((s) => s.popup);
  const container = usePresent((s) => s.container);
  const [isFull, setIsFull] = useState(false);
  const [toastVisible, setToastVisible] = useState(true);
  const page = pages[slide];

  usePresentKeys(typeof window === 'undefined' ? null : window, pages.length);
  usePresentKeys(popup, pages.length);

  // เต็มหน้าจอของเบราว์เซอร์ (ออกจากเต็มจอ = จบการพรีเซนต์)
  useEffect(() => {
    if (mode === 'presenter') return;

    const el = rootRef.current;

    void el?.requestFullscreen?.().catch(() => undefined);

    const onChange = () => {
      const full = Boolean(document.fullscreenElement);

      setIsFull(full);
      if (!full && usePresent.getState().mode && usePresent.getState().mode !== 'presenter') usePresent.getState().stop();
    };

    document.addEventListener('fullscreenchange', onChange);
    const hide = window.setTimeout(() => setToastVisible(false), 3000);

    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.clearTimeout(hide);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [mode]);

  // มุมมองผู้พรีเซนต์: เตรียมหน้าต่างแยกที่เปิดไว้ตอนกดปุ่ม (ใช้ข้อมูลชุดเดียวกัน — ไม่มีอะไรส่งออกนอกเครื่อง)
  useEffect(() => (popup ? preparePopup(popup) : undefined), [popup]);

  // เล่นอัตโนมัติ: เลื่อนหน้าตามเวลาของแต่ละหน้า แล้ววนกลับหน้าแรก
  useEffect(() => {
    if (!playing || !page) return;

    const id = window.setTimeout(() => {
      const p = usePresent.getState();

      p.go(p.slide < pages.length - 1 ? p.slide + 1 : 0);
    }, (page.duration ?? 5) * 1000);

    return () => window.clearTimeout(id);
  }, [playing, page, enteredAt, pages.length]);

  if (!page) return null;

  return (
    <>
      <div ref={rootRef} className="csmju-stage fixed inset-0 z-50 flex flex-col bg-inverse">
        <SlideView page={page} interactive className="min-h-0 flex-1" />
        <PresentControls total={pages.length} isFull={isFull} />
        {toastVisible && mode !== 'presenter' && (
          <p role="status" className="csmju-fade-in absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-inverse/90 px-3 py-2 text-csmju-caption text-on-inverse">
            กด Esc เพื่อออกจากโหมดพรีเซนต์
          </p>
        )}
      </div>
      {popup && container && createPortal(<PresenterWindow pages={pages} />, container)}
    </>
  );
}

/// สไลด์หนึ่งหน้า: วาดเต็มพื้นที่แบบคงสัดส่วน + แอนิเมชันตอนเข้า + หมึกวาด + เอฟเฟกต์ Magic
function SlideView({ page, interactive = false, className }: { page: Page; interactive?: boolean; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const size = useMemo(() => pageSizeOf(page, { width: baseWidth, height: baseHeight }), [page, baseWidth, baseHeight]);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const enteredAt = usePresent((s) => s.enteredAt);
  const ink = usePresent((s) => s.ink[page.id]);
  const tool = usePresent((s) => s.tool);
  const effect = usePresent((s) => s.effect);
  const blurred = usePresent((s) => s.blurred);
  const quiet = usePresent((s) => s.quiet);
  const drawing = useRef<Ink | null>(null);
  const raf = useRef<number | null>(null);
  const paintRef = useRef<() => void>(() => undefined);
  // หน้าต่างที่สไลด์นี้อยู่จริง (อาจเป็นหน้าต่างผู้พรีเซนต์) — ใช้ตัวจับขนาด เฟรม และความละเอียดจอของหน้าต่างนั้น
  // ถ้าใช้ของหน้าหลัก เมื่อหน้าหลักถูกบังหรือย่อ เบราว์เซอร์จะหยุดส่งเฟรม สไลด์ในหน้าต่างผู้พรีเซนต์จะว่างหรือค้าง
  const winRef = useRef<(Window & typeof globalThis) | null>(null);
  const fontTick = usePresent((s) => s.fontTick);
  // วิดีโอและเสียงของหน้าเล่นเฉพาะสไลด์หลัก (ภาพย่อในหน้าต่างผู้พรีเซนต์แสดงภาพปก ไม่ให้เสียงซ้อนกัน)
  const playbackRef = useRef<PagePlayback | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const win = (wrap.ownerDocument.defaultView ?? window) as Window & typeof globalThis;

    winRef.current = win;

    const observer = new win.ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));

    observer.observe(wrap);

    return () => observer.disconnect();
  }, []);

  const scale = box.width && box.height ? Math.min(box.width / size.width, box.height / size.height) : 0;

  const paint = useCallback(() => {
    raf.current = null;

    const canvas = canvasRef.current;

    if (!canvas || !scale) return;

    const win = winRef.current ?? window;
    const dpr = win.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;
    const now = performance.now();
    const elapsed = now - enteredAt;
    const progressOf = entryProgress(page, elapsed);

    canvas.width = Math.round(size.width * scale * dpr);
    canvas.height = Math.round(size.height * scale * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = 'rgb(255 255 255)';
    if (!page.background) ctx.fillRect(0, 0, size.width, size.height);
    drawPage(ctx, page, size, { progress: progressOf, videoFrame: playbackRef.current?.frame });

    for (const stroke of [...(ink ?? []), ...(drawing.current ? [drawing.current] : [])]) {
      ctx.save();
      ctx.strokeStyle = stroke.brush === 'highlighter' ? 'rgb(255 222 89 / 0.5)' : 'rgb(255 49 49)';
      ctx.lineWidth = stroke.brush === 'highlighter' ? Math.max(size.width, size.height) / 60 : Math.max(size.width, size.height) / 300;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokeFreehand(ctx, stroke.points);
      ctx.restore();
    }

    const effectRunning = effect && drawMagic(ctx, effect.kind, now - effect.at, size);

    if (elapsed < entryLength(page) + 100 || effectRunning || playbackRef.current?.animating) raf.current = win.requestAnimationFrame(() => paintRef.current());
  }, [page, size, scale, enteredAt, ink, effect]);

  // เข้าหน้า: เริ่มคลิปวิดีโอและเสียงประกอบจากต้น · ออกจากหน้า/จบการพรีเซนต์: หยุดและคืนตัวเล่น
  useEffect(() => {
    if (!interactive || !pageHasMedia(page)) return;

    const playback = new PagePlayback(page, { ownerDocument: wrapRef.current?.ownerDocument });

    playbackRef.current = playback;
    void playback.start().then(() => paintRef.current());

    return () => {
      playback.stop();
      if (playbackRef.current === playback) playbackRef.current = null;
    };
  }, [interactive, page, enteredAt]);

  // ฟอนต์ในหน้าต่างนี้โหลดเสร็จ → วาดใหม่
  useEffect(() => {
    paintRef.current();
  }, [fontTick]);

  useEffect(() => {
    paintRef.current = paint;
    void preloadPage(page).then(() => paint());
    const unsubscribe = subscribeImageReady(() => paintRef.current());

    paint();

    return () => {
      if (raf.current) (winRef.current ?? window).cancelAnimationFrame(raf.current);
      unsubscribe();
    };
  }, [paint, page]);

  const toPage = (event: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();

    return [((event.clientX - rect.left) / rect.width) * size.width, ((event.clientY - rect.top) / rect.height) * size.height];
  };

  return (
    <div ref={wrapRef} className={cx('relative flex items-center justify-center overflow-hidden', className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`สไลด์${page.name ? ` ${page.name}` : ''}`}
        style={{ width: size.width * scale, height: size.height * scale, filter: blurred ? 'blur(24px)' : undefined, cursor: interactive && tool !== 'none' ? 'crosshair' : 'default' }}
        className="block shadow-csmju-lg"
        onPointerDown={(event) => {
          if (!interactive || tool === 'none') return;

          event.currentTarget.setPointerCapture(event.pointerId);

          if (tool === 'eraser') {
            usePresent.getState().clearInk(page.id);
            return;
          }

          drawing.current = { brush: tool, points: toPage(event) };
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;

          drawing.current.points.push(...toPage(event));
          paint();
        }}
        onPointerUp={() => {
          if (drawing.current) usePresent.getState().addInk(page.id, drawing.current);
          drawing.current = null;
        }}
      />
      {quiet && (
        <div className="csmju-fade-in absolute inset-x-0 bottom-10 flex justify-center">
          <span className="rounded-full bg-inverse/80 px-6 py-3 text-csmju-h2 font-bold text-on-inverse">ชู่ว์… เงียบก่อนนะ</span>
        </div>
      )}
    </div>
  );
}

/// เอฟเฟกต์ Magic วาดทับสไลด์ (พิกัดหน้า) · คืน true ถ้ายังเล่นอยู่
function drawMagic(ctx: CanvasRenderingContext2D, kind: MagicKind, t: number, size: { width: number; height: number }): boolean {
  const { width: w, height: h } = size;
  const seeded = (i: number) => {
    const x = Math.sin(i * 9301 + 49297) * 233280;

    return x - Math.floor(x);
  };

  ctx.save();

  switch (kind) {
    case 'confetti': {
      const colors = ['rgb(255 87 87)', 'rgb(255 222 89)', 'rgb(56 182 255)', 'rgb(126 217 87)', 'rgb(203 108 230)', 'rgb(255 145 77)'];

      for (let i = 0; i < 160; i++) {
        const x = seeded(i) * w + Math.sin(t / 300 + i) * w * 0.02;
        const y = -h * 0.1 + ((t / 1000) * (0.4 + seeded(i + 7) * 0.6) * h) - seeded(i + 3) * h * 0.6;

        if (y > h) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t / 200 + i);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(-w * 0.006, -h * 0.004, w * 0.012, h * 0.008);
        ctx.restore();
      }

      ctx.restore();

      return t < 4000;
    }
    case 'bubbles': {
      for (let i = 0; i < 40; i++) {
        const r = (0.015 + seeded(i) * 0.04) * Math.min(w, h);
        const x = seeded(i + 11) * w + Math.sin(t / 500 + i) * r;
        const y = h + r - ((t / 1000) * (0.15 + seeded(i + 5) * 0.25) * h) - seeded(i + 2) * h * 0.3;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
        ctx.lineWidth = r * 0.12;
        ctx.fillStyle = 'rgb(140 200 255 / 0.25)';
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();

      return t < 6000;
    }
    case 'curtain': {
      const open = Math.min(1, t / 1600);
      const half = (w / 2) * (1 - open);

      ctx.fillStyle = 'rgb(150 20 30)';
      ctx.fillRect(0, 0, half, h);
      ctx.fillRect(w - half, 0, half, h);
      ctx.restore();

      return t < 1700;
    }
    case 'drumroll': {
      const shake = t < 2000 ? Math.sin(t / 25) * Math.min(w, h) * 0.004 : 0;

      ctx.font = `bold ${Math.min(w, h) * 0.12}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
      ctx.strokeStyle = 'rgb(0 0 0 / 0.6)';
      ctx.lineWidth = Math.min(w, h) * 0.006;
      ctx.strokeText('ตึ่ง ตึ่ง ตึ่ง…', w / 2 + shake, h / 2);
      ctx.fillText('ตึ่ง ตึ่ง ตึ่ง…', w / 2 + shake, h / 2);
      ctx.restore();

      return t < 2600;
    }
    case 'mic': {
      const y = Math.min(h * 0.8, ((t / 600) ** 2) * h * 0.3);

      ctx.fillStyle = 'rgb(30 30 30)';
      ctx.beginPath();
      ctx.ellipse(w / 2, y, w * 0.02, w * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w / 2 - w * 0.006, y + w * 0.02, w * 0.012, w * 0.07);
      if (t > 1400) {
        ctx.font = `bold ${Math.min(w, h) * 0.08}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgb(255 255 255)';
        ctx.fillText('จบแบบเท่ ๆ', w / 2, h * 0.35);
      }

      ctx.restore();

      return t < 3500;
    }
    default:
      ctx.restore();

      return false;
  }
}

function PresentControls({ total, isFull }: { total: number; isFull: boolean }) {
  const slide = usePresent((s) => s.slide);
  const tool = usePresent((s) => s.tool);
  const playing = usePresent((s) => s.playing);
  const mode = usePresent((s) => s.mode);
  const { open: magicOpen, setOpen: setMagicOpen, anchorRef: magicAnchor, menuRef: magicMenu } = useAnchoredMenu('end');
  const { open: moreOpen, setOpen: setMoreOpen, anchorRef: moreAnchor, menuRef: moreMenu } = useAnchoredMenu('end');
  const p = usePresent.getState;

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 bg-inverse px-4 py-2 text-on-inverse">
      <div className="flex items-center gap-1">
        <DarkButton label="สไลด์ก่อนหน้า (←)" disabled={slide === 0} onClick={() => p().go(slide - 1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </DarkButton>
        <span className="min-w-14 text-center text-csmju-caption tabular-nums">
          {slide + 1} / {total}
        </span>
        <DarkButton label="สไลด์ถัดไป (→)" disabled={slide >= total - 1} onClick={() => p().go(slide + 1)}>
          <ChevronRight aria-hidden className="size-5" />
        </DarkButton>
        {mode === 'autoplay' && (
          <DarkButton label={playing ? 'หยุดเล่นอัตโนมัติ' : 'เล่นอัตโนมัติ'} onClick={() => p().setPlaying(!playing)}>
            {playing ? <Pause aria-hidden className="size-5" /> : <Play aria-hidden className="size-5" />}
          </DarkButton>
        )}
      </div>
      <div className="flex items-center gap-1">
        <DarkButton label="ปากกา" active={tool === 'pen'} onClick={() => p().setTool(tool === 'pen' ? 'none' : 'pen')}>
          <PenLine aria-hidden className="size-5" />
        </DarkButton>
        <DarkButton label="ไฮไลท์" active={tool === 'highlighter'} onClick={() => p().setTool(tool === 'highlighter' ? 'none' : 'highlighter')}>
          <Highlighter aria-hidden className="size-5" />
        </DarkButton>
        <DarkButton label="ลบหมึกในสไลด์นี้" active={tool === 'eraser'} onClick={() => p().setTool(tool === 'eraser' ? 'none' : 'eraser')}>
          <Eraser aria-hidden className="size-5" />
        </DarkButton>
        <DarkButton label="ปุ่ม Magic" buttonRef={magicAnchor} active={magicOpen} onClick={() => setMagicOpen((v) => !v)}>
          <Sparkles aria-hidden className="size-5" />
        </DarkButton>
        <FloatingPanel open={magicOpen} menuRef={magicMenu} label="ปุ่ม Magic" className="w-56 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
          {MAGIC.map((m) => (
            <button
              key={m.kind}
              type="button"
              role="menuitem"
              onClick={() => {
                p().magic(m.kind);
                setMagicOpen(false);
              }}
              className="flex min-h-10 w-full items-center px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted"
            >
              <span className="flex-1">{m.label}</span>
              <kbd className="rounded border border-line px-1.5 text-muted">{m.key}</kbd>
            </button>
          ))}
        </FloatingPanel>
        <DarkButton label="ตัวเลือกเพิ่มเติม" buttonRef={moreAnchor} active={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
          <Ellipsis aria-hidden className="size-5" />
        </DarkButton>
        <FloatingPanel open={moreOpen} menuRef={moreMenu} label="ตัวเลือกการพรีเซนต์" className="w-64 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
          <button type="button" role="menuitem" onClick={() => { p().start(mode === 'autoplay' ? 'fullscreen' : 'autoplay', slide); setMoreOpen(false); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
            <Play aria-hidden className="size-4" /> {mode === 'autoplay' ? 'เลิกเล่นอัตโนมัติ' : 'เริ่มเล่นอัตโนมัติ'}
          </button>
          <button type="button" role="menuitem" onClick={() => { p().go(0); setMoreOpen(false); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
            <RotateCcw aria-hidden className="size-4" /> กลับไปสไลด์แรก
          </button>
        </FloatingPanel>
        {mode !== 'presenter' && (
          <DarkButton
            label={isFull ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.())}
          >
            {isFull ? <Minimize aria-hidden className="size-5" /> : <Maximize aria-hidden className="size-5" />}
          </DarkButton>
        )}
        <DarkButton label="จบการพรีเซนต์ (Esc)" onClick={() => p().stop()}>
          <X aria-hidden className="size-5" />
        </DarkButton>
      </div>
    </div>
  );
}

function DarkButton({ label, onClick, disabled, active, children, buttonRef }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx('inline-flex size-10 items-center justify-center rounded-lg disabled:opacity-30', active ? 'bg-surface text-ink' : 'hover:bg-surface/15')}
    >
      {children}
    </button>
  );
}

/// หน้าต่างผู้พรีเซนต์: เวลา · เวลาที่ผ่าน · สไลด์ปัจจุบัน/ถัดไป · สมุดโน้ต · ตัวจับเวลา
function PresenterWindow({ pages }: { pages: Page[] }) {
  const slide = usePresent((s) => s.slide);
  const startedAt = usePresent((s) => s.startedAt);
  const [now, setNow] = useState(() => Date.now());
  const [fontSize, setFontSize] = useState(24);
  const [intro, setIntro] = useState(true);
  const timer = useTimerStore();
  const page = pages[slide];
  const next = pages[slide + 1];

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="csmju-stage relative flex h-dvh flex-col bg-inverse text-on-inverse">
      <header className="flex shrink-0 items-center gap-4 px-5 py-3">
        <span className="text-csmju-h2 font-bold tabular-nums">{new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="text-csmju-h3 tabular-nums">{formatClock(now - startedAt)}</span>
        <DarkButton label="เริ่มนับเวลาใหม่" onClick={() => usePresent.setState({ startedAt: Date.now() })}>
          <RotateCcw aria-hidden className="size-5" />
        </DarkButton>
        <div className="ml-auto flex items-center gap-1">
          <DarkButton label={timer.running ? `ตัวจับเวลา ${formatClock(timer.remaining)}` : 'ตัวจับเวลา'} active={timer.running} onClick={() => (timer.running ? timer.pause() : timer.start())}>
            <Timer aria-hidden className="size-5" />
          </DarkButton>
          {timer.running && <span className="text-csmju-body font-semibold tabular-nums">{formatClock(timer.remaining)}</span>}
          <DarkButton label="จบการพรีเซนต์" onClick={() => usePresent.getState().stop()}>
            <X aria-hidden className="size-5" />
          </DarkButton>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 px-5 pb-4">
        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          {page && <SlideView page={page} interactive className="min-h-0 flex-1 rounded-xl" />}
          <div className="flex items-center justify-center gap-2">
            <DarkButton label="สไลด์ก่อนหน้า" disabled={slide === 0} onClick={() => usePresent.getState().go(slide - 1)}>
              <ChevronLeft aria-hidden className="size-5" />
            </DarkButton>
            <span className="text-csmju-caption tabular-nums">
              {slide + 1} / {pages.length}
            </span>
            <DarkButton label="สไลด์ถัดไป" disabled={slide >= pages.length - 1} onClick={() => usePresent.getState().go(slide + 1)}>
              <ChevronRight aria-hidden className="size-5" />
            </DarkButton>
          </div>
          <ol className="csmju-scroll-x flex shrink-0 gap-2 overflow-x-auto pb-1">
            {pages.map((p, i) => (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => usePresent.getState().go(i)}
                  aria-label={`ไปที่สไลด์ ${i + 1}`}
                  className={cx('h-20 overflow-hidden rounded-lg border-2', i === slide ? 'border-primary' : 'border-transparent')}
                >
                  <MiniSlide page={p} />
                </button>
              </li>
            ))}
          </ol>
        </div>
        <aside className="flex min-h-0 flex-col gap-3">
          <p className="text-csmju-caption font-semibold">สไลด์ถัดไป</p>
          <div className="h-36 shrink-0 overflow-hidden rounded-xl bg-surface/10">{next ? <MiniSlide page={next} /> : <p className="p-4 text-csmju-caption">จบสไลด์แล้ว</p>}</div>
          <div className="flex items-center justify-between">
            <p className="text-csmju-caption font-semibold">สมุดโน้ต</p>
            <div className="flex items-center gap-1">
              <DarkButton label="ลดขนาดตัวอักษร" onClick={() => setFontSize((v) => Math.max(14, v - 4))}>
                <span className="text-csmju-caption">A−</span>
              </DarkButton>
              <DarkButton label="เพิ่มขนาดตัวอักษร" onClick={() => setFontSize((v) => Math.min(48, v + 4))}>
                <ZoomIn aria-hidden className="size-4" />
              </DarkButton>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-surface/20 p-3 whitespace-pre-wrap" style={{ fontSize, lineHeight: 1.5 }}>
            {page?.notes?.trim() || <span className="opacity-60">เพิ่มหมายเหตุไปยังดีไซน์ของคุณ</span>}
          </div>
        </aside>
      </div>
      {intro && (
        <div className="absolute inset-0 flex items-center justify-center bg-inverse/70">
          <div role="dialog" aria-label="หน้าต่างผู้พรีเซนต์" className="max-w-md rounded-2xl bg-inverse p-6 shadow-csmju-lg ring-1 ring-surface/20">
            <h2 className="text-csmju-h3 font-bold">หน้าต่างผู้พรีเซนต์</h2>
            <p className="mt-2 text-csmju-caption opacity-80">หน้าต่างนี้เห็นเฉพาะคุณ ลากหน้าต่างหลักของหน้าแก้ไขไปไว้บนจอที่ผู้ชมเห็น แล้วควบคุมสไลด์ได้จากที่นี่</p>
            <button type="button" onClick={() => setIntro(false)} className="mt-4 min-h-11 rounded-xl bg-primary px-5 text-csmju-caption font-semibold text-on-inverse">
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniSlide({ page }: { page: Page }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const { width: pageWidth, height: pageHeight } = pageSizeOf(page, { width: baseWidth, height: baseHeight });
  const fontTick = usePresent((s) => s.fontTick);

  useEffect(() => {
    let cancelled = false;
    const size = { width: pageWidth, height: pageHeight };

    void preloadPage(page).then(() => {
      const canvas = canvasRef.current;

      if (!canvas || cancelled) return;

      const scale = 240 / Math.max(size.width, size.height);

      canvas.width = Math.round(size.width * scale);
      canvas.height = Math.round(size.height * scale);

      const ctx = canvas.getContext('2d')!;

      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgb(255 255 255)';
      ctx.fillRect(0, 0, size.width, size.height);
      drawPage(ctx, page, size);
    });

    return () => {
      cancelled = true;
    };
    // fontTick: วาดใหม่เมื่อฟอนต์ในหน้าต่างผู้พรีเซนต์โหลดเสร็จ
  }, [page, pageWidth, pageHeight, fontTick]);

  return <canvas ref={canvasRef} aria-hidden className="h-full w-auto" />;
}

const PRESENT_OPTIONS: { mode: PresentMode; label: string; hint: string }[] = [
  { mode: 'fullscreen', label: 'เต็มหน้าจอ', hint: 'พรีเซนต์ดีไซน์แบบเต็มหน้าจอ' },
  { mode: 'presenter', label: 'มุมมองผู้พรีเซนต์', hint: 'ดูโน้ตและสไลด์ถัดไปในหน้าต่างแยก' },
  { mode: 'autoplay', label: 'เล่นอัตโนมัติ', hint: 'เลื่อนหน้าตามเวลาที่ตั้งไว้ของแต่ละหน้า' },
];

/// ปุ่ม "พรีเซนต์ ⌄" บนแถบบน
export function PresentButton() {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('end');
  const begin = (mode: PresentMode) => {
    const state = useEditor.getState();
    const shown = visiblePages(state.doc.pages);
    const current = state.doc.pages[state.pageIndex];
    const index = Math.max(0, shown.indexOf(current));

    setOpen(false);
    usePresent.getState().start(mode, index);
  };

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => begin('fullscreen')}
        title="พรีเซนต์แบบเต็มหน้าจอ (Ctrl+Alt+P)"
        className="inline-flex min-h-11 items-center gap-2 rounded-l-xl bg-surface/15 pr-3 pl-4 text-csmju-caption font-semibold hover:bg-surface/25"
      >
        <Play aria-hidden className="size-4" /> <span className="hidden sm:inline">พรีเซนต์</span>
      </button>
      <button
        ref={anchorRef}
        type="button"
        aria-label="ตัวเลือกการพรีเซนต์"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center rounded-r-xl border-l border-surface/25 bg-surface/15 px-2 hover:bg-surface/25"
      >
        <ChevronRight aria-hidden className={cx('size-4 rotate-90 transition-transform', open && '-rotate-90')} />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label="ตัวเลือกการพรีเซนต์" className="w-80 rounded-xl border border-line bg-surface py-1.5 shadow-csmju-lg">
        {PRESENT_OPTIONS.map((o) => (
          <button key={o.mode} type="button" role="menuitem" onClick={() => begin(o.mode)} className="flex w-full flex-col px-4 py-2 text-left hover:bg-surface-muted">
            <span className="text-csmju-caption font-semibold text-ink">{o.label}</span>
            <span className="text-csmju-caption text-muted">{o.hint}</span>
          </button>
        ))}
      </FloatingPanel>
    </div>
  );
}

/// เริ่มพรีเซนต์เต็มจอจากหน้าที่เปิดอยู่ (ปุ่มเต็มจอในแถบล่าง · Ctrl+Alt+P)
export function presentFromCurrent(mode: PresentMode = 'fullscreen') {
  const state = useEditor.getState();
  const shown = visiblePages(state.doc.pages);

  usePresent.getState().start(mode, Math.max(0, shown.indexOf(state.doc.pages[state.pageIndex])));
}
