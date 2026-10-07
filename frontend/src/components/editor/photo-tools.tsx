'use client';

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Toggle, cx, inputClass, useToast } from '@/components/csmju/primitives';
import { fromInputColor, toInputColor } from '@/lib/editor/color';
import { EFFECT_DEFS, EFFECT_GROUPS, effectDef, effectParams, newEffect } from '@/lib/editor/image-effects';
import { runPipeline, type PipelineSpec } from '@/lib/editor/image-pipeline';
import {
  IMAGE_STYLES, PERSONAL_LIMIT, captureStyle, decorValues, hasImageEdits, loadPersonalStyles, savePersonalStyles, styleToValues, type ImageStylePreset,
} from '@/lib/editor/image-styles';
import {
  CURVE_IDENTITY, LEVELS_IDENTITY, TONE_CHANNELS, autoLevels, curveValues, histogram, isCurveIdentity, isLevelsIdentity, normalizeCurve, type ToneChannel,
} from '@/lib/editor/image-tones';
import { getImage, imageCompareSources, subscribeImageReady } from '@/lib/editor/render';
import { useEditor } from '@/lib/editor/store';
import type { CurvePoint, ImageEffect, ImageElement, ImageLayerStyle, LevelsChannel } from '@/lib/editor/types';
import { PresetTile, RangeField, UnderlineTabs } from './controls';

/// เครื่องมือแต่งภาพแบบ Photoshop ในแผง "แก้ไขรูปภาพ": เทียบก่อน/หลัง · เอฟเฟกต์ภาพ · ระดับสีและเส้นโค้ง
/// · สไตล์ภาพ (รวมสไตล์ที่ผู้ใช้บันทึกเอง) · สไตล์เลเยอร์ (เส้นขอบสติกเกอร์ แสงเรือง เงาด้านใน)
///
/// ทุกอย่างประมวลผลในเบราว์เซอร์ด้วยตัวประมวลผลเดียวกับผืนผ้าใบ (lib/editor/image-pipeline.ts)

/// ค่าของรูปที่เครื่องมือชุดนี้แก้ — ใช้ได้ทั้งรูปเดี่ยวและรูปในกรอบ/กริด (กรอบไม่มี layerStyle/border/shadow)
export type PhotoValues = Partial<Pick<ImageElement, 'adjust' | 'filter' | 'filterIntensity' | 'colorEdits' | 'effects' | 'levels' | 'curves' | 'layerStyle' | 'border' | 'shadow'>>;
export type PhotoImage = Pick<ImageElement, 'src'> &
  Partial<Pick<ImageElement, 'adjust' | 'filter' | 'filterIntensity' | 'colorEdits' | 'effects' | 'levels' | 'curves' | 'layerStyle' | 'crop' | 'erase'>>;

type Apply = (values: PhotoValues) => void;

/// ค่าที่ "รีเซ็ตทั้งหมด" ล้าง (ไม่แตะครอป ยางลบ หรือการลบพื้นหลัง)
export function resetAllValues(withLayerStyle: boolean): PhotoValues {
  return {
    adjust: null,
    filter: null,
    filterIntensity: 100,
    colorEdits: null,
    effects: null,
    levels: null,
    curves: null,
    ...(withLayerStyle ? { layerStyle: null } : {}),
  };
}

export function canReset(image: PhotoImage): boolean {
  return hasImageEdits(image);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-csmju-body font-bold text-ink">{children}</h3>;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const id = useId();

  return (
    <div className="flex min-h-11 items-center gap-3">
      <input
        id={id}
        type="color"
        value={toInputColor(value)}
        onChange={(event) => onChange(fromInputColor(event.target.value))}
        className="size-10 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-surface"
      />
      <label htmlFor={id} className="text-csmju-caption text-ink">
        {label}
      </label>
    </div>
  );
}

// ── ภาพย่อที่ผ่านตัวประมวลผล ─────────────────────────────────────────

export interface ThumbEntry {
  key: string;
  spec: PipelineSpec;
}

/// ภาพตัวอย่างขนาดเล็กของแต่ละชุดค่า (ย่อรูปจริงแล้วประมวลผลในเครื่อง) · `entries` ต้องคงที่ (useMemo)
export function usePipelineThumbs(src: string | undefined, entries: ThumbEntry[]) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!src || typeof document === 'undefined') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      const img = getImage(src);

      if (!img) {
        timer = setTimeout(run, 200);
        return;
      }

      const size = 96;
      const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
      const base = document.createElement('canvas');

      base.width = ratio >= 1 ? size : Math.max(1, Math.round(size * ratio));
      base.height = ratio >= 1 ? Math.max(1, Math.round(size / ratio)) : size;

      const ctx = base.getContext('2d', { willReadFrequently: true });

      if (!ctx) return;

      ctx.drawImage(img, 0, 0, base.width, base.height);

      const out: Record<string, string> = {};
      let source: ImageData | null = null;

      try {
        source = ctx.getImageData(0, 0, base.width, base.height);
      } catch {
        // รูปข้ามโดเมน อ่านพิกเซลไม่ได้ — ใช้ภาพเดิมทุกช่อง
      }

      for (const entry of entries) {
        if (source) {
          const data = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);

          runPipeline(data, entry.spec);
          ctx.putImageData(data, 0, 0);
        }

        out[entry.key] = base.toDataURL('image/jpeg', 0.8);
      }

      if (!cancelled) setThumbs(out);
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [src, entries]);

  return thumbs;
}

function Thumb({ src }: { src: string | undefined }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- ภาพตัวอย่างสร้างจาก canvas ในเครื่อง
    <img src={src} alt="" className="size-full object-cover" />
  ) : (
    <span className="text-csmju-caption text-muted">…</span>
  );
}

// ── เทียบก่อน/หลัง ──────────────────────────────────────────────────

/// ภาพเทียบ: ซ้ายของเส้นแบ่งเป็นภาพเดิม ขวาเป็นภาพที่แก้แล้ว · กดค้างปุ่ม "ดูภาพเดิม" เพื่อดูภาพเดิมทั้งภาพ
export function ComparePreview({ image }: { image: PhotoImage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [split, setSplit] = useState(50);
  const [holding, setHolding] = useState(false);
  const splitId = useId();

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const img = getImage(image.src);
      const ctx = canvas?.getContext('2d');

      if (!canvas || !img || !ctx) return;

      const { before, after } = imageCompareSources(image, img);
      const width = 576;
      const height = Math.max(1, Math.round((width * before.sh) / Math.max(1, before.sw)));

      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== Math.min(height, 720)) canvas.height = Math.min(height, 720);

      const h = canvas.height;
      const w = Math.round((h * before.sw) / Math.max(1, before.sh));
      const x0 = (canvas.width - w) / 2;
      const cut = holding ? x0 + w : x0 + (w * split) / 100;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(cut, 0, canvas.width - cut, h);
      ctx.clip();
      ctx.drawImage(after.source, after.sx, after.sy, after.sw, after.sh, x0, 0, w, h);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cut, h);
      ctx.clip();
      ctx.drawImage(before.source, before.sx, before.sy, before.sw, before.sh, x0, 0, w, h);
      ctx.restore();

      if (!holding && split > 0 && split < 100) {
        ctx.fillStyle = 'rgb(255 255 255)';
        ctx.fillRect(cut - 1.5, 0, 3, h);
      }
    };

    draw();

    return subscribeImageReady(draw);
  }, [image, split, holding]);

  return (
    <section className="mb-6">
      <SectionTitle>เทียบก่อน/หลัง</SectionTitle>
      <div className="csmju-checker overflow-hidden rounded-xl border border-line">
        <canvas ref={canvasRef} role="img" aria-label={holding ? 'ภาพเดิมก่อนแก้ไข' : `ภาพเทียบ: ซ้าย ${split}% เป็นภาพเดิม ที่เหลือเป็นภาพที่แก้แล้ว`} className="block h-auto w-full" />
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor={splitId} className="text-csmju-caption text-ink">
          เส้นแบ่ง (ซ้าย = ภาพเดิม)
        </label>
        <input id={splitId} type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="accent-primary" />
      </div>
      <button
        type="button"
        aria-pressed={holding}
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') setHolding(true);
        }}
        onKeyUp={() => setHolding(false)}
        onBlur={() => setHolding(false)}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
      >
        <Eye aria-hidden className="size-5" /> กดค้างเพื่อดูภาพเดิม
      </button>
    </section>
  );
}

// ── เอฟเฟกต์ภาพ ─────────────────────────────────────────────────────

const EFFECT_THUMBS: ThumbEntry[] = EFFECT_DEFS.map((def) => ({ key: def.kind, spec: { effects: [newEffect(def.kind)] } }));

function EffectControls({ effect, onChange }: { effect: ImageEffect; onChange: (next: ImageEffect) => void }) {
  const def = effectDef(effect.kind);
  const params = effectParams(effect);
  const selectId = useId();

  if (!def) return null;

  const colors = effect.colors && effect.colors.length >= (def.colors?.min ?? def.colors?.defaults.length ?? 0) ? effect.colors : (def.colors?.defaults ?? []);
  const setColors = (next: string[]) => onChange({ ...effect, colors: next });

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface-muted p-3">
      {def.params.map((p) =>
        p.options ? (
          <div key={p.key} className="flex flex-col gap-1">
            <label htmlFor={`${selectId}-${p.key}`} className="text-csmju-caption text-ink">
              {p.label}
            </label>
            <select
              id={`${selectId}-${p.key}`}
              value={params[p.key]}
              onChange={(e) => onChange({ ...effect, params: { ...params, [p.key]: Number(e.target.value) } })}
              className={inputClass}
            >
              {p.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <RangeField
            key={p.key}
            label={p.label}
            value={params[p.key]}
            min={p.min}
            max={p.max}
            step={p.step ?? 1}
            onChange={(v) => onChange({ ...effect, params: { ...params, [p.key]: v } })}
          />
        ),
      )}
      {def.colors && (
        <div className="flex flex-col gap-2">
          {colors.map((color, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <ColorInput label={def.colors!.labels[i] ?? `สีที่ ${i + 1}`} value={color} onChange={(c) => setColors(colors.map((v, j) => (j === i ? c : v)))} />
              </div>
              {def.colors!.max && colors.length > (def.colors!.min ?? 2) && (
                <button
                  type="button"
                  aria-label={`ลบ${def.colors!.labels[i] ?? `สีที่ ${i + 1}`}`}
                  onClick={() => setColors(colors.filter((_, j) => j !== i))}
                  className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            </div>
          ))}
          {def.colors.max && colors.length < def.colors.max && (
            <button
              type="button"
              onClick={() => setColors([...colors, colors[colors.length - 1] ?? 'rgb(255 255 255)'])}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface"
            >
              <Plus aria-hidden className="size-4" /> เพิ่มสี
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function EffectsView({ image, apply }: { image: PhotoImage; apply: Apply }) {
  const effects = image.effects ?? [];
  const [open, setOpen] = useState<number | null>(effects.length > 0 ? effects.length - 1 : null);
  const thumbs = usePipelineThumbs(image.src, EFFECT_THUMBS);
  const set = (next: ImageEffect[]) => apply({ effects: next.length > 0 ? next : null });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;

    if (j < 0 || j >= effects.length) return;

    const next = [...effects];

    [next[i], next[j]] = [next[j], next[i]];
    set(next);
    setOpen(j);
  };

  return (
    <>
      <section className="mb-6">
        <SectionTitle>เอฟเฟกต์ที่ใช้อยู่</SectionTitle>
        {effects.length === 0 ? (
          <p className="text-csmju-caption text-muted">ยังไม่มีเอฟเฟกต์ — กดเลือกจากรายการด้านล่าง ใส่ได้หลายชั้นและสลับลำดับได้</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {effects.map((effect, i) => {
              const def = effectDef(effect.kind);
              const label = def?.label ?? effect.kind;

              return (
                <li key={`${effect.kind}-${i}`} className="rounded-xl border border-line">
                  <div className="flex items-center gap-1 p-1">
                    <button
                      type="button"
                      aria-expanded={open === i}
                      onClick={() => setOpen(open === i ? null : i)}
                      className={cx('min-h-10 flex-1 rounded-lg px-2 text-left text-csmju-caption font-semibold', effect.off ? 'text-muted line-through' : 'text-ink')}
                    >
                      {i + 1}. {label}
                    </button>
                    <button
                      type="button"
                      aria-label={effect.off ? `แสดง${label}` : `ซ่อน${label}`}
                      aria-pressed={!effect.off}
                      onClick={() => set(effects.map((e, j) => (j === i ? { ...e, off: !e.off } : e)))}
                      className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
                    >
                      {effect.off ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                    </button>
                    <button type="button" aria-label={`เลื่อน${label}ขึ้น`} disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-muted disabled:opacity-40">
                      <ArrowUp aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`เลื่อน${label}ลง`}
                      disabled={i === effects.length - 1}
                      onClick={() => move(i, 1)}
                      className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-muted disabled:opacity-40"
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`ลบ${label}`}
                      onClick={() => {
                        set(effects.filter((_, j) => j !== i));
                        setOpen(null);
                      }}
                      className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                  {open === i && (
                    <div className="px-2 pb-2">
                      <EffectControls effect={effect} onChange={(next) => set(effects.map((e, j) => (j === i ? next : e)))} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-2 text-csmju-caption text-muted">ทำจากบนลงล่าง หลังการปรับแสงสี ฟิลเตอร์ ระดับสี และเส้นโค้ง</p>
      </section>
      {EFFECT_GROUPS.map((group) => (
        <section key={group.key} className="mb-5">
          <SectionTitle>{group.label}</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            {EFFECT_DEFS.filter((d) => d.group === group.key).map((def) => (
              <PresetTile
                key={def.kind}
                label={def.label}
                selected={effects.some((e) => e.kind === def.kind && !e.off)}
                onClick={() => {
                  set([...effects, newEffect(def.kind)]);
                  setOpen(effects.length);
                }}
              >
                <Thumb src={thumbs[def.kind]} />
              </PresetTile>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// ── ระดับสีและเส้นโค้ง ──────────────────────────────────────────────

const CHANNEL_INK: Record<ToneChannel, string> = {
  master: 'text-ink',
  red: 'text-danger',
  green: 'text-success',
  blue: 'text-primary',
};

function ChannelPicker({ value, onChange }: { value: ToneChannel; onChange: (c: ToneChannel) => void }) {
  return (
    <div role="group" aria-label="ช่องสี" className="mb-4 grid grid-cols-4 gap-2">
      {TONE_CHANNELS.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-pressed={value === c.key}
          onClick={() => onChange(c.key)}
          className={cx(
            'min-h-10 rounded-xl border text-csmju-caption font-semibold',
            value === c.key ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/// ฮิสโตแกรมของรูป (ย่อเหลือ ~160px) · null = อ่านพิกเซลไม่ได้
function useHistogram(src: string) {
  const [state, setState] = useState<{ src: string; hist: ReturnType<typeof histogram> | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      const img = getImage(src);

      if (!img) {
        timer = setTimeout(run, 200);
        return;
      }

      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight, 1));

      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let hist: ReturnType<typeof histogram> | null = null;

      try {
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (ctx) hist = histogram(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        hist = null;
      }

      if (!cancelled) setState({ src, hist });
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [src]);

  return state?.src === src ? state.hist : null;
}

function histogramPath(hist: Uint32Array | undefined): string {
  if (!hist) return '';

  let max = 1;

  for (let i = 1; i < 255; i++) max = Math.max(max, hist[i]);

  let d = 'M0 256';

  for (let i = 0; i < 256; i++) d += ` L${i} ${256 - Math.min(1, hist[i] / max) * 220}`;

  return `${d} L255 256 Z`;
}

function LevelsEditor({ image, apply, channel, hist }: { image: PhotoImage; apply: Apply; channel: ToneChannel; hist: ReturnType<typeof histogram> | null }) {
  const levels = image.levels ?? {};
  const current: LevelsChannel = { ...LEVELS_IDENTITY, ...(levels[channel] ?? {}) };
  const set = (patch: Partial<LevelsChannel>) => {
    const next = { ...current, ...patch };

    apply({ levels: { ...levels, [channel]: isLevelsIdentity(next) ? null : next } });
  };

  return (
    <>
      {hist && (
        <svg viewBox="0 0 256 256" preserveAspectRatio="none" aria-hidden className={cx('mb-4 h-24 w-full rounded-xl bg-surface-muted', CHANNEL_INK[channel])}>
          <path d={histogramPath(hist[channel])} fill="currentColor" opacity={0.35} />
          <line x1={current.black} x2={current.black} y1={0} y2={256} stroke="currentColor" strokeWidth={2} />
          <line x1={current.white} x2={current.white} y1={0} y2={256} stroke="currentColor" strokeWidth={2} />
        </svg>
      )}
      <div className="flex flex-col gap-4">
        <RangeField label="จุดดำ (อินพุต)" value={current.black} min={0} max={254} onChange={(v) => set({ black: Math.min(v, current.white - 1) })} />
        <RangeField label="แกมมา (โทนกลาง)" value={current.gamma} min={0.1} max={3} step={0.01} onChange={(v) => set({ gamma: v })} />
        <RangeField label="จุดขาว (อินพุต)" value={current.white} min={1} max={255} onChange={(v) => set({ white: Math.max(v, current.black + 1) })} />
        <RangeField label="ดำสุดของผลลัพธ์" value={current.outBlack} min={0} max={255} onChange={(v) => set({ outBlack: v })} />
        <RangeField label="ขาวสุดของผลลัพธ์" value={current.outWhite} min={0} max={255} onChange={(v) => set({ outWhite: v })} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!hist}
          onClick={() => hist && apply({ levels: autoLevels(hist) })}
          className="min-h-11 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
        >
          ปรับอัตโนมัติ
        </button>
        <button
          type="button"
          disabled={isLevelsIdentity(levels[channel])}
          onClick={() => set(LEVELS_IDENTITY)}
          className="min-h-11 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
        >
          รีเซ็ตช่องนี้
        </button>
      </div>
    </>
  );
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/// ตัวแก้เส้นโค้ง: ลากจุดได้ · คลิกพื้นที่ว่างเพื่อเพิ่มจุด · จุดกด Tab เข้าได้ ลูกศรเลื่อน (Shift = ทีละ 10) · Delete ลบจุด
export function CurvesEditor({
  points,
  onChange,
  channel,
  hist,
}: {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  channel: ToneChannel;
  hist?: Uint32Array;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const pts = normalizeCurve(points);
  const values = curveValues(pts);
  let path = '';

  for (let x = 0; x < 256; x++) path += `${x === 0 ? 'M' : ' L'}${x} ${255 - Math.max(0, Math.min(255, values[x]))}`;

  const toValue = (event: { clientX: number; clientY: number }): CurvePoint => {
    const rect = svgRef.current!.getBoundingClientRect();

    return [clamp255(((event.clientX - rect.left) / rect.width) * 255), clamp255(255 - ((event.clientY - rect.top) / rect.height) * 255)];
  };

  /// ย้ายจุดที่ i โดยไม่ให้ข้ามจุดข้างเคียง
  const moveTo = (list: CurvePoint[], i: number, [x, y]: CurvePoint): CurvePoint[] => {
    const lo = i === 0 ? 0 : list[i - 1][0] + 1;
    const hi = i === list.length - 1 ? 255 : list[i + 1][0] - 1;

    return list.map((p, j) => (j === i ? [Math.max(lo, Math.min(hi, x)), clamp255(y)] : p));
  };

  const startDrag = (i: number, event: ReactPointerEvent) => {
    drag.current = i;
    setActive(i);
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    useEditor.getState().beginGesture();
  };

  const onMove = (event: ReactPointerEvent) => {
    if (drag.current === null) return;
    onChange(moveTo(pts, drag.current, toValue(event)));
  };

  const endDrag = () => {
    if (drag.current === null) return;
    drag.current = null;
    useEditor.getState().endGesture();
  };

  const addAt = (point: CurvePoint): number => {
    const next = [...pts, point].sort((a, b) => a[0] - b[0]);
    const index = next.indexOf(point);

    if (index > 0 && next[index - 1][0] === point[0]) return -1;
    if (index < next.length - 1 && next[index + 1][0] === point[0]) return -1;

    onChange(next);

    return index;
  };

  const remove = (i: number) => {
    if (i === 0 || i === pts.length - 1) return;
    onChange(pts.filter((_, j) => j !== i));
    setActive(null);
  };

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox="-6 -6 268 268"
        className={cx('aspect-square w-full touch-none rounded-xl bg-surface-muted', CHANNEL_INK[channel])}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <title>เส้นโค้งช่อง {TONE_CHANNELS.find((c) => c.key === channel)?.label}</title>
        {hist && <path d={histogramPath(hist)} transform="translate(0 -1)" fill="currentColor" opacity={0.15} />}
        {[64, 128, 192].map((g) => (
          <g key={g} className="text-line-strong">
            <line x1={g} x2={g} y1={0} y2={255} stroke="currentColor" strokeWidth={0.6} />
            <line y1={g} y2={g} x1={0} x2={255} stroke="currentColor" strokeWidth={0.6} />
          </g>
        ))}
        <line x1={0} y1={255} x2={255} y2={0} stroke="currentColor" strokeWidth={0.6} strokeDasharray="4 4" opacity={0.5} />
        {/* พื้นที่คลิกเพื่อเพิ่มจุด (เพิ่มจุดด้วยแป้นพิมพ์ใช้ปุ่ม "เพิ่มจุด" ใต้กราฟ) */}
        <rect
          x={0}
          y={0}
          width={255}
          height={255}
          fill="transparent"
          onPointerDown={(event) => {
            const index = addAt(toValue(event));

            if (index >= 0) startDrag(index, event);
          }}
        />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2.5} pointerEvents="none" />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={255 - y}
            r={active === i ? 8 : 6.5}
            tabIndex={0}
            role="slider"
            aria-label={`จุดที่ ${i + 1} ของเส้นโค้ง`}
            aria-valuemin={0}
            aria-valuemax={255}
            aria-valuenow={y}
            aria-valuetext={`อินพุต ${x} เอาต์พุต ${y}`}
            className="cursor-grab fill-surface stroke-current outline-none focus-visible:stroke-primary"
            strokeWidth={active === i ? 3.5 : 2.5}
            onFocus={() => setActive(i)}
            onPointerDown={(event) => {
              event.stopPropagation();
              startDrag(i, event);
            }}
            onDoubleClick={() => remove(i)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 10 : 1;
              const delta: Record<string, CurvePoint> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };

              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                remove(i);
              } else if (delta[event.key]) {
                event.preventDefault();
                onChange(moveTo(pts, i, [x + delta[event.key][0], y + delta[event.key][1]]));
              }
            }}
          />
        ))}
      </svg>
      <p className="mt-2 text-csmju-caption text-muted">
        {active !== null && pts[active] ? `จุดที่ ${active + 1}: อินพุต ${pts[active][0]} → เอาต์พุต ${pts[active][1]}` : 'คลิกบนกราฟเพื่อเพิ่มจุด แล้วลาก · ดับเบิลคลิกจุดเพื่อลบ'}
      </p>
      <button
        type="button"
        onClick={() => {
          // เพิ่มจุดกลางช่วงที่กว้างที่สุด บนเส้นโค้งเดิม
          let best = 0;

          for (let i = 1; i < pts.length - 1; i++) if (pts[i + 1][0] - pts[i][0] > pts[best + 1][0] - pts[best][0]) best = i;

          const x = Math.round((pts[best][0] + pts[best + 1][0]) / 2);
          const index = addAt([x, clamp255(values[x])]);

          if (index >= 0) setActive(index);
        }}
        disabled={pts.length >= 14}
        className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
      >
        <Plus aria-hidden className="size-4" /> เพิ่มจุด
      </button>
    </div>
  );
}

const CURVE_PRESETS: { key: string; label: string; points: CurvePoint[] }[] = [
  { key: 'contrast', label: 'เพิ่มคอนทราสต์', points: [[0, 0], [64, 48], [192, 210], [255, 255]] },
  { key: 'soft', label: 'นุ่มลง', points: [[0, 0], [64, 76], [192, 182], [255, 255]] },
  { key: 'matte', label: 'ด้านแบบฟิล์ม', points: [[0, 32], [64, 74], [192, 200], [255, 238]] },
  { key: 'bright', label: 'สว่างขึ้น', points: [[0, 0], [128, 160], [255, 255]] },
  { key: 'dark', label: 'มืดลง', points: [[0, 0], [128, 100], [255, 255]] },
  { key: 'invert', label: 'กลับสี', points: [[0, 255], [255, 0]] },
];

export function TonesView({ image, apply }: { image: PhotoImage; apply: Apply }) {
  const [tab, setTab] = useState<'levels' | 'curves'>('curves');
  const [channel, setChannel] = useState<ToneChannel>('master');
  const hist = useHistogram(image.src);
  const curves = image.curves ?? {};
  const points = curves[channel] ?? CURVE_IDENTITY;
  const setPoints = (next: CurvePoint[]) => apply({ curves: { ...curves, [channel]: isCurveIdentity(next) ? null : next } });

  return (
    <>
      <UnderlineTabs
        label="ระดับสีและเส้นโค้ง"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'curves', label: 'เส้นโค้ง' },
          { key: 'levels', label: 'ระดับสี' },
        ]}
      />
      <div className="pt-4">
        <ChannelPicker value={channel} onChange={setChannel} />
        {tab === 'levels' ? (
          <LevelsEditor image={image} apply={apply} channel={channel} hist={hist} />
        ) : (
          <>
            <CurvesEditor points={points} onChange={setPoints} channel={channel} hist={hist?.[channel]} />
            <h3 className="mt-5 mb-2 text-csmju-caption font-bold text-ink">เส้นโค้งสำเร็จรูป</h3>
            <div className="grid grid-cols-2 gap-2">
              {CURVE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setPoints(preset.points)}
                  className="min-h-10 rounded-xl border border-line-strong px-2 text-csmju-caption text-ink hover:bg-surface-muted"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={isCurveIdentity(curves[channel])}
              onClick={() => setPoints(CURVE_IDENTITY)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              <RotateCcw aria-hidden className="size-4" /> รีเซ็ตเส้นโค้งช่องนี้
            </button>
          </>
        )}
        <button
          type="button"
          disabled={!image.levels && !image.curves}
          onClick={() => apply({ levels: null, curves: null })}
          className="mt-3 min-h-11 w-full rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
        >
          รีเซ็ตระดับสีและเส้นโค้งทั้งหมด
        </button>
      </div>
    </>
  );
}

// ── สไตล์ภาพ ────────────────────────────────────────────────────────

const STYLE_THUMBS: ThumbEntry[] = IMAGE_STYLES.map((s) => ({ key: s.key, spec: s.values }));

function applyStyle(preset: ImageStylePreset, apply: Apply, owner: { width: number; height: number } | null) {
  apply({ ...styleToValues(preset.values, owner !== null), ...(owner ? decorValues(preset, owner) : {}) });
}

/// แถบสไตล์ย่อในหน้าหลักของแผง
export function StyleStrip({ image, apply, owner, onSeeAll }: { image: PhotoImage; apply: Apply; owner: { width: number; height: number } | null; onSeeAll: () => void }) {
  const thumbs = usePipelineThumbs(image.src, STYLE_THUMBS);

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-csmju-body font-bold text-ink">สไตล์ภาพ</h3>
        <button type="button" onClick={onSeeAll} className="min-h-9 px-2 text-csmju-caption font-semibold text-ink hover:underline">
          ดูทั้งหมด
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {IMAGE_STYLES.slice(0, 3).map((preset) => (
          <PresetTile key={preset.key} label={preset.label} selected={false} onClick={() => applyStyle(preset, apply, owner)}>
            <Thumb src={thumbs[preset.key]} />
          </PresetTile>
        ))}
      </div>
    </section>
  );
}

export function StylesView({ image, apply, owner }: { image: PhotoImage; apply: Apply; owner: { width: number; height: number } | null }) {
  const thumbs = usePipelineThumbs(image.src, STYLE_THUMBS);
  const [personal, setPersonal] = useState<ImageStylePreset[]>(() => loadPersonalStyles());
  const personalThumbs = usePipelineThumbs(
    image.src,
    useMemo(() => personal.map((p) => ({ key: p.key, spec: p.values })), [personal]),
  );
  const [name, setName] = useState('');
  const nameId = useId();
  const toast = useToast();
  const canSave = hasImageEdits(image) && personal.length < PERSONAL_LIMIT;

  const store = (next: ImageStylePreset[], message: string) => {
    setPersonal(next);
    if (savePersonalStyles(next)) toast(message);
    else toast('บันทึกในเบราว์เซอร์นี้ไม่ได้ (อาจเป็นโหมดส่วนตัวหรือพื้นที่เต็ม) — สไตล์จะหายเมื่อปิดหน้า', 'error');
  };

  return (
    <>
      <p className="mb-4 text-csmju-caption text-muted">กดครั้งเดียวได้ทั้งฟิลเตอร์ เอฟเฟกต์ และการปรับ — แก้ต่อได้ทุกค่า</p>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {IMAGE_STYLES.map((preset) => (
          <PresetTile key={preset.key} label={preset.label} selected={false} onClick={() => applyStyle(preset, apply, owner)}>
            <Thumb src={thumbs[preset.key]} />
          </PresetTile>
        ))}
      </div>
      <section className="mb-6">
        <SectionTitle>สไตล์ของฉัน</SectionTitle>
        {personal.length === 0 ? (
          <p className="mb-3 text-csmju-caption text-muted">ยังไม่มี — แต่งรูปให้ถูกใจแล้วบันทึกเป็นสไตล์ไว้ใช้กับรูปอื่น (เก็บในเบราว์เซอร์เครื่องนี้)</p>
        ) : (
          <ul className="mb-4 grid grid-cols-3 gap-3">
            {personal.map((preset) => (
              <li key={preset.key} className="relative">
                <PresetTile label={preset.label} selected={false} onClick={() => applyStyle(preset, apply, owner)}>
                  <Thumb src={personalThumbs[preset.key]} />
                </PresetTile>
                <button
                  type="button"
                  aria-label={`ลบสไตล์ ${preset.label}`}
                  onClick={() => store(personal.filter((p) => p.key !== preset.key), 'ลบสไตล์แล้ว')}
                  className="absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-full bg-surface text-ink shadow-csmju-sm hover:bg-surface-muted"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();

            const label = name.trim() || `สไตล์ ${personal.length + 1}`;

            store([...personal, { key: `mine-${Date.now().toString(36)}`, label: label.slice(0, 40), values: captureStyle(image) }], `บันทึกสไตล์ “${label}” แล้ว`);
            setName('');
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor={nameId} className="text-csmju-caption text-ink">
            ชื่อสไตล์
          </label>
          <input id={nameId} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="เช่น โทนงานรับปริญญา" className={inputClass} />
          <button
            type="submit"
            disabled={!canSave}
            className="min-h-11 rounded-xl bg-primary text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-50"
          >
            บันทึกค่าปัจจุบันเป็นสไตล์
          </button>
          {!hasImageEdits(image) && <p className="text-csmju-caption text-muted">ยังไม่ได้แต่งรูปนี้ จึงยังไม่มีอะไรให้บันทึก</p>}
          {personal.length >= PERSONAL_LIMIT && <p className="text-csmju-caption text-muted">เก็บได้สูงสุด {PERSONAL_LIMIT} สไตล์ — ลบสไตล์เก่าก่อน</p>}
        </form>
      </section>
    </>
  );
}

// ── สไตล์เลเยอร์ ────────────────────────────────────────────────────

const LAYER_DEFAULTS: Required<{ [K in keyof ImageLayerStyle]: NonNullable<ImageLayerStyle[K]> }> = {
  outline: { size: 2.5, color: 'rgb(255 255 255)' },
  glow: { size: 4, color: 'rgb(255 230 120)', opacity: 70 },
  innerShadow: { size: 6, color: 'rgb(0 0 0)', opacity: 45 },
};

/// เส้นขอบสติกเกอร์ · แสงเรือง · เงาด้านใน (เฉพาะรูปเดี่ยว — เหมาะกับรูปที่ลบพื้นหลังแล้ว)
export function LayerStyleControls({ el, apply }: { el: Pick<ImageElement, 'layerStyle' | 'bgRemoved'>; apply: Apply }) {
  const style = el.layerStyle ?? {};
  const set = <K extends keyof ImageLayerStyle>(key: K, value: ImageLayerStyle[K]) => {
    const next = { ...style, [key]: value };
    const empty = !next.outline && !next.glow && !next.innerShadow;

    apply({ layerStyle: empty ? null : next });
  };

  return (
    <section className="mb-6">
      <SectionTitle>สไตล์เลเยอร์</SectionTitle>
      <p className="mb-2 text-csmju-caption text-muted">
        {el.bgRemoved ? 'ตามรูปร่างของรูปที่ลบพื้นหลังแล้ว' : 'ตามรูปร่างส่วนที่ทึบของรูป — ได้ผลดีที่สุดหลังลบพื้นหลัง'}
      </p>
      <Toggle label="เส้นขอบสติกเกอร์" checked={Boolean(style.outline)} onChange={(on) => set('outline', on ? LAYER_DEFAULTS.outline : null)} />
      {style.outline && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl bg-surface-muted p-3">
          <RangeField label="ความหนาเส้นขอบ" value={style.outline.size} min={0.5} max={10} step={0.5} onChange={(v) => set('outline', { ...style.outline!, size: v })} />
          <ColorInput label="สีเส้นขอบ" value={style.outline.color} onChange={(c) => set('outline', { ...style.outline!, color: c })} />
        </div>
      )}
      <Toggle label="แสงเรือง" checked={Boolean(style.glow)} onChange={(on) => set('glow', on ? LAYER_DEFAULTS.glow : null)} />
      {style.glow && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl bg-surface-muted p-3">
          <RangeField label="ขนาดแสง" value={style.glow.size} min={0.5} max={10} step={0.5} onChange={(v) => set('glow', { ...style.glow!, size: v })} />
          <RangeField label="ความเข้มแสง" value={style.glow.opacity} min={0} max={100} onChange={(v) => set('glow', { ...style.glow!, opacity: v })} />
          <ColorInput label="สีแสง" value={style.glow.color} onChange={(c) => set('glow', { ...style.glow!, color: c })} />
        </div>
      )}
      <Toggle label="เงาด้านใน" checked={Boolean(style.innerShadow)} onChange={(on) => set('innerShadow', on ? LAYER_DEFAULTS.innerShadow : null)} />
      {style.innerShadow && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl bg-surface-muted p-3">
          <RangeField label="ความกว้างเงา" value={style.innerShadow.size} min={0.5} max={15} step={0.5} onChange={(v) => set('innerShadow', { ...style.innerShadow!, size: v })} />
          <RangeField label="ความเข้มเงา" value={style.innerShadow.opacity} min={0} max={100} onChange={(v) => set('innerShadow', { ...style.innerShadow!, opacity: v })} />
          <ColorInput label="สีเงา" value={style.innerShadow.color} onChange={(c) => set('innerShadow', { ...style.innerShadow!, color: c })} />
        </div>
      )}
    </section>
  );
}
