'use client';

import { Play, Route, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/components/csmju/primitives';
import {
  DEFAULT_PATH_MS, DEFAULT_TRANSITION_MS, EMPHASIS_ANIMATIONS, ENTRY_ANIMATIONS, EXIT_ANIMATIONS, PATH_PRESETS, TRANSITIONS,
  applyMotion, defaultMotionPath, drawTransition, pathFromStroke, pathPreset, previewLength, previewMotion, speedOf, type PathPreset,
} from '@/lib/editor/animation';
import { notifyAction } from '@/lib/editor/action-toast';
import { drawPage } from '@/lib/editor/render';
import { currentPage, useEditor } from '@/lib/editor/store';
import { pageSizeOf, type AnimationKind, type CanvasElement, type EmphasisKind, type ExitKind, type Page, type PathElement, type TextElement, type TransitionKind } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { PanelHeader, RangeField, UnderlineTabs } from './controls';

/// แผงแอนิเมต: เข้า · เน้น (วน) · ออก · เส้นทางเคลื่อนที่ · การเปลี่ยนหน้า — ตัวอย่างทุกปุ่มวาดด้วยตัว engine เดียวกับพรีเซนต์

type Tab = 'entry' | 'emphasis' | 'exit' | 'path' | 'page';

const TABS: { key: Tab; label: string }[] = [
  { key: 'entry', label: 'เข้า' },
  { key: 'emphasis', label: 'เน้น' },
  { key: 'exit', label: 'ออก' },
  { key: 'path', label: 'เส้นทาง' },
  { key: 'page', label: 'เปลี่ยนหน้า' },
];

function close() {
  useEditorUi.getState().setPanel(null);
}

function patch(ids: string[], values: Partial<CanvasElement> | ((el: CanvasElement) => Partial<CanvasElement>)) {
  useEditor.getState().updateElements(ids, typeof values === 'function' ? values : () => values);
}

function same<T>(items: CanvasElement[], pick: (el: CanvasElement) => T): T | undefined {
  if (items.length === 0) return undefined;

  const first = pick(items[0]);

  return items.every((el) => pick(el) === first) ? first : undefined;
}

export function AnimatePanel() {
  // แท็บอยู่ใน ui-store เพื่อให้เครื่องมืออื่นเปิดแผงนี้ที่แท็บที่ต้องการได้ (เช่น "การเปลี่ยนหน้า")
  const tab = useEditorUi((s) => s.animateTab);
  const setTab = (next: Tab) => useEditorUi.getState().set({ animateTab: next });
  const selection = useEditor((s) => s.selection);
  const pageElements = useEditor((s) => currentPage(s).elements);
  const selected = useMemo(() => pageElements.filter((el) => selection.includes(el.id)), [pageElements, selection]);
  // ยังไม่เลือก = ใช้กับทุกชิ้นในหน้า (แบบ Canva)
  const targets = (selected.length > 0 ? selected : pageElements).filter((el) => !el.locked);
  const ids = targets.map((el) => el.id);

  const play = (list = ids) => {
    if (list.length > 0) useEditorUi.getState().playPreview(list);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="แอนิเมต" onClose={close} />
      <UnderlineTabs label="ชนิดแอนิเมชัน" value={tab} onChange={setTab} tabs={TABS} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
        {tab === 'page' ? (
          <TransitionTab />
        ) : targets.length === 0 ? (
          <p className="text-csmju-caption text-muted">{pageElements.length === 0 ? 'หน้านี้ยังว่าง' : 'ชิ้นที่เลือกล็อกอยู่ทั้งหมด'}</p>
        ) : (
          <>
            <p className="mb-4 text-csmju-caption text-muted">
              {selected.length > 0 ? `ใช้กับ ${targets.length} ชิ้นที่เลือก — เล่นตอนพรีเซนต์ วิดีโอ และ GIF` : 'ยังไม่ได้เลือกชิ้นงาน: ใช้กับทุกชิ้นในหน้านี้'}
            </p>
            {tab === 'entry' && (
              <KindGrid<AnimationKind>
                kinds={ENTRY_ANIMATIONS}
                current={same(targets, (el) => el.animation ?? null)}
                phase="entry"
                onPick={(key) => {
                  patch(ids, { animation: key });
                  if (key) play();
                }}
              />
            )}
            {tab === 'emphasis' && (
              <KindGrid<EmphasisKind>
                kinds={EMPHASIS_ANIMATIONS}
                current={same(targets, (el) => el.animationLoop ?? null)}
                phase="loop"
                onPick={(key) => {
                  patch(ids, { animationLoop: key });
                  if (key) play();
                }}
              />
            )}
            {tab === 'exit' && (
              <KindGrid<ExitKind>
                kinds={EXIT_ANIMATIONS}
                current={same(targets, (el) => el.animationExit ?? null)}
                phase="exit"
                onPick={(key) => {
                  patch(ids, { animationExit: key });
                  if (key) play();
                }}
              />
            )}
            {tab === 'path' && <PathTab selected={selected} onPlay={play} />}

            {tab !== 'path' && (
              <div className="mt-5 flex flex-col gap-4">
                <RangeField
                  label="ความเร็ว (เท่า)"
                  value={same(targets, (el) => speedOf(el)) ?? 1}
                  min={0.25}
                  max={4}
                  step={0.25}
                  onChange={(v) => patch(ids, { animationSpeed: v === 1 ? undefined : v })}
                />
                <PlayButton disabled={previewLength(targets) === 0} onClick={() => play()} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlayButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
    >
      <Play aria-hidden className="size-4" /> เล่นตัวอย่าง
    </button>
  );
}

function KindGrid<K extends string>({
  kinds,
  current,
  phase,
  onPick,
}: {
  kinds: { key: K; label: string }[];
  current: K | null | undefined;
  phase: 'entry' | 'loop' | 'exit';
  onPick: (key: K | null) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile label="ไม่มี" selected={current === null} onClick={() => onPick(null)}>
        <span aria-hidden className="text-csmju-body text-muted">—</span>
      </Tile>
      {kinds.map((item) => (
        <Tile key={item.key} label={item.label} selected={current === item.key} onClick={() => onPick(item.key)}>
          <MotionSample phase={phase} kind={item.key} />
        </Tile>
      ))}
    </div>
  );
}

function Tile({ label, selected, onClick, children }: { label: string; selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'group flex flex-col items-center gap-1.5 rounded-xl p-2 text-csmju-caption text-ink hover:bg-surface-muted',
        selected && 'bg-primary-soft ring-2 ring-primary',
      )}
    >
      <span className="flex h-14 w-full items-center justify-center overflow-hidden rounded-lg bg-surface-muted">{children}</span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

const SAMPLE_W = 72;
const SAMPLE_H = 48;

/// ตัวอย่างเล็กในปุ่ม: วาด "Aa" ด้วย applyMotion · เล่นวนเมื่อชี้/โฟกัสปุ่ม (ไม่ขยับเองเพื่อไม่รบกวนสายตา)
function MotionSample({ phase, kind }: { phase: 'entry' | 'loop' | 'exit'; kind: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const button = canvas.closest('button');
    const ctx = canvas.getContext('2d');

    if (!ctx || !button) return;

    const dpr = window.devicePixelRatio || 1;
    const color = getComputedStyle(canvas).color || 'rgb(0 76 153)';
    const el = {
      id: 'sample', name: '', type: 'text', x: 18, y: 10, width: 36, height: 28, rotation: 0, opacity: 1, locked: false, hidden: false, groupId: null,
      text: 'Aa', fontFamily: 'sans-serif', fontSize: 20, fontWeight: 700, italic: false, underline: false, align: 'center', lineHeight: 1.4, letterSpacing: 0, color,
      ...(phase === 'entry' ? { animation: kind } : phase === 'loop' ? { animationLoop: kind } : { animationExit: kind }),
    } as unknown as TextElement;
    let raf = 0;
    let start = 0;

    canvas.width = SAMPLE_W * dpr;
    canvas.height = SAMPLE_H * dpr;

    const paint = (t: number | null) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (t !== null) {
        const state = previewMotion(el, t);

        if (state) applyMotion(ctx, el, state);
      }
      ctx.fillText(phase === 'entry' && kind === 'typewriter' && t !== null ? 'Aa'.slice(0, Math.ceil(Math.min(1, t / 800) * 2)) : 'Aa', SAMPLE_W / 2, SAMPLE_H / 2);
      ctx.restore();
    };

    const loop = (now: number) => {
      const length = previewLength([el]) + 400;

      paint((now - start) % length);
      raf = requestAnimationFrame(loop);
    };
    const begin = () => {
      cancelAnimationFrame(raf);
      start = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const end = () => {
      cancelAnimationFrame(raf);
      paint(null);
    };

    paint(null);
    button.addEventListener('pointerenter', begin);
    button.addEventListener('pointerleave', end);
    button.addEventListener('focus', begin);
    button.addEventListener('blur', end);

    return () => {
      cancelAnimationFrame(raf);
      button.removeEventListener('pointerenter', begin);
      button.removeEventListener('pointerleave', end);
      button.removeEventListener('focus', begin);
      button.removeEventListener('blur', end);
    };
  }, [phase, kind]);

  return <canvas ref={ref} aria-hidden className="h-12 w-18 text-primary" />;
}

// ── เส้นทาง ────────────────────────────────────────────────────────

function PathTab({ selected, onPlay }: { selected: CanvasElement[]; onPlay: (ids?: string[]) => void }) {
  const [preset, setPreset] = useState<PathPreset>('line');
  const [distance, setDistance] = useState(300);
  const [angle, setAngle] = useState(0);
  const movers = selected.filter((el) => !el.locked && el.type !== 'path');
  const strokes = selected.filter((el): el is PathElement => el.type === 'path');
  const ids = movers.map((el) => el.id);
  const withPath = movers.filter((el) => el.motionPath);
  const duration = same(withPath, (el) => el.motionPath!.duration) ?? DEFAULT_PATH_MS;
  const loop = same(withPath, (el) => el.motionPath!.loop) ?? false;

  if (selected.length === 0) {
    return (
      <p className="text-csmju-caption text-muted">
        เลือกชิ้นงานที่จะให้เคลื่อนที่ก่อน · หรือวาดเส้นเอง (กด D) แล้ว Shift+คลิกเลือกเส้นกับชิ้นงานพร้อมกัน แล้วกด “ใช้เส้นที่วาด”
      </p>
    );
  }

  const applyPreset = (kind: PathPreset, d = distance, a = angle) => {
    setPreset(kind);
    patch(ids, (el) => ({ motionPath: { ...(el.motionPath ?? defaultMotionPath([])), points: pathPreset(kind, d, a) } }));
  };

  const useDrawn = () => {
    const stroke = strokes[0];
    // จุดของเส้นเก็บแบบ 0–1 ในกรอบของชิ้นเส้น → แปลงเป็นพิกัดหน้า
    const page = stroke.strokes.flatMap((s) => s.map((v, i) => (i % 2 === 0 ? stroke.x + v * stroke.width : stroke.y + v * stroke.height)));
    const state = useEditor.getState();

    state.beginGesture();
    patch(ids, (el) => ({ motionPath: { ...(el.motionPath ?? defaultMotionPath([])), points: pathFromStroke(page, el) } }));
    state.select([stroke.id]);
    state.removeSelected();
    state.select(ids);
    state.endGesture();
    notifyAction('ใช้เส้นที่วาดเป็นเส้นทางแล้ว');
    onPlay(ids);
  };

  return (
    <div className="flex flex-col gap-5">
      {movers.length === 0 ? (
        <p className="text-csmju-caption text-muted">เลือกชิ้นงานอื่นนอกจากเส้นที่วาดด้วย</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {PATH_PRESETS.map((item) => (
              <Tile key={item.key} label={item.label} selected={withPath.length > 0 && preset === item.key} onClick={() => applyPreset(item.key)}>
                <PathGlyph points={pathPreset(item.key, 60, 0)} />
              </Tile>
            ))}
          </div>
          {strokes.length === 1 && (
            <button
              type="button"
              onClick={useDrawn}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover"
            >
              <Route aria-hidden className="size-4" /> ใช้เส้นที่วาดเป็นเส้นทาง
            </button>
          )}
          {withPath.length > 0 && (
            <>
              <RangeField label="ระยะทาง" value={distance} min={20} max={2000} step={10} suffix="px" onChange={(v) => { setDistance(v); applyPreset(preset, v, angle); }} />
              <RangeField label="ทิศทาง" value={angle} min={0} max={359} suffix="°" onChange={(v) => { setAngle(v); applyPreset(preset, distance, v); }} />
              <RangeField
                label="เวลาเดินทาง (วินาที)"
                value={duration / 1000}
                min={0.3}
                max={10}
                step={0.1}
                onChange={(v) => patch(ids, (el) => (el.motionPath ? { motionPath: { ...el.motionPath, duration: Math.round(v * 1000) } } : {}))}
              />
              <label className="flex min-h-10 items-center justify-between gap-3 text-csmju-caption text-ink">
                เดินไป-กลับวนตลอด
                <input
                  type="checkbox"
                  role="switch"
                  checked={loop}
                  onChange={(event) => patch(ids, (el) => (el.motionPath ? { motionPath: { ...el.motionPath, loop: event.target.checked } } : {}))}
                  className="size-5 accent-primary"
                />
              </label>
              <PlayButton disabled={false} onClick={() => onPlay(ids)} />
              <button
                type="button"
                onClick={() => patch(ids, { motionPath: null })}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-csmju-caption font-semibold text-danger hover:bg-danger-bg"
              >
                <Trash2 aria-hidden className="size-4" /> ลบเส้นทาง
              </button>
            </>
          )}
          <p className="text-csmju-caption text-muted">เส้นทางเริ่มหลังแอนิเมชันเข้าจบ · เส้นประบนผืนผ้าใบแสดงเส้นทางของชิ้นที่เลือก</p>
        </>
      )}
    </div>
  );
}

function PathGlyph({ points }: { points: number[] }) {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - minX);
  const h = Math.max(1, Math.max(...ys) - minY);
  const s = Math.min(56 / w, 32 / h);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${((x - minX) * s + (64 - w * s) / 2).toFixed(1)} ${((ys[i] - minY) * s + (40 - h * s) / 2).toFixed(1)}`).join(' ');

  return (
    <svg aria-hidden viewBox="0 0 64 40" className="h-10 w-16 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

// ── เปลี่ยนหน้า ────────────────────────────────────────────────────

function TransitionTab() {
  const pageIndex = useEditor((s) => s.pageIndex);
  const pages = useEditor((s) => s.doc.pages);
  const page = pages[pageIndex];
  const prev = pageIndex > 0 ? pages[pageIndex - 1] : null;
  const current = page.transition ?? null;
  const duration = current?.duration ?? DEFAULT_TRANSITION_MS;

  const set = (kind: TransitionKind | null, ms = duration) => {
    useEditor.getState().updatePage(pageIndex, { transition: kind ? { kind, duration: ms } : null });
  };

  const applyAll = () => {
    const state = useEditor.getState();

    state.beginGesture();
    state.doc.pages.forEach((_, i) => state.updatePage(i, { transition: current }));
    state.endGesture();
    notifyAction(current ? `ใช้ “${TRANSITIONS.find((t) => t.key === current.kind)?.label}” กับทุกหน้าแล้ว` : 'เอาการเปลี่ยนหน้าออกจากทุกหน้าแล้ว');
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-csmju-caption text-muted">
        {prev ? `เล่นตอนเปลี่ยนจากหน้า ${pageIndex} มาหน้า ${pageIndex + 1}` : 'หน้าแรก: เล่นเมื่อย้อนกลับมาจากหน้าถัดไปตอนพรีเซนต์'} — ในพรีเซนต์ วิดีโอ และ GIF
      </p>
      {prev && current && <TransitionPreview prev={prev} page={page} kind={current.kind} duration={duration} />}
      <div className="grid grid-cols-3 gap-3">
        <Tile label="ไม่มี" selected={!current} onClick={() => set(null)}>
          <span aria-hidden className="text-csmju-body text-muted">—</span>
        </Tile>
        {TRANSITIONS.map((item) => (
          <Tile key={item.key} label={item.label} selected={current?.kind === item.key} onClick={() => set(item.key)}>
            <TransitionGlyph kind={item.key} />
          </Tile>
        ))}
      </div>
      {current && <RangeField label="ความยาว (วินาที)" value={duration / 1000} min={0.2} max={3} step={0.1} onChange={(v) => set(current.kind, Math.round(v * 1000))} />}
      <button
        type="button"
        onClick={applyAll}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
      >
        {current ? 'ใช้กับทุกหน้า' : 'เอาออกจากทุกหน้า'}
      </button>
    </div>
  );
}

/// ภาพเล็กของการเปลี่ยนหน้า: กล่องสองสี (หน้าเดิม/หน้าใหม่) ที่ความคืบหน้าครึ่งทาง
function TransitionGlyph({ kind }: { kind: TransitionKind }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const style = getComputedStyle(canvas);
    const muted = style.getPropertyValue('--csmju-color-line-strong').trim() || 'rgb(203 213 225)';
    const primary = style.color || 'rgb(0 76 153)';
    const size = { width: 64, height: 40 };

    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTransition(ctx, { kind, duration: 600 }, 0.5, size, () => {
      ctx.fillStyle = muted;
      ctx.fillRect(0, 0, size.width, size.height);
    }, () => {
      ctx.fillStyle = primary;
      ctx.fillRect(0, 0, size.width, size.height);
    });
  }, [kind]);

  return <canvas ref={ref} aria-hidden className="h-10 w-16 rounded text-primary" />;
}

const PREVIEW_W = 352;

/// ตัวอย่างการเปลี่ยนหน้าจริงจากหน้าก่อนหน้ามาหน้านี้ (วนซ้ำ)
function TransitionPreview({ prev, page, kind, duration }: { prev: Page; page: Page; kind: TransitionKind; duration: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const size = pageSizeOf(page, { width: baseWidth, height: baseHeight });
    const height = Math.round((PREVIEW_W * size.height) / size.width);
    const dpr = window.devicePixelRatio || 1;
    const scale = PREVIEW_W / size.width;
    const whole = (target: Page) => () => {
      const own = pageSizeOf(target, { width: baseWidth, height: baseHeight });
      const fit = Math.min(size.width / own.width, size.height / own.height);

      ctx.save();
      ctx.fillStyle = 'rgb(255 255 255)';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.scale(fit, fit);
      drawPage(ctx, target, own);
      ctx.restore();
    };
    let raf = 0;
    const start = performance.now();

    canvas.width = PREVIEW_W * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;

    const loop = (now: number) => {
      const cycle = duration + 900;
      const t = ((now - start) % cycle) - 450;

      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      drawTransition(ctx, { kind, duration }, Math.max(0, Math.min(1, t / duration)), size, whole(prev), whole(page));
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [prev, page, kind, duration, baseWidth, baseHeight]);

  return <canvas ref={ref} aria-label={`ตัวอย่างการเปลี่ยนหน้าแบบ ${TRANSITIONS.find((t) => t.key === kind)?.label ?? ''}`} role="img" className="w-full rounded-lg bg-surface-muted" />;
}
