'use client';

import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft,
  AlignRight, AlignStartHorizontal, AlignStartVertical, Bold, BringToFront, Copy, FlipHorizontal2,
  FlipVertical2, Group, Italic, Lock, LockOpen, SendToBack, Trash2, Underline, Ungroup,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton, cx } from '@/components/csmju/primitives';
import { SWATCHES, fromInputColor, toInputColor } from '@/lib/editor/color';
import { FONT_FAMILIES } from '@/lib/editor/fonts';
import { currentPage, useEditor } from '@/lib/editor/store';
import type { CanvasElement, TextElement } from '@/lib/editor/types';

/// แถบคุณสมบัติด้านบนผืนผ้าใบ — เปลี่ยนตามชนิดของสิ่งที่เลือก · ไม่ได้เลือกอะไร = ตั้งค่าหน้า
///
/// ตัวเลข/สีที่แก้ต่อเนื่อง (ลากแถบเลื่อน เลือกสี) รวมเป็นหนึ่งขั้นของ undo ด้วย beginGesture
export function PropertiesBar() {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);
  const selected = elements.filter((el) => selection.includes(el.id));
  const single = selected.length === 1 ? selected[0] : null;

  return (
    <div
      role="toolbar"
      aria-label="คุณสมบัติ"
      className="flex min-h-14 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2"
    >
      {selected.length === 0 && <PageProperties />}
      {single?.type === 'text' && <TextProperties el={single} />}
      {single?.type === 'shape' && <ShapeProperties el={single} />}
      {single?.type === 'image' && <ImageProperties el={single} />}
      {single?.type === 'svg' && (
        <ColorControl label="สีไอคอน" value={single.color} onChange={(color) => patch([single.id], { color })} />
      )}
      {selected.length > 0 && <CommonProperties selected={selected} />}
    </div>
  );
}

function patch(ids: string[], values: Partial<CanvasElement>) {
  useEditor.getState().updateElements(ids, () => values);
}

function Divider() {
  return <span aria-hidden className="mx-1 h-8 w-px shrink-0 bg-line" />;
}

function PageProperties() {
  const page = useEditor((s) => currentPage(s));
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [synced, setSynced] = useState(`${width}x${height}`);

  if (synced !== `${width}x${height}`) {
    setSynced(`${width}x${height}`);
    setW(String(width));
    setH(String(height));
  }

  const apply = () => {
    const nw = Math.round(Number(w));
    const nh = Math.round(Number(h));

    if (nw >= 16 && nh >= 16 && nw <= 8000 && nh <= 8000) useEditor.getState().resize(nw, nh);
    else {
      setW(String(width));
      setH(String(height));
    }
  };

  return (
    <>
      <span className="shrink-0 px-2 text-csmju-caption text-muted">หน้า</span>
      <ColorControl
        label="สีพื้นหลังหน้า"
        value={page.background ?? 'rgb(255 255 255)'}
        onChange={(color) => useEditor.getState().setBackground(color)}
      />
      <label className="flex min-h-11 shrink-0 items-center gap-2 px-2 text-csmju-caption text-ink">
        <input
          type="checkbox"
          checked={page.background === null}
          onChange={(event) => useEditor.getState().setBackground(event.target.checked ? null : 'rgb(255 255 255)')}
          className="size-5 accent-primary"
        />
        พื้นหลังโปร่งใส
      </label>
      <Divider />
      <NumberField label="กว้าง" value={w} onChange={setW} onCommit={apply} suffix="px" />
      <span aria-hidden className="text-muted">×</span>
      <NumberField label="สูง" value={h} onChange={setH} onCommit={apply} suffix="px" />
    </>
  );
}

function TextProperties({ el }: { el: TextElement }) {
  const ids = [el.id];

  return (
    <>
      <label className="sr-only" htmlFor="font-family">ฟอนต์</label>
      <select
        id="font-family"
        value={el.fontFamily}
        onChange={(event) => patch(ids, { fontFamily: event.target.value })}
        className="min-h-11 shrink-0 rounded-xl border border-line-strong bg-surface px-2 text-csmju-caption text-ink"
      >
        {FONT_FAMILIES.map((font) => (
          <option key={font.id} value={font.id}>
            {font.label}
          </option>
        ))}
      </select>
      <NumberStepper label="ขนาดตัวอักษร" value={el.fontSize} min={4} max={800} onChange={(fontSize) => patch(ids, { fontSize })} />
      <ColorControl label="สีตัวอักษร" value={el.color} onChange={(color) => patch(ids, { color })} />
      <Divider />
      <IconButton label="ตัวหนา" active={el.fontWeight === 700} aria-pressed={el.fontWeight === 700} onClick={() => patch(ids, { fontWeight: el.fontWeight === 700 ? 400 : 700 })}>
        <Bold aria-hidden className="size-5" />
      </IconButton>
      <IconButton label="ตัวเอียง" active={el.italic} aria-pressed={el.italic} onClick={() => patch(ids, { italic: !el.italic })}>
        <Italic aria-hidden className="size-5" />
      </IconButton>
      <IconButton label="ขีดเส้นใต้" active={el.underline} aria-pressed={el.underline} onClick={() => patch(ids, { underline: !el.underline })}>
        <Underline aria-hidden className="size-5" />
      </IconButton>
      <Divider />
      {(
        [
          ['left', 'ชิดซ้าย', AlignLeft],
          ['center', 'กึ่งกลาง', AlignCenter],
          ['right', 'ชิดขวา', AlignRight],
        ] as const
      ).map(([align, label, Icon]) => (
        <IconButton key={align} label={`จัดข้อความ${label}`} active={el.align === align} aria-pressed={el.align === align} onClick={() => patch(ids, { align })}>
          <Icon aria-hidden className="size-5" />
        </IconButton>
      ))}
      <Divider />
      <Slider label="ระยะบรรทัด" value={el.lineHeight} min={0.8} max={3} step={0.05} onChange={(lineHeight) => patch(ids, { lineHeight })} format={(v) => v.toFixed(2)} />
      <Slider label="ระยะตัวอักษร" value={el.letterSpacing} min={-5} max={50} step={0.5} onChange={(letterSpacing) => patch(ids, { letterSpacing })} format={(v) => `${v}`} />
    </>
  );
}

function ShapeProperties({ el }: { el: Extract<CanvasElement, { type: 'shape' }> }) {
  const ids = [el.id];
  const isLine = el.shape === 'line' || el.shape === 'arrow';

  return (
    <>
      {!isLine && (
        <>
          <ColorControl label="สีพื้น" value={el.fill ?? 'rgb(255 255 255)'} onChange={(fill) => patch(ids, { fill })} />
          <label className="flex min-h-11 shrink-0 items-center gap-2 px-1 text-csmju-caption text-ink">
            <input type="checkbox" checked={el.fill === null} onChange={(e) => patch(ids, { fill: e.target.checked ? null : 'rgb(0 76 153)' })} className="size-5 accent-primary" />
            ไม่มีสีพื้น
          </label>
          <Divider />
        </>
      )}
      <ColorControl label="สีเส้นขอบ" value={el.stroke ?? 'rgb(15 23 42)'} onChange={(stroke) => patch(ids, { stroke, strokeWidth: el.strokeWidth || 2 })} />
      <Slider label="ความหนาเส้น" value={el.strokeWidth} min={0} max={60} step={1} onChange={(strokeWidth) => patch(ids, { strokeWidth, stroke: el.stroke ?? 'rgb(15 23 42)' })} format={(v) => `${v}`} />
      {el.shape === 'rect' && (
        <Slider label="มุมโค้ง" value={el.cornerRadius} min={0} max={Math.round(Math.min(el.width, el.height) / 2)} step={1} onChange={(cornerRadius) => patch(ids, { cornerRadius })} format={(v) => `${v}`} />
      )}
    </>
  );
}

function ImageProperties({ el }: { el: Extract<CanvasElement, { type: 'image' }> }) {
  const ids = [el.id];

  return (
    <>
      <IconButton label="พลิกแนวนอน" active={el.flipX} aria-pressed={el.flipX} onClick={() => patch(ids, { flipX: !el.flipX })}>
        <FlipHorizontal2 aria-hidden className="size-5" />
      </IconButton>
      <IconButton label="พลิกแนวตั้ง" active={el.flipY} aria-pressed={el.flipY} onClick={() => patch(ids, { flipY: !el.flipY })}>
        <FlipVertical2 aria-hidden className="size-5" />
      </IconButton>
      <Slider label="มุมโค้ง" value={el.cornerRadius} min={0} max={Math.round(Math.min(el.width, el.height) / 2)} step={1} onChange={(cornerRadius) => patch(ids, { cornerRadius })} format={(v) => `${v}`} />
    </>
  );
}

function CommonProperties({ selected }: { selected: CanvasElement[] }) {
  const ids = selected.map((el) => el.id);
  const allLocked = selected.every((el) => el.locked);
  const grouped = selected.some((el) => el.groupId);
  const state = useEditor.getState;

  return (
    <>
      <Divider />
      <Slider
        label="ความทึบ"
        value={Math.round((selected[0].opacity ?? 1) * 100)}
        min={0}
        max={100}
        step={1}
        onChange={(value) => patch(ids, { opacity: value / 100 })}
        format={(v) => `${v}%`}
      />
      <Divider />
      <AlignMenu disabled={allLocked} />
      <IconButton label="ยกขึ้นหน้าสุด" onClick={() => state().reorderSelected('front')}>
        <BringToFront aria-hidden className="size-5" />
      </IconButton>
      <IconButton label="ส่งไปหลังสุด" onClick={() => state().reorderSelected('back')}>
        <SendToBack aria-hidden className="size-5" />
      </IconButton>
      {selected.length > 1 && !grouped && (
        <IconButton label="จัดกลุ่ม (Ctrl+G)" onClick={() => state().groupSelected()}>
          <Group aria-hidden className="size-5" />
        </IconButton>
      )}
      {grouped && (
        <IconButton label="ยกเลิกกลุ่ม (Ctrl+Shift+G)" onClick={() => state().ungroupSelected()}>
          <Ungroup aria-hidden className="size-5" />
        </IconButton>
      )}
      <IconButton label={allLocked ? 'ปลดล็อก' : 'ล็อก'} active={allLocked} aria-pressed={allLocked} onClick={() => patch(ids, { locked: !allLocked })}>
        {allLocked ? <Lock aria-hidden className="size-5" /> : <LockOpen aria-hidden className="size-5" />}
      </IconButton>
      <IconButton label="ทำสำเนา (Ctrl+D)" onClick={() => state().duplicateSelected()}>
        <Copy aria-hidden className="size-5" />
      </IconButton>
      <IconButton label="ลบ (Delete)" disabled={allLocked} onClick={() => state().removeSelected()} className="text-danger">
        <Trash2 aria-hidden className="size-5" />
      </IconButton>
    </>
  );
}

function AlignMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = [
    ['left', 'ชิดซ้าย', AlignStartVertical],
    ['center', 'กึ่งกลางแนวนอน', AlignCenterVertical],
    ['right', 'ชิดขวา', AlignEndVertical],
    ['top', 'ชิดบน', AlignStartHorizontal],
    ['middle', 'กึ่งกลางแนวตั้ง', AlignCenterHorizontal],
    ['bottom', 'ชิดล่าง', AlignEndHorizontal],
  ] as const;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="min-h-11 rounded-xl px-3 text-csmju-caption text-ink hover:bg-primary-soft disabled:opacity-40"
      >
        จัดตำแหน่ง
      </button>
      {open && (
        <ul role="menu" className="fixed z-40 mt-1 grid w-60 grid-cols-1 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
          {items.map(([edge, label, Icon]) => (
            <li key={edge} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  useEditor.getState().alignSelected(edge);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted"
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ตัวควบคุมย่อย ────────────────────────────────────────────────

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-primary-soft"
      >
        <span className="size-7 rounded-full border border-line-strong" style={{ background: value }} />
      </button>
      {open && (
        <div className="fixed z-40 mt-1 w-64 rounded-xl border border-line bg-surface p-3 shadow-csmju-lg">
          <p className="mb-2 text-csmju-caption font-medium text-ink">{label}</p>
          <ul className="grid grid-cols-6 gap-2">
            {SWATCHES.map((swatch) => (
              <li key={swatch}>
                <button
                  type="button"
                  aria-label={`ใช้สี ${swatch}`}
                  onClick={() => onChange(swatch)}
                  className={cx('size-8 rounded-full border', swatch === value ? 'border-primary ring-2 ring-focus' : 'border-line-strong')}
                  style={{ background: swatch }}
                />
              </li>
            ))}
          </ul>
          <label htmlFor={id} className="mt-3 flex min-h-11 items-center justify-between gap-2 text-csmju-caption text-ink">
            สีอื่น
            <input
              id={id}
              type="color"
              value={toInputColor(value)}
              onPointerDown={() => useEditor.getState().beginGesture()}
              onBlur={() => useEditor.getState().endGesture()}
              onChange={(event) => onChange(fromInputColor(event.target.value))}
              className="h-10 w-16 cursor-pointer rounded border border-line-strong"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
}) {
  const id = useId();

  return (
    <div className="flex shrink-0 items-center gap-2 px-1">
      <label htmlFor={id} className="text-csmju-caption whitespace-nowrap text-muted">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => useEditor.getState().beginGesture()}
        onPointerUp={() => useEditor.getState().endGesture()}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-24 accent-primary"
      />
      <span className="w-12 text-csmju-caption text-ink tabular-nums">{format(value)}</span>
    </div>
  );
}

function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(Math.round(value * 10) / 10));
  const [synced, setSynced] = useState(value);

  if (synced !== value) {
    setSynced(value);
    setText(String(Math.round(value * 10) / 10));
  }

  const commit = () => {
    const n = Number(text);

    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
    else setText(String(value));
  };

  return (
    <div className="flex shrink-0 items-center rounded-xl border border-line-strong">
      <button type="button" aria-label={`ลด${label}`} onClick={() => onChange(Math.max(min, Math.round(value) - 1))} className="size-11 text-csmju-body text-ink hover:bg-surface-muted">
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-11 w-14 bg-transparent text-center text-csmju-caption text-ink tabular-nums outline-none"
      />
      <button type="button" aria-label={`เพิ่ม${label}`} onClick={() => onChange(Math.min(max, Math.round(value) + 1))} className="size-11 text-csmju-body text-ink hover:bg-surface-muted">
        +
      </button>
    </div>
  );
}

function NumberField({ label, value, onChange, onCommit, suffix }: { label: string; value: string; onChange: (v: string) => void; onCommit: () => void; suffix: ReactNode }) {
  const id = useId();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <label htmlFor={id} className="text-csmju-caption text-muted">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => e.key === 'Enter' && onCommit()}
        className="h-11 w-20 rounded-xl border border-line-strong bg-surface px-2 text-csmju-caption text-ink tabular-nums"
      />
      <span className="text-csmju-caption text-muted">{suffix}</span>
    </div>
  );
}
