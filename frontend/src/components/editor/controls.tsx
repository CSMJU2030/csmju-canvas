'use client';

import { useId, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { cx } from '@/components/csmju/primitives';
import { useEditor } from '@/lib/editor/store';

/// ตัวควบคุมย่อยของแถบเครื่องมือและแผงด้านข้างในหน้าแก้ไข (แบบ Canva)

/// ปุ่มบนแถบเครื่องมือลอย — มีข้อความ หรือไอคอน (ต้องมี label เสมอ)
export function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
  wide = false,
  buttonRef,
  expanded,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  wide?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  expanded?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={wide ? undefined : label}
      title={label}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg text-csmju-caption font-medium whitespace-nowrap text-ink transition-colors disabled:opacity-40',
        wide ? 'px-3' : 'min-w-10 px-2',
        active || expanded ? 'bg-primary-soft text-primary' : 'hover:bg-surface-muted',
      )}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />;
}

/// ปุ่มที่เปิดกล่องลอยใต้ปุ่ม (เส้นขอบ ขอบมน ความโปร่งใส ระยะห่าง ฯลฯ)
export function PopoverButton({
  label,
  trigger,
  wide = false,
  active,
  children,
  panelClassName = 'w-80',
}: {
  label: string;
  trigger: ReactNode;
  wide?: boolean;
  active?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
  panelClassName?: string;
}) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');

  return (
    <>
      <ToolbarButton label={label} wide={wide} active={active} expanded={open} buttonRef={anchorRef} onClick={() => setOpen((v) => !v)}>
        {trigger}
      </ToolbarButton>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label={label} className={cx('rounded-2xl border border-line bg-surface p-4 shadow-csmju-lg', panelClassName)}>
        {typeof children === 'function' ? children(() => setOpen(false)) : children}
      </FloatingPanel>
    </>
  );
}

/// แถบเลื่อน + ช่องตัวเลข — การลากรวมเป็นหนึ่งขั้นของ undo
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  trackClassName,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
  /// พื้นหลังแถบแบบไล่สี (อุณหภูมิ เฉดสี)
  trackClassName?: string;
}) {
  const rangeId = useId();
  const numberId = useId();
  const clampValue = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0));
  const shown = step < 1 ? Math.round(value * 100) / 100 : Math.round(value);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={rangeId} className="text-csmju-caption text-ink">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={rangeId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => useEditor.getState().beginGesture()}
          onPointerUp={() => useEditor.getState().endGesture()}
          onChange={(event) => onChange(clampValue(Number(event.target.value)))}
          className={cx('min-w-0 flex-1 accent-primary', trackClassName)}
        />
        <label htmlFor={numberId} className="sr-only">{`ค่า${label}`}</label>
        <span className="relative">
          <input
            id={numberId}
            type="number"
            min={min}
            max={max}
            step={step}
            value={shown}
            onChange={(event) => onChange(clampValue(Number(event.target.value)))}
            className={cx(
              'min-h-10 w-16 rounded-lg border border-line-strong bg-surface text-center text-csmju-caption text-ink tabular-nums focus:border-primary focus:outline-none',
              suffix && 'pr-4',
            )}
          />
          {suffix && <span aria-hidden className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-csmju-caption text-muted">{suffix}</span>}
        </span>
      </div>
    </div>
  );
}

/// หัวแผงด้านข้างแบบ Canva: ← ชื่อ ✕
export function PanelHeader({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-2">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7M19 12H5" />
          </svg>
        </button>
      )}
      <h2 className={cx('min-w-0 flex-1 truncate text-csmju-body font-bold text-ink', !onBack && 'pl-1')}>{title}</h2>
      <button type="button" onClick={onClose} aria-label={`ปิด${title}`} className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/// แท็บแบบขีดเส้นใต้ (ฟอนต์/สไตล์ข้อความ · จัดวาง/เลเยอร์)
export function UnderlineTabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { key: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex shrink-0 px-4">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cx(
            'min-h-11 flex-1 border-b-4 text-csmju-body transition-colors',
            value === tab.key ? 'border-primary font-semibold text-ink' : 'border-transparent text-body hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/// กล่องเลือกแบบการ์ดมีภาพตัวอย่าง (เอฟเฟกต์ แอนิเมชัน ฟิลเตอร์)
export function PresetTile({ label, selected, onClick, children }: { label: string; selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="group flex w-full flex-col items-center gap-1.5 text-csmju-caption text-ink">
      <span
        className={cx(
          'flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 bg-surface-muted transition-colors',
          selected ? 'border-primary' : 'border-transparent group-hover:border-line-strong',
        )}
      >
        {children}
      </span>
      <span className={cx('leading-tight', selected && 'font-semibold')}>{label}</span>
    </button>
  );
}
