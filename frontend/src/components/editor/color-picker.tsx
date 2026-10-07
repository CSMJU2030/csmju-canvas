'use client';

import { Pipette } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { fromInputColor, toInputColor } from '@/lib/editor/color';

/// ตัวเลือกสีแบบ Canva: พื้นที่ความสด/ความสว่าง + แถบเฉดสี + ช่องรหัสสี + หลอดดูดสี
///
/// ค่าที่ส่งออกเป็น rgb() ตามรูปแบบของทั้งเอกสาร · คำนวณ HSV เองไม่พึ่งไลบรารี

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hexToHsv(hex: string): Hsv {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }

  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];

  return `rgb(${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)})`;
}

/// หลอดดูดสีของเบราว์เซอร์ (Chrome/Edge) — เบราว์เซอร์ที่ไม่มีจะไม่แสดงปุ่มนี้
interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

export function hasEyeDropper(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

export async function pickScreenColor(): Promise<string | null> {
  if (!hasEyeDropper()) return null;

  try {
    const Ctor = (window as unknown as { EyeDropper: new () => EyeDropperLike }).EyeDropper;
    const result = await new Ctor().open();

    return fromInputColor(toInputColor(result.sRGBHex));
  } catch {
    // ผู้ใช้กด Esc ยกเลิก
    return null;
  }
}

/// สีตั้งต้นเมื่อแปลงค่าที่ได้รับไม่ได้ (ดำ)
const FALLBACK = 'rgb(0 0 0)';

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(toInputColor(value, FALLBACK)));
  const [hex, setHex] = useState(() => (toInputColor(value, FALLBACK)).toUpperCase());
  const [synced, setSynced] = useState(value);
  const area = useRef<HTMLDivElement>(null);
  const hue = useRef<HTMLDivElement>(null);
  const hexId = useId();

  // ค่าเปลี่ยนจากข้างนอก (เลือกสีจากชุดสี) — ปรับตัวเลือกให้ตรงระหว่าง render
  if (synced !== value) {
    const next = toInputColor(value, FALLBACK);

    setSynced(value);
    setHex(next.toUpperCase());
    if (toInputColor(hsvToRgb(hsv)) !== next) setHsv(hexToHsv(next));
  }

  const emit = (next: Hsv) => {
    const color = hsvToRgb(next);

    setHsv(next);
    setSynced(color);
    setHex(toInputColor(color).toUpperCase());
    onChange(color);
  };

  const dragArea = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = area.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));

    emit({ ...hsv, s, v });
  };

  const dragHue = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = hue.current!.getBoundingClientRect();
    const h = Math.min(359.9, Math.max(0, ((event.clientX - rect.left) / rect.width) * 360));

    emit({ ...hsv, h });
  };

  const current = hsvToRgb(hsv);

  return (
    <div className="flex w-72 flex-col gap-3">
      <div
        ref={area}
        role="slider"
        tabIndex={0}
        aria-label="ความสดและความสว่างของสี"
        aria-valuetext={`ความสด ${Math.round(hsv.s * 100)}% ความสว่าง ${Math.round(hsv.v * 100)}%`}
        aria-valuenow={Math.round(hsv.s * 100)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragArea(event);
        }}
        onPointerMove={(event) => event.buttons === 1 && dragArea(event)}
        onKeyDown={(event) => {
          const step = 0.02;
          const keys: Record<string, Partial<Hsv>> = {
            ArrowLeft: { s: Math.max(0, hsv.s - step) },
            ArrowRight: { s: Math.min(1, hsv.s + step) },
            ArrowUp: { v: Math.min(1, hsv.v + step) },
            ArrowDown: { v: Math.max(0, hsv.v - step) },
          };

          if (keys[event.key]) {
            event.preventDefault();
            emit({ ...hsv, ...keys[event.key] });
          }
        }}
        className="relative h-36 w-full cursor-crosshair touch-none rounded-xl focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        style={{
          backgroundColor: `hsl(${hsv.h} 100% 50%)`,
          backgroundImage: 'linear-gradient(to top, rgb(0 0 0), transparent), linear-gradient(to right, rgb(255 255 255), transparent)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-csmju-md"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }}
        />
      </div>
      <div
        ref={hue}
        role="slider"
        tabIndex={0}
        aria-label="เฉดสี"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragHue(event);
        }}
        onPointerMove={(event) => event.buttons === 1 && dragHue(event)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            emit({ ...hsv, h: (hsv.h + (event.key === 'ArrowRight' ? 5 : -5) + 360) % 360 });
          }
        }}
        className="relative h-4 w-full cursor-pointer touch-none rounded-full focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(255 0 0), rgb(255 255 0), rgb(0 255 0), rgb(0 255 255), rgb(0 0 255), rgb(255 0 255), rgb(255 0 0))',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-csmju-md"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-line-strong px-2">
          <span aria-hidden className="size-6 shrink-0 rounded-full border border-line" style={{ background: current }} />
          <label htmlFor={hexId} className="sr-only">รหัสสี</label>
          <input
            id={hexId}
            value={hex}
            maxLength={7}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();

              setHex(next);
              if (/^#[0-9A-F]{6}$/.test(next)) emit(hexToHsv(next));
            }}
            className="min-w-0 flex-1 bg-transparent text-csmju-body text-ink tabular-nums focus:outline-none"
          />
        </div>
        {hasEyeDropper() && (
          <button
            type="button"
            aria-label="ดูดสีจากหน้าจอ"
            title="ดูดสีจากหน้าจอ"
            onClick={() => void pickScreenColor().then((color) => color && emit(hexToHsv(toInputColor(color))))}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-line-strong text-ink hover:bg-surface-muted"
          >
            <Pipette aria-hidden className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/// ปุ่มวงกลมสีรุ้งมีเครื่องหมายบวก (เพิ่มสีเอง)
export function RainbowSwatch({
  active,
  label,
  onClick,
  buttonRef,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className="relative inline-flex size-10 items-center justify-center rounded-full"
      style={{
        backgroundImage:
          'conic-gradient(rgb(255 0 0), rgb(255 200 0), rgb(0 200 0), rgb(0 200 255), rgb(80 80 255), rgb(255 0 255), rgb(255 0 0))',
      }}
    >
      <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface text-csmju-h3 leading-none font-bold text-ink">+</span>
      {active && <span aria-hidden className="absolute -inset-1 rounded-full border-2 border-primary" />}
    </button>
  );
}

/// วงกลมสีหนึ่งช่อง — ช่องที่เลือกมีวงสีหลักล้อม (แบบ Canva)
export function Swatch({ color, label, selected, onClick }: { color: string; label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      onClick={onClick}
      className="relative inline-flex size-10 items-center justify-center rounded-full"
    >
      <span className="size-full rounded-full border border-line-strong" style={{ background: color }} />
      {selected && <span aria-hidden className="absolute -inset-1 rounded-full border-2 border-primary" />}
    </button>
  );
}
