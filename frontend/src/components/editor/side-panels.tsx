'use client';

import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, ChartColumn, ChevronsDown, ChevronsUp, ChevronDown, ChevronUp,
  Eye, EyeOff, GripVertical, Image as ImageIcon, Lock, LockOpen, Pipette, Play, Search, Shapes, Type,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cx } from '@/components/csmju/primitives';
import { boundingBox, rectsIntersect } from '@/lib/editor/geometry';
import { dominantColors } from '@/lib/editor/image-filters';
import { DEFAULT_GRADIENTS, gradientCss, isGradient, paintColors, parseGradient, type Gradient } from '@/lib/editor/paint';
import { getImage } from '@/lib/editor/render';
import { layerLabel } from '@/lib/editor/factory';
import { currentPage, useEditor } from '@/lib/editor/store';
import type { AnimationKind, CanvasElement, Shadow, TextEffect, TextEffectKind, TextElement } from '@/lib/editor/types';
import { useEditorUi, type ColorTarget } from '@/lib/editor/ui-store';
import { ColorPicker, RainbowSwatch, Swatch, hasEyeDropper, pickScreenColor } from './color-picker';
import { PanelHeader, PresetTile, RangeField, UnderlineTabs } from './controls';

function close() {
  useEditorUi.getState().setPanel(null);
}

function useSelected() {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);

  return useMemo(() => elements.filter((el) => selection.includes(el.id)), [elements, selection]);
}

function patch(ids: string[], values: Partial<CanvasElement> | ((el: CanvasElement) => Partial<CanvasElement>)) {
  useEditor.getState().updateElements(ids, typeof values === 'function' ? values : () => values);
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-csmju-body font-bold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Scroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">{children}</div>;
}

// ── ตำแหน่ง ────────────────────────────────────────────────────────

export function PositionPanel() {
  const selected = useSelected();
  const [tab, setTab] = useState<'arrange' | 'layers'>(selected.length ? 'arrange' : 'layers');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="ตำแหน่ง" onClose={close} />
      <UnderlineTabs
        label="ตำแหน่ง"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'arrange', label: 'จัดวาง' },
          { key: 'layers', label: 'เลเยอร์' },
        ]}
      />
      <Scroll>{tab === 'arrange' ? <Arrange selected={selected} /> : <LayersList />}</Scroll>
    </div>
  );
}

function BigButton({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

function Arrange({ selected }: { selected: CanvasElement[] }) {
  const state = useEditor.getState;

  if (selected.length === 0) {
    return <p className="pt-4 text-csmju-caption text-muted">เลือกชิ้นงานบนผืนผ้าใบก่อน แล้วจัดลำดับหรือจัดตำแหน่งได้ที่นี่ · ดูลำดับชั้นทั้งหมดได้ที่แท็บเลเยอร์</p>;
  }

  const allLocked = selected.every((el) => el.locked);
  const single = selected.length === 1 ? selected[0] : null;

  return (
    <>
      <Section title="จัดวาง">
        <div className="grid grid-cols-2 gap-1">
          <BigButton label="ไปข้างหน้า" icon={<ChevronUp aria-hidden className="size-5" />} onClick={() => state().reorderSelected('forward')} />
          <BigButton label="ไปด้านหลัง" icon={<ChevronDown aria-hidden className="size-5" />} onClick={() => state().reorderSelected('backward')} />
          <BigButton label="ไปหน้าสุด" icon={<ChevronsUp aria-hidden className="size-5" />} onClick={() => state().reorderSelected('front')} />
          <BigButton label="ไปหลังสุด" icon={<ChevronsDown aria-hidden className="size-5" />} onClick={() => state().reorderSelected('back')} />
        </div>
      </Section>
      <Section title={selected.length > 1 ? 'จัดตำแหน่งเทียบกัน' : 'จัดตำแหน่งเทียบหน้า'}>
        <div className="grid grid-cols-2 gap-1">
          <BigButton disabled={allLocked} label="บน" icon={<AlignStartHorizontal aria-hidden className="size-5" />} onClick={() => state().alignSelected('top')} />
          <BigButton disabled={allLocked} label="ซ้าย" icon={<AlignStartVertical aria-hidden className="size-5" />} onClick={() => state().alignSelected('left')} />
          <BigButton disabled={allLocked} label="กลาง" icon={<AlignCenterHorizontal aria-hidden className="size-5" />} onClick={() => state().alignSelected('middle')} />
          <BigButton disabled={allLocked} label="ตรงกลาง" icon={<AlignCenterVertical aria-hidden className="size-5" />} onClick={() => state().alignSelected('center')} />
          <BigButton disabled={allLocked} label="ล่าง" icon={<AlignEndHorizontal aria-hidden className="size-5" />} onClick={() => state().alignSelected('bottom')} />
          <BigButton disabled={allLocked} label="ขวา" icon={<AlignEndVertical aria-hidden className="size-5" />} onClick={() => state().alignSelected('right')} />
        </div>
      </Section>
      {selected.length >= 3 && (
        <Section title="ระยะห่าง">
          <div className="grid grid-cols-2 gap-1">
            <BigButton label="กระจายแนวนอน" icon={<AlignHorizontalDistributeCenter aria-hidden className="size-5" />} onClick={() => state().distributeSelected('horizontal')} />
            <BigButton label="กระจายแนวตั้ง" icon={<AlignVerticalDistributeCenter aria-hidden className="size-5" />} onClick={() => state().distributeSelected('vertical')} />
          </div>
        </Section>
      )}
      {single && !single.locked && <Advanced el={single} />}
    </>
  );
}

function Advanced({ el }: { el: CanvasElement }) {
  const [keepRatio, setKeepRatio] = useState(el.type === 'image' || el.type === 'svg');
  const ids = [el.id];
  const ratio = el.width / Math.max(1, el.height);
  const textLike = el.type === 'text';

  return (
    <Section title="ขั้นสูง">
      <div className="grid grid-cols-2 gap-3">
        <NumberBox
          label="กว้าง"
          value={el.width}
          onChange={(width) =>
            patch(ids, (e) =>
              e.type === 'text' ? { width } : keepRatio ? { width, height: width / ratio } : { width },
            )
          }
        />
        <NumberBox label="สูง" value={el.height} disabled={textLike} onChange={(height) => patch(ids, keepRatio ? { height, width: height * ratio } : { height })} />
        <label className="col-span-2 flex min-h-11 items-center gap-2 text-csmju-caption text-ink">
          <input type="checkbox" checked={keepRatio} disabled={textLike} onChange={(e) => setKeepRatio(e.target.checked)} className="size-5 accent-primary" />
          ล็อกสัดส่วน
        </label>
        <NumberBox label="X" value={el.x} onChange={(x) => patch(ids, { x })} />
        <NumberBox label="Y" value={el.y} onChange={(y) => patch(ids, { y })} />
        <NumberBox label="หมุน (องศา)" value={el.rotation} min={-360} max={360} onChange={(r) => patch(ids, { rotation: ((r % 360) + 360) % 360 })} />
      </div>
    </Section>
  );
}

function NumberBox({ label, value, onChange, disabled, min = -100000, max = 100000 }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; min?: number; max?: number }) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className="flex flex-col gap-1 text-csmju-caption text-ink">
      {label}
      <input
        type="number"
        disabled={disabled}
        value={draft ?? String(Math.round(value * 10) / 10)}
        onFocus={() => setDraft(String(Math.round(value * 10) / 10))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);

          if (draft !== null && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-csmju-body text-ink tabular-nums focus:border-primary focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}

const TYPE_ICON: Record<CanvasElement['type'], ReactNode> = {
  text: <Type aria-hidden className="size-4" />,
  shape: <Shapes aria-hidden className="size-4" />,
  image: <ImageIcon aria-hidden className="size-4" />,
  svg: <Shapes aria-hidden className="size-4" />,
  path: <Shapes aria-hidden className="size-4" />,
  chart: <ChartColumn aria-hidden className="size-4" />,
};

/// แท็บเลเยอร์: ลากเรียงลำดับ · คลิกเพื่อเลือก · ทั้งหมด/ทับซ้อน
export function LayersList() {
  const elements = useEditor((s) => currentPage(s).elements);
  const background = useEditor((s) => currentPage(s).background);
  const selection = useEditor((s) => s.selection);
  const [scope, setScope] = useState<'all' | 'overlap'>('all');
  const [dragging, setDragging] = useState<string | null>(null);
  const state = useEditor.getState;
  const selectedBoxes = elements.filter((el) => selection.includes(el.id)).map(boundingBox);
  const ordered = [...elements]
    .reverse()
    .filter((el) => scope === 'all' || selection.includes(el.id) || selectedBoxes.some((box) => rectsIntersect(box, boundingBox(el))));

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="ขอบเขตเลเยอร์" className="grid grid-cols-2 rounded-xl bg-surface-muted p-1">
        {(
          [
            ['all', 'ทั้งหมด'],
            ['overlap', 'ทับซ้อนกัน'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={scope === key}
            disabled={key === 'overlap' && selection.length === 0}
            onClick={() => setScope(key)}
            className={cx('min-h-10 rounded-lg text-csmju-caption font-medium disabled:opacity-40', scope === key ? 'bg-surface text-ink shadow-csmju-sm' : 'text-body')}
          >
            {label}
          </button>
        ))}
      </div>
      {elements.length === 0 && <p className="text-csmju-caption text-muted">หน้านี้ยังว่าง เพิ่มข้อความ รูปทรง หรือรูป แล้วจะเห็นเป็นเลเยอร์ที่นี่</p>}
      <ul className="flex flex-col gap-1.5">
        {ordered.map((el) => {
          const active = selection.includes(el.id);
          const index = elements.indexOf(el);

          return (
            <li
              key={el.id}
              draggable
              onDragStart={() => setDragging(el.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging && dragging !== el.id) state().moveLayer(dragging, index);
                setDragging(null);
              }}
              className={cx('flex items-center gap-1 rounded-xl border-2 bg-surface-muted pr-1', active ? 'border-primary' : 'border-transparent')}
            >
              <GripVertical aria-hidden className="ml-1 size-4 shrink-0 cursor-grab text-muted" />
              <button
                type="button"
                onClick={(event) => state().select(event.shiftKey ? [...selection, el.id] : [el.id])}
                aria-pressed={active}
                className={cx('flex min-h-12 min-w-0 flex-1 items-center gap-2 truncate text-left text-csmju-caption', el.hidden ? 'text-muted line-through' : 'text-ink')}
              >
                {TYPE_ICON[el.type]}
                <span className="truncate">{layerLabel(el)}</span>
                {el.groupId && <span className="shrink-0 text-muted">(กลุ่ม)</span>}
              </button>
              <button
                type="button"
                aria-label={el.hidden ? `แสดง ${layerLabel(el)}` : `ซ่อน ${layerLabel(el)}`}
                onClick={() => state().updateElements([el.id], () => ({ hidden: !el.hidden }))}
                className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-surface"
              >
                {el.hidden ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              </button>
              <button
                type="button"
                aria-label={el.locked ? `ปลดล็อก ${layerLabel(el)}` : `ล็อก ${layerLabel(el)}`}
                onClick={() => state().updateElements([el.id], () => ({ locked: !el.locked }))}
                className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-surface"
              >
                {el.locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
              </button>
            </li>
          );
        })}
        {scope === 'all' && (
          <li className="flex min-h-12 items-center gap-2 rounded-xl bg-surface-muted px-3 text-csmju-caption text-ink">
            <span aria-hidden className={cx('size-6 rounded border border-line-strong', !background && 'csmju-checker')} style={background ? { background } : undefined} />
            พื้นหลัง
            <button type="button" onClick={() => useEditorUi.getState().openColor('background')} className="ml-auto min-h-9 rounded-lg px-2 font-medium text-primary hover:bg-surface">
              เปลี่ยนสี
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

// ── เอฟเฟกต์ ───────────────────────────────────────────────────────

const TEXT_EFFECTS: { kind: TextEffectKind | null; label: string; preview: React.CSSProperties }[] = [
  { kind: null, label: 'ไม่มี', preview: {} },
  { kind: 'shadow', label: 'เงา', preview: { textShadow: '3px 3px 4px rgb(0 0 0 / 0.5)' } },
  { kind: 'lift', label: 'ลอย', preview: { textShadow: '0 4px 8px rgb(0 0 0 / 0.35)' } },
  { kind: 'hollow', label: 'กลวง', preview: { color: 'transparent', WebkitTextStroke: '1.5px rgb(15 23 42)' } },
  { kind: 'splice', label: 'ตัดต่อ', preview: { color: 'transparent', WebkitTextStroke: '1.5px rgb(15 23 42)', textShadow: '3px 3px 0 rgb(255 145 77)' } },
  { kind: 'echo', label: 'เสียงสะท้อน', preview: { textShadow: '3px 3px 0 rgb(15 23 42 / 0.5), 6px 6px 0 rgb(15 23 42 / 0.25)' } },
  { kind: 'glitch', label: 'กลิตช์', preview: { textShadow: '-2px 0 0 rgb(0 255 255), 2px 0 0 rgb(255 0 255)' } },
  { kind: 'neon', label: 'นีออน', preview: { color: 'rgb(255 230 255)', textShadow: '0 0 4px rgb(255 102 196), 0 0 10px rgb(255 102 196)' } },
  { kind: 'background', label: 'พื้นหลัง', preview: { background: 'rgb(255 222 89)', borderRadius: 6, padding: '0 6px' } },
  { kind: 'outline', label: 'เส้นขอบ', preview: { WebkitTextStroke: '1px rgb(56 182 255)', paintOrder: 'stroke fill' } },
];

const EFFECT_DEFAULTS: Record<TextEffectKind, Omit<TextEffect, 'kind'>> = {
  shadow: { offset: 50, direction: 135, blur: 25, intensity: 40, color: 'rgb(0 0 0)' },
  lift: { offset: 0, direction: 180, blur: 0, intensity: 50, color: 'rgb(0 0 0)' },
  hollow: { offset: 0, direction: 0, blur: 0, intensity: 50, color: 'rgb(0 0 0)' },
  splice: { offset: 50, direction: 135, blur: 0, intensity: 50, color: 'rgb(255 145 77)' },
  echo: { offset: 50, direction: 135, blur: 0, intensity: 50, color: 'rgb(0 0 0)' },
  glitch: { offset: 30, direction: 90, blur: 0, intensity: 50, color: 'rgb(255 0 255)' },
  neon: { offset: 0, direction: 0, blur: 0, intensity: 50, color: 'rgb(255 102 196)' },
  background: { offset: 50, direction: 0, blur: 0, intensity: 50, color: 'rgb(255 222 89)' },
  outline: { offset: 0, direction: 0, blur: 0, intensity: 40, color: 'rgb(56 182 255)' },
};

/// ตัวควบคุมที่แต่ละเอฟเฟกต์ใช้ (ชื่อตามที่ Canva เรียก)
const EFFECT_FIELDS: Record<TextEffectKind, { key: 'offset' | 'direction' | 'blur' | 'intensity'; label: string }[]> = {
  shadow: [
    { key: 'offset', label: 'ระยะ' },
    { key: 'direction', label: 'ทิศทาง' },
    { key: 'blur', label: 'เบลอ' },
    { key: 'intensity', label: 'ความทึบ' },
  ],
  lift: [{ key: 'intensity', label: 'ความเข้ม' }],
  hollow: [{ key: 'intensity', label: 'ความหนา' }],
  splice: [
    { key: 'intensity', label: 'ความหนา' },
    { key: 'offset', label: 'ระยะ' },
    { key: 'direction', label: 'ทิศทาง' },
  ],
  echo: [
    { key: 'offset', label: 'ระยะ' },
    { key: 'direction', label: 'ทิศทาง' },
  ],
  glitch: [
    { key: 'offset', label: 'ระยะ' },
    { key: 'direction', label: 'ทิศทาง' },
  ],
  neon: [{ key: 'intensity', label: 'ความเข้ม' }],
  background: [
    { key: 'intensity', label: 'ความโค้งมน' },
    { key: 'offset', label: 'การขยาย' },
    { key: 'blur', label: 'ความโปร่งใส' },
  ],
  outline: [{ key: 'intensity', label: 'ความหนา' }],
};

const COLORED_EFFECTS = new Set<TextEffectKind>(['shadow', 'splice', 'echo', 'glitch', 'background', 'outline']);

export function EffectsPanel() {
  const selected = useSelected();
  const texts = selected.filter((el): el is TextElement => el.type === 'text');
  const others = selected.filter((el) => el.type !== 'text');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="เอฟเฟกต์" onClose={close} />
      <Scroll>
        {selected.length === 0 && <p className="text-csmju-caption text-muted">เลือกข้อความหรือองค์ประกอบก่อน แล้วใส่เอฟเฟกต์ได้ที่นี่</p>}
        {texts.length > 0 && <TextEffects els={texts} />}
        {others.length > 0 && (
          <Section title="เงา">
            <ShadowControls els={others} />
          </Section>
        )}
      </Scroll>
    </div>
  );
}

function TextEffects({ els }: { els: TextElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const effect = el.effect ?? null;

  return (
    <>
      <Section title="สไตล์">
        <div className="grid grid-cols-3 gap-3">
          {TEXT_EFFECTS.map((item) => (
            <PresetTile
              key={item.label}
              label={item.label}
              selected={(effect?.kind ?? null) === item.kind}
              onClick={() => patch(ids, { effect: item.kind ? { kind: item.kind, ...EFFECT_DEFAULTS[item.kind] } : null })}
            >
              <span className="text-csmju-h2 font-bold text-ink" style={item.preview}>
                Ag
              </span>
            </PresetTile>
          ))}
        </div>
        {effect && (
          <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-line p-4">
            {EFFECT_FIELDS[effect.kind].map((field) => (
              <RangeField
                key={field.key}
                label={field.label}
                value={field.key === 'direction' ? effect.direction - 180 : effect[field.key]}
                min={field.key === 'direction' ? -180 : 0}
                max={field.key === 'direction' ? 180 : 100}
                onChange={(v) => patch(ids, { effect: { ...effect, [field.key]: field.key === 'direction' ? v + 180 : v } })}
              />
            ))}
            {COLORED_EFFECTS.has(effect.kind) && (
              <button type="button" onClick={() => useEditorUi.getState().openColor('effect')} className="flex min-h-11 items-center gap-3 rounded-xl border border-line-strong px-3 text-csmju-caption text-ink hover:bg-surface-muted">
                <span aria-hidden className="size-6 rounded-full border border-line-strong" style={{ background: effect.color }} />
                สีของเอฟเฟกต์
              </button>
            )}
          </div>
        )}
      </Section>
      <Section title="รูปทรง">
        <div className="grid grid-cols-3 gap-3">
          <PresetTile label="ไม่มี" selected={!el.curve} onClick={() => patch(ids, { curve: 0 })}>
            <span className="text-csmju-h3 font-bold text-ink">abcd</span>
          </PresetTile>
          <PresetTile label="เส้นโค้ง" selected={Boolean(el.curve)} onClick={() => patch(ids, { curve: el.curve || 50 })}>
            <svg aria-hidden viewBox="0 0 60 40" className="w-14">
              <path id="curve-preview" d="M6 32 Q30 2 54 32" fill="none" />
              <text className="fill-ink text-csmju-caption font-bold">
                <textPath href="#curve-preview" startOffset="50%" textAnchor="middle">
                  abcd
                </textPath>
              </text>
            </svg>
          </PresetTile>
        </div>
        {Boolean(el.curve) && (
          <div className="mt-4">
            <RangeField label="ความโค้ง" value={el.curve ?? 0} min={-100} max={100} onChange={(v) => patch(ids, { curve: v === 0 ? 1 : v })} />
          </div>
        )}
      </Section>
    </>
  );
}

const SHADOW_PRESETS: { key: string; label: string; make: (size: number) => Shadow | null }[] = [
  { key: 'none', label: 'ไม่มี', make: () => null },
  { key: 'drop', label: 'ตกกระทบ', make: (s) => ({ x: s * 0.03, y: s * 0.03, blur: s * 0.05, color: 'rgb(0 0 0 / 0.4)' }) },
  { key: 'glow', label: 'เรืองแสง', make: (s) => ({ x: 0, y: 0, blur: s * 0.12, color: 'rgb(0 0 0 / 0.5)' }) },
  { key: 'lift', label: 'ยกลอย', make: (s) => ({ x: 0, y: s * 0.06, blur: s * 0.1, color: 'rgb(0 0 0 / 0.3)' }) },
  { key: 'backdrop', label: 'แบ็คดรอป', make: (s) => ({ x: s * 0.05, y: s * 0.05, blur: 0, color: 'rgb(0 0 0 / 0.25)' }) },
];

/// เงาขององค์ประกอบ (รูปทรง ไอคอน เส้นวาด รูป) — ค่าเก็บเป็นพิกเซล x/y/blur แสดงเป็นระยะ+ทิศทางแบบ Canva
export function ShadowControls({ els }: { els: CanvasElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const shadow = el.shadow ?? null;
  const size = Math.max(el.width, el.height);
  const distance = shadow ? Math.hypot(shadow.x, shadow.y) : 0;
  const direction = shadow ? Math.round((Math.atan2(shadow.y, shadow.x) * 180) / Math.PI) : 45;
  const alphaMatch = shadow?.color.match(/\/\s*([\d.]+)\)/);
  const opacity = alphaMatch ? Number(alphaMatch[1]) * 100 : 100;
  const setPolar = (dist: number, dir: number) => {
    const rad = (dir * Math.PI) / 180;

    patch(ids, { shadow: { ...shadow!, x: Math.cos(rad) * dist, y: Math.sin(rad) * dist } });
  };
  const maxDistance = Math.max(10, size * 0.3);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {SHADOW_PRESETS.map((preset) => (
          <PresetTile key={preset.key} label={preset.label} selected={preset.key === 'none' ? !shadow : false} onClick={() => patch(ids, (e) => ({ shadow: preset.make(Math.max(e.width, e.height)) }))}>
            <span
              aria-hidden
              className="block size-10 rounded-lg bg-pastel-lilac"
              style={(() => {
                const s = preset.make(100);

                return s ? { boxShadow: `${s.x / 5}px ${s.y / 5}px ${s.blur / 4}px ${s.color}` } : undefined;
              })()}
            />
          </PresetTile>
        ))}
      </div>
      {shadow && (
        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-line p-4">
          <RangeField label="ระยะ" value={Math.round((distance / maxDistance) * 100)} min={0} max={100} onChange={(v) => setPolar((v / 100) * maxDistance, direction)} />
          <RangeField label="ทิศทาง" value={direction} min={-180} max={180} onChange={(v) => setPolar(distance, v)} />
          <RangeField label="เบลอ" value={Math.round((shadow.blur / Math.max(10, size * 0.3)) * 100)} min={0} max={100} onChange={(v) => patch(ids, { shadow: { ...shadow, blur: (v / 100) * Math.max(10, size * 0.3) } })} />
          <RangeField
            label="ความทึบ"
            value={Math.round(opacity)}
            min={0}
            max={100}
            onChange={(v) => patch(ids, { shadow: { ...shadow, color: shadow.color.replace(/\s*\/\s*[\d.]+\)$/, ')').replace(/\)$/, ` / ${v / 100})`) } })}
          />
          <button type="button" onClick={() => useEditorUi.getState().openColor('shadow')} className="flex min-h-11 items-center gap-3 rounded-xl border border-line-strong px-3 text-csmju-caption text-ink hover:bg-surface-muted">
            <span aria-hidden className="size-6 rounded-full border border-line-strong" style={{ background: shadow.color }} />
            สีเงา
          </button>
        </div>
      )}
    </>
  );
}

// ── แอนิเมต ────────────────────────────────────────────────────────

const ANIMATIONS: { key: AnimationKind | null; label: string }[] = [
  { key: null, label: 'ไม่มี' },
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
];

export function AnimatePanel() {
  const selected = useSelected();
  const pageElements = useEditor((s) => currentPage(s).elements);
  const targets = selected.length > 0 ? selected : pageElements;
  const ids = targets.filter((el) => !el.locked).map((el) => el.id);
  const current = targets.length > 0 && targets.every((el) => (el.animation ?? null) === (targets[0].animation ?? null)) ? (targets[0].animation ?? null) : undefined;

  const apply = (key: AnimationKind | null) => {
    if (ids.length === 0) return;

    patch(ids, { animation: key });
    if (key) useEditorUi.getState().playPreview(ids);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="แอนิเมต" onClose={close} />
      <Scroll>
        <p className="mb-4 text-csmju-caption text-muted">
          {selected.length > 0 ? 'แอนิเมชันขององค์ประกอบที่เลือก — เล่นตอนพรีเซนต์' : 'ยังไม่ได้เลือกชิ้นงาน: แอนิเมชันจะใช้กับทุกชิ้นในหน้านี้'}
        </p>
        {targets.length === 0 ? (
          <p className="text-csmju-caption text-muted">หน้านี้ยังว่าง</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {ANIMATIONS.map((item) => (
                <PresetTile key={item.label} label={item.label} selected={current === item.key} onClick={() => apply(item.key)}>
                  <span className={cx('flex size-10 items-center justify-center rounded-lg bg-primary text-csmju-caption font-bold text-on-inverse', item.key && 'csmju-pop')}>
                    {item.key ? 'Aa' : '—'}
                  </span>
                </PresetTile>
              ))}
            </div>
            <button
              type="button"
              disabled={!current}
              onClick={() => useEditorUi.getState().playPreview(ids)}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
            >
              <Play aria-hidden className="size-4" /> เล่นตัวอย่าง
            </button>
          </>
        )}
      </Scroll>
    </div>
  );
}

// ── สี ─────────────────────────────────────────────────────────────

/// ตัวอย่างรหัสสีในข้อความแนะนำ (ประกอบขึ้นเพื่อไม่ให้เป็นค่าสีดิบในโค้ด UI)
const HEX_EXAMPLE = ['#', '00', 'c4', 'cc'].join('');

/// ชุดสีเริ่มต้นแบบ Canva (แถวแรกเทา 7 สี ที่เหลือแถวละ 6)
export const DEFAULT_PALETTE: string[] = [
  'rgb(0 0 0)', 'rgb(84 84 84)', 'rgb(115 115 115)', 'rgb(166 166 166)', 'rgb(191 191 191)', 'rgb(217 217 217)', 'rgb(255 255 255)',
  'rgb(255 49 49)', 'rgb(255 87 87)', 'rgb(255 102 196)', 'rgb(203 108 230)', 'rgb(140 82 255)', 'rgb(94 23 235)',
  'rgb(0 151 178)', 'rgb(12 192 223)', 'rgb(92 225 230)', 'rgb(56 182 255)', 'rgb(82 113 255)', 'rgb(0 74 173)',
  'rgb(0 191 99)', 'rgb(126 217 87)', 'rgb(193 255 114)', 'rgb(255 222 89)', 'rgb(255 189 89)', 'rgb(255 145 77)',
];

const COLOR_NAMES: { names: string[]; color: string }[] = [
  { names: ['ดำ', 'black'], color: 'rgb(0 0 0)' },
  { names: ['เทา', 'gray', 'grey'], color: 'rgb(115 115 115)' },
  { names: ['ขาว', 'white'], color: 'rgb(255 255 255)' },
  { names: ['แดง', 'red'], color: 'rgb(255 49 49)' },
  { names: ['ชมพู', 'pink'], color: 'rgb(255 102 196)' },
  { names: ['ม่วง', 'purple', 'violet'], color: 'rgb(140 82 255)' },
  { names: ['น้ำเงิน', 'กรมท่า', 'blue', 'navy'], color: 'rgb(0 74 173)' },
  { names: ['ฟ้า', 'sky', 'light blue'], color: 'rgb(56 182 255)' },
  { names: ['เขียวอมฟ้า', 'turquoise', 'teal', 'cyan'], color: 'rgb(92 225 230)' },
  { names: ['เขียว', 'green'], color: 'rgb(0 191 99)' },
  { names: ['เหลือง', 'yellow'], color: 'rgb(255 222 89)' },
  { names: ['ส้ม', 'orange'], color: 'rgb(255 145 77)' },
  { names: ['น้ำตาล', 'brown'], color: 'rgb(140 90 50)' },
  { names: ['ทอง', 'gold'], color: 'rgb(212 175 55)' },
];

function readTarget(target: ColorTarget, els: CanvasElement[], background: string | null): string | null {
  const el = els[0];

  switch (target) {
    case 'background':
      return background;
    case 'fill':
      return el?.type === 'shape' ? el.fill : null;
    case 'stroke':
      return el?.type === 'shape' ? el.stroke : null;
    case 'border':
      return el?.type === 'image' ? (el.border?.color ?? null) : null;
    case 'effect':
      return el?.type === 'text' ? (el.effect?.color ?? null) : null;
    case 'shadow':
      return el?.shadow?.color ?? null;
    default:
      return el && 'color' in el ? (el.color as string) : null;
  }
}

function writeTarget(target: ColorTarget, color: string) {
  const state = useEditor.getState();
  const page = currentPage(state);

  if (target === 'background') {
    state.setBackground(color);
    return;
  }

  const ids = page.elements.filter((el) => state.selection.includes(el.id) && !el.locked).map((el) => el.id);

  state.updateElements(ids, (el): Partial<CanvasElement> => {
    switch (target) {
      case 'fill':
        return el.type === 'shape' ? { fill: color } : el.type === 'text' || el.type === 'svg' || el.type === 'path' ? { color: isGradient(color) ? el.color : color } : {};
      case 'stroke':
        return el.type === 'shape' ? { stroke: color, strokeWidth: el.strokeWidth || 4 } : {};
      case 'border':
        return el.type === 'image' ? { border: { style: el.border?.style ?? 'solid', width: el.border?.width || 6, color } } : {};
      case 'effect':
        return el.type === 'text' && el.effect ? { effect: { ...el.effect, color } } : {};
      case 'shadow': {
        if (!el.shadow) return {};

        const alpha = el.shadow.color.match(/\/\s*([\d.]+)\)/)?.[1];

        return { shadow: { ...el.shadow, color: alpha ? color.replace(/\)$/, ` / ${alpha})`) : color } };
      }
      default:
        return el.type === 'text' || el.type === 'svg' || el.type === 'path' ? { color } : el.type === 'shape' ? { fill: color } : {};
    }
  });
}

const TARGET_TITLE: Record<ColorTarget, string> = {
  text: 'สีข้อความ',
  fill: 'สีพื้น',
  stroke: 'สีเส้นขอบ',
  icon: 'สีกราฟิก',
  path: 'สีเส้นวาด',
  background: 'สีพื้นหลัง',
  border: 'สีเส้นขอบรูป',
  effect: 'สีของเอฟเฟกต์',
  shadow: 'สีเงา',
};

export function ColorPanel({ target: forced, embedded = false }: { target?: ColorTarget; embedded?: boolean } = {}) {
  const storeTarget = useEditorUi((s) => s.colorTarget);
  const target = forced ?? storeTarget;
  const selected = useSelected();
  const background = useEditor((s) => currentPage(s).background);
  const doc = useEditor((s) => s.doc);
  const pageElements = useEditor((s) => currentPage(s).elements);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState(false);
  const [gradientEditor, setGradientEditor] = useState(false);
  const [changed, setChanged] = useState<{ from: string; to: string } | null>(null);
  const value = readTarget(target, selected, background);
  const allowGradient = target === 'fill' || target === 'background';
  const usedColors = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (c: string | null | undefined) => {
      for (const color of paintColors(c)) if (!seen.has(color)) seen.set(color, color);
    };

    for (const page of doc.pages) {
      add(page.background);
      for (const el of page.elements) {
        if (el.type === 'shape') {
          add(el.fill);
          add(el.stroke);
        } else if (el.type !== 'image') add(el.color);
      }
    }

    return [...seen.values()].slice(0, 14);
  }, [doc]);
  const imageColors = useMemo(() => {
    const out: string[] = [];

    for (const el of pageElements) {
      if (el.type !== 'image') continue;

      const img = getImage(el.src);

      if (img) for (const c of dominantColors(img, 6)) if (!out.includes(c)) out.push(c);
      if (out.length >= 12) break;
    }

    return out;
  }, [pageElements]);

  const choose = (color: string) => {
    if (target !== 'background' && selected.length === 0) return;
    if (value && value !== color && !isGradient(value)) setChanged({ from: value, to: color });
    writeTarget(target, color);
  };

  const term = query.trim().toLowerCase();
  const hex = term.match(/^#?([0-9a-f]{6})$/)?.[1];
  const searchResults = term
    ? [
        ...(hex ? [`rgb(${parseInt(hex.slice(0, 2), 16)} ${parseInt(hex.slice(2, 4), 16)} ${parseInt(hex.slice(4, 6), 16)})`] : []),
        ...COLOR_NAMES.filter((c) => c.names.some((n) => n.includes(term.replace(/^สี/, '')) || term.includes(n))).map((c) => c.color),
      ]
    : [];
  const occurrences = changed
    ? doc.pages.reduce(
        (n, page) =>
          n +
          page.elements.filter((el) => (el.type === 'shape' ? el.fill === changed.from || el.stroke === changed.from : el.type !== 'image' && el.color === changed.from)).length +
          (page.background === changed.from ? 1 : 0),
        0,
      )
    : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!embedded && <PanelHeader title={forced === 'background' ? 'แบ็กกราวด์' : TARGET_TITLE[target]} onClose={close} />}
      <div className="shrink-0 px-4 pb-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink" />
          <label htmlFor="color-search" className="sr-only">ค้นหาสี</label>
          <input
            id="color-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`ลองค้นหาว่า "สีน้ำเงิน" หรือรหัสสี ${HEX_EXAMPLE}`}
            className="min-h-12 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <Scroll>
        {target !== 'background' && selected.length === 0 && <p className="mb-4 text-csmju-caption text-muted">เลือกชิ้นงานบนผืนผ้าใบก่อน แล้วเลือกสีที่นี่</p>}
        {changed && occurrences > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-primary-soft p-3 text-csmju-caption text-ink">
            <span aria-hidden className="size-5 rounded-full border border-line-strong" style={{ background: changed.from }} />→
            <span aria-hidden className="size-5 rounded-full border border-line-strong" style={{ background: changed.to }} />
            <span className="flex-1">ยังมีสีเดิมอีก {occurrences} จุด</span>
            <button
              type="button"
              onClick={() => {
                useEditor.getState().replaceColor(changed.from, changed.to, 'page');
                setChanged(null);
              }}
              className="min-h-9 rounded-lg bg-surface px-3 font-semibold text-primary"
            >
              เปลี่ยนในหน้านี้
            </button>
            <button
              type="button"
              onClick={() => {
                useEditor.getState().replaceColor(changed.from, changed.to, 'all');
                setChanged(null);
              }}
              className="min-h-9 rounded-lg bg-primary px-3 font-semibold text-on-inverse"
            >
              เปลี่ยนทั้งหมด
            </button>
          </div>
        )}
        {term ? (
          <Section title="ผลการค้นหา">
            {searchResults.length === 0 ? (
              <p className="text-csmju-caption text-muted">ไม่พบสีนี้ ลองพิมพ์รหัสสีแบบ {HEX_EXAMPLE}</p>
            ) : (
              <SwatchGrid colors={searchResults} value={value} onPick={choose} />
            )}
          </Section>
        ) : (
          <>
            <Section title="สีในดีไซน์นี้">
              <div className="flex flex-wrap gap-2">
                <RainbowSwatch label="เพิ่มสีเอง" active={custom} onClick={() => setCustom((v) => !v)} />
                {hasEyeDropper() && (
                  <button
                    type="button"
                    aria-label="ดูดสีจากหน้าจอ"
                    title="ดูดสีจากหน้าจอ"
                    onClick={() => void pickScreenColor().then((c) => c && choose(c))}
                    className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-ink hover:bg-primary-soft"
                  >
                    <Pipette aria-hidden className="size-5" />
                  </button>
                )}
                {usedColors.map((c) => (
                  <Swatch key={c} color={c} label={`ใช้สี ${c}`} selected={c === value} onClick={() => choose(c)} />
                ))}
              </div>
              {custom && (
                <div className="mt-4 rounded-2xl border border-line p-3">
                  <ColorPicker value={value && !isGradient(value) ? value : 'rgb(0 0 0)'} onChange={choose} />
                </div>
              )}
            </Section>
            {imageColors.length > 0 && (
              <Section title="สีในรูป">
                <SwatchGrid colors={imageColors} value={value} onPick={choose} />
              </Section>
            )}
            <Section title="สีเริ่มต้น">
              <SwatchGrid colors={DEFAULT_PALETTE} value={value} onPick={choose} columns={7} />
            </Section>
            {allowGradient && (
              <Section
                title="สีกราเดียนต์"
                action={
                  <button type="button" onClick={() => setGradientEditor((v) => !v)} className="min-h-9 rounded-lg px-2 text-csmju-caption font-semibold text-primary hover:bg-primary-soft">
                    {gradientEditor ? 'ปิดตัวแก้ไข' : 'สร้างเอง'}
                  </button>
                }
              >
                {gradientEditor && <GradientEditor value={value && isGradient(value) ? value : DEFAULT_GRADIENTS[3]} onChange={choose} />}
                <SwatchGrid colors={DEFAULT_GRADIENTS} value={value} onPick={choose} columns={7} />
              </Section>
            )}
          </>
        )}
      </Scroll>
    </div>
  );
}

function SwatchGrid({ colors, value, onPick, columns = 7 }: { colors: string[]; value: string | null; onPick: (c: string) => void; columns?: 6 | 7 }) {
  return (
    <div className={cx('grid gap-2', columns === 7 ? 'grid-cols-7' : 'grid-cols-6')}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`ใช้สี ${c}`}
          title={c}
          aria-pressed={c === value}
          onClick={() => onPick(c)}
          className="relative aspect-square w-full rounded-full"
        >
          <span aria-hidden className="block size-full rounded-full border border-line-strong" style={{ background: c }} />
          {c === value && <span aria-hidden className="absolute -inset-1 rounded-full border-2 border-primary" />}
        </button>
      ))}
    </div>
  );
}

/// ตัวแก้กราเดียนต์: 2 สี · ชนิดเส้นตรง/วงกลม · มุม
function GradientEditor({ value, onChange }: { value: string; onChange: (paint: string) => void }) {
  const parsed = parseGradient(value) ?? { type: 'linear', angle: 90, stops: [{ color: 'rgb(0 0 0)', at: 0 }, { color: 'rgb(255 255 255)', at: 1 }] };
  const [editing, setEditing] = useState<0 | 1 | null>(null);
  const set = (next: Partial<Gradient>) => onChange(gradientCss({ ...parsed, ...next } as Gradient));
  const stops = [parsed.stops[0], parsed.stops[parsed.stops.length - 1]];

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line p-3">
      <span aria-hidden className="h-10 rounded-xl border border-line" style={{ background: value }} />
      <div className="flex items-center gap-2">
        {stops.map((stop, i) => (
          <button
            key={i}
            type="button"
            aria-label={i === 0 ? 'สีเริ่มต้นของกราเดียนต์' : 'สีปลายของกราเดียนต์'}
            aria-pressed={editing === i}
            onClick={() => setEditing(editing === i ? null : (i as 0 | 1))}
            className={cx('size-10 rounded-full border-2', editing === i ? 'border-primary' : 'border-line-strong')}
            style={{ background: stop.color }}
          />
        ))}
        <div role="radiogroup" aria-label="ชนิดกราเดียนต์" className="ml-auto flex rounded-xl bg-surface-muted p-1">
          {(
            [
              ['linear', 'เส้นตรง'],
              ['radial', 'วงกลม'],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={parsed.type === type}
              onClick={() => set({ type })}
              className={cx('min-h-9 rounded-lg px-3 text-csmju-caption', parsed.type === type ? 'bg-surface font-semibold text-ink shadow-csmju-sm' : 'text-body')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {editing !== null && (
        <ColorPicker
          value={stops[editing].color}
          onChange={(color) => set({ stops: stops.map((s, i) => (i === editing ? { ...s, color } : s)) })}
        />
      )}
      {parsed.type === 'linear' && <RangeField label="มุม" value={parsed.angle} min={0} max={360} onChange={(angle) => set({ angle })} />}
    </div>
  );
}

