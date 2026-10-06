/// หน้าต่างลอย "แหล่งภาพ" (ชุดเครื่องมือส่วนตัวเหนือหน้าแก้ไข): ลากด้วยหัวหน้าต่าง ปรับขนาด ย่อเก็บได้
///
/// ตำแหน่ง ขนาด และสถานะย่อจำไว้ในเบราว์เซอร์ของผู้ชมแต่ละคน (localStorage · อ่าน/เขียนไม่ได้ก็ใช้ค่าเริ่มต้น)
/// ตัวช่วยคำนวณแยกจากหน้าจอเพื่อเทสต์ได้

import { create } from 'zustand';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const SOURCES_WINDOW_KEY = 'csc.sources-window.v1';
export const WINDOW_MARGIN = 8;
export const MIN_WINDOW_WIDTH = 280;
export const MIN_WINDOW_HEIGHT = 260;
/// ความสูงตอนย่อเหลือแค่หัวหน้าต่าง
export const MINIMIZED_HEIGHT = 52;
/// ระยะเลื่อน/ปรับขนาดต่อการกดลูกศรหนึ่งครั้ง (กด Shift = ทีละมาก)
export const KEY_STEP = 16;
export const KEY_STEP_LARGE = 64;

export function defaultRect(view: Viewport): WindowRect {
  const width = Math.min(380, Math.max(MIN_WINDOW_WIDTH, view.width - WINDOW_MARGIN * 2));
  const height = Math.min(600, Math.max(MIN_WINDOW_HEIGHT, view.height - 160));

  return clampRect({ x: view.width - width - 24, y: 96, width, height }, view, false);
}

/// ให้หน้าต่างอยู่ในจอเสมอ (หลังย่อ/ขยายเบราว์เซอร์ หรือค่าที่จำไว้จากจอที่ใหญ่กว่า)
export function clampRect(rect: WindowRect, view: Viewport, minimized: boolean): WindowRect {
  const maxWidth = Math.max(MIN_WINDOW_WIDTH, view.width - WINDOW_MARGIN * 2);
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT, view.height - WINDOW_MARGIN * 2);
  const width = Math.round(Math.min(maxWidth, Math.max(MIN_WINDOW_WIDTH, rect.width)));
  const height = Math.round(Math.min(maxHeight, Math.max(MIN_WINDOW_HEIGHT, rect.height)));
  const shown = minimized ? MINIMIZED_HEIGHT : height;
  const x = Math.round(Math.min(Math.max(WINDOW_MARGIN, view.width - width - WINDOW_MARGIN), Math.max(WINDOW_MARGIN, rect.x)));
  const y = Math.round(Math.min(Math.max(WINDOW_MARGIN, view.height - shown - WINDOW_MARGIN), Math.max(WINDOW_MARGIN, rect.y)));

  return { x, y, width, height };
}

export interface SourcesWindowPrefs {
  rect: WindowRect;
  minimized: boolean;
}

/// อ่านค่าที่จำไว้ · ข้อมูลเสีย/ไม่ครบ → null
export function parsePrefs(raw: string | null | undefined): SourcesWindowPrefs | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as { x?: unknown; y?: unknown; width?: unknown; height?: unknown; minimized?: unknown };
    const nums = [value.x, value.y, value.width, value.height];

    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;

    return {
      rect: { x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number },
      minimized: value.minimized === true,
    };
  } catch {
    return null;
  }
}

export function serializePrefs(prefs: SourcesWindowPrefs): string {
  return JSON.stringify({ ...prefs.rect, minimized: prefs.minimized });
}

function loadPrefs(): SourcesWindowPrefs | null {
  try {
    return parsePrefs(window.localStorage.getItem(SOURCES_WINDOW_KEY));
  } catch {
    return null;
  }
}

function savePrefs(prefs: SourcesWindowPrefs) {
  try {
    window.localStorage.setItem(SOURCES_WINDOW_KEY, serializePrefs(prefs));
  } catch {
    /* โหมดส่วนตัว/บล็อกที่เก็บข้อมูล — ใช้ได้ต่อโดยไม่จำค่า */
  }
}

function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

interface SourcesWindowState {
  open: boolean;
  minimized: boolean;
  rect: WindowRect | null;
  show(): void;
  hide(): void;
  toggle(): void;
  setRect(rect: WindowRect): void;
  setMinimized(minimized: boolean): void;
  /// จอเปลี่ยนขนาด — ดึงหน้าต่างกลับเข้าจอ
  fit(): void;
}

export const useSourcesWindow = create<SourcesWindowState>((set, get) => ({
  open: false,
  minimized: false,
  rect: null,
  show() {
    const prefs = loadPrefs();
    const minimized = prefs?.minimized ?? false;
    const rect = prefs ? clampRect(prefs.rect, viewport(), minimized) : defaultRect(viewport());

    // เปิดจากปุ่ม = อยากเห็นเนื้อหา → คลายการย่อ
    set({ open: true, minimized: false, rect });
  },
  hide() {
    set({ open: false });
  },
  toggle() {
    if (get().open) get().hide();
    else get().show();
  },
  setRect(rect) {
    const next = clampRect(rect, viewport(), get().minimized);

    set({ rect: next });
    savePrefs({ rect: next, minimized: get().minimized });
  },
  setMinimized(minimized) {
    const rect = get().rect ?? defaultRect(viewport());
    const next = clampRect(rect, viewport(), minimized);

    set({ minimized, rect: next });
    savePrefs({ rect: next, minimized });
  },
  fit() {
    const rect = get().rect;

    if (rect) set({ rect: clampRect(rect, viewport(), get().minimized) });
  },
}));

/// ลูกศร → ระยะเลื่อน (dx, dy) · ไม่ใช่ลูกศร → null
export function arrowDelta(key: string, large: boolean): { dx: number; dy: number } | null {
  const step = large ? KEY_STEP_LARGE : KEY_STEP;

  switch (key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 };
    case 'ArrowRight':
      return { dx: step, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -step };
    case 'ArrowDown':
      return { dx: 0, dy: step };
    default:
      return null;
  }
}
