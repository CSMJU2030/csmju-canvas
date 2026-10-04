'use client';

import { Equal, MousePointer2, PenLine, Pipette, Shapes, Signature, StickyNote, Type, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { cx } from '@/components/csmju/primitives';
import { documentColors } from '@/lib/editor/color';
import { STICKY_COLORS, createShape, createSticky, createText } from '@/lib/editor/factory';
import { useEditor, type DrawBrush } from '@/lib/editor/store';
import type { BrushKind, ShapeKind } from '@/lib/editor/types';
import { ColorPicker, RainbowSwatch, Swatch, hasEyeDropper, pickScreenColor } from './color-picker';

/// แผง "เครื่องมือ" แบบลอยข้างแถบซ้าย (ภาพบรีฟ "พรีเซนเทชั่น 4.3" และชุด "วาด")
///
/// คอลัมน์แรกคือเครื่องมือ · เลือก "วาด" "รูปทรง" "เส้น" หรือ "โน้ต" แล้วมีคอลัมน์ที่สองเลื่อนออกมา
/// โหมดวาดเปิดอยู่ตราบที่เลือก "วาด" — ปิดแผงหรือกด "เลือก" แล้วกลับเป็นโหมดเลือกชิ้นงาน

type Sub = 'draw' | 'shapes' | 'lines' | 'sticky' | null;

export function ToolsPalette({ onClose, onSignature }: { onClose: () => void; onSignature: () => void }) {
  const tool = useEditor((s) => s.tool);
  const [sub, setSub] = useState<Sub>(tool.mode === 'draw' ? 'draw' : null);
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const page = { width, height };
  const state = useEditor.getState;

  const pick = (next: Sub) => {
    setSub(next);
    state().setTool({ mode: next === 'draw' ? 'draw' : 'select' });
  };

  return (
    <div className="csmju-slide-in pointer-events-none absolute top-6 left-3 z-20 flex items-start gap-2">
      <div className="pointer-events-auto flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดแผงเครื่องมือ"
          title="ปิดแผงเครื่องมือ"
          className="inline-flex size-10 items-center justify-center rounded-full bg-surface text-ink shadow-csmju-md hover:bg-surface-muted"
        >
          <X aria-hidden className="size-5" />
        </button>
        <div role="toolbar" aria-orientation="vertical" aria-label="เครื่องมือ" className="flex flex-col gap-1 rounded-2xl bg-surface p-2 shadow-csmju-lg">
          <ToolButton label="เลือก" active={tool.mode === 'select' && sub === null} onClick={() => pick(null)}>
            <MousePointer2 aria-hidden className="size-6 text-ink" />
          </ToolButton>
          <ToolButton label="วาด" active={sub === 'draw'} onClick={() => pick('draw')}>
            <PenLine aria-hidden className="size-6 text-type-red" />
          </ToolButton>
          <ToolButton label="รูปทรง" active={sub === 'shapes'} onClick={() => pick('shapes')}>
            <Shapes aria-hidden className="size-6 fill-ink text-ink" />
          </ToolButton>
          <ToolButton label="เส้น" active={sub === 'lines'} onClick={() => pick('lines')}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-type-blue">
              <path d="M5 19 19 5" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
            </svg>
          </ToolButton>
          <ToolButton label="โน้ตแปะ" active={sub === 'sticky'} onClick={() => pick('sticky')}>
            <StickyNote aria-hidden className="size-6 fill-type-orange text-type-orange" />
          </ToolButton>
          <ToolButton
            label="ข้อความ"
            onClick={() => {
              pick(null);
              state().addElements([createText(page, 'body', { text: 'ข้อความในย่อหน้าของคุณ' })]);
            }}
          >
            <Type aria-hidden className="size-6 text-type-purple" strokeWidth={2.6} />
          </ToolButton>
          <ToolButton
            label="ลายเซ็น"
            onClick={() => {
              pick(null);
              onSignature();
            }}
          >
            <Signature aria-hidden className="size-6 text-ink" />
          </ToolButton>
        </div>
      </div>

      {sub && (
        <div key={sub} className="csmju-slide-in pointer-events-auto mt-24 rounded-2xl bg-surface py-2 shadow-csmju-lg">
          {sub === 'draw' && <DrawOptions />}
          {sub === 'shapes' && (
            <ul aria-label="รูปทรง" className="flex max-h-popover flex-col gap-1 overflow-y-auto px-2">
              {SHAPES.map((shape) => (
                <li key={shape.label}>
                  <ToolButton label={shape.label} onClick={() => state().addElements([createShape(page, shape.kind, { rounded: shape.rounded })])}>
                    <ShapeGlyph kind={shape.kind} rounded={shape.rounded} />
                  </ToolButton>
                </li>
              ))}
            </ul>
          )}
          {sub === 'lines' && (
            <ul aria-label="เส้น" className="flex flex-col gap-1 px-2">
              {LINES.map((line) => (
                <li key={line.kind}>
                  <ToolButton label={line.label} onClick={() => state().addElements([createShape(page, line.kind)])}>
                    <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-ink" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                      <path d={line.path} />
                      <circle cx={line.from[0]} cy={line.from[1]} r={1.8} className="fill-surface" />
                      <circle cx={line.to[0]} cy={line.to[1]} r={1.8} className="fill-surface" />
                    </svg>
                  </ToolButton>
                </li>
              ))}
            </ul>
          )}
          {sub === 'sticky' && (
            <ul aria-label="โน้ตแปะ" className="flex flex-col gap-1 px-2">
              {STICKY_COLORS.map((color) => (
                <li key={color.key}>
                  <ToolButton label={`โน้ตสี${color.label}`} onClick={() => state().addElements(createSticky(page, color.key))}>
                    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
                      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8l-6 6H6a2 2 0 0 1-2-2z" style={{ fill: color.swatch }} />
                      <path d="M14 20v-4a2 2 0 0 1 2-2h4z" style={{ fill: color.fill }} />
                    </svg>
                  </ToolButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/// ปุ่มเครื่องมือ + ป้ายดำที่โผล่ทางขวาตอนชี้ (แบบ Canva)
function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'group relative inline-flex size-12 items-center justify-center rounded-xl transition-colors',
        active ? 'bg-primary-soft' : 'hover:bg-surface-muted',
      )}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none invisible absolute left-full z-10 ml-3 rounded-lg bg-inverse px-2 py-1 text-csmju-caption font-semibold whitespace-nowrap text-on-inverse group-hover:visible group-focus-visible:visible"
      >
        {label}
      </span>
    </button>
  );
}

export const SHAPES: { kind: ShapeKind; label: string; rounded?: boolean }[] = [
  { kind: 'rect', label: 'สี่เหลี่ยม' },
  { kind: 'rect', label: 'สี่เหลี่ยมมุมโค้ง', rounded: true },
  { kind: 'ellipse', label: 'วงกลม' },
  { kind: 'triangle', label: 'สามเหลี่ยม' },
  { kind: 'triangle-down', label: 'สามเหลี่ยมกลับหัว' },
  { kind: 'diamond', label: 'สี่เหลี่ยมขนมเปียกปูน' },
  { kind: 'pentagon', label: 'ห้าเหลี่ยม' },
  { kind: 'hexagon', label: 'หกเหลี่ยม' },
  { kind: 'octagon', label: 'แปดเหลี่ยม' },
  { kind: 'star', label: 'ดาว' },
];

export const LINES: { kind: ShapeKind; label: string; path: string; from: [number, number]; to: [number, number] }[] = [
  { kind: 'line', label: 'เส้นตรง', path: 'M5 19 19 5', from: [5, 19], to: [19, 5] },
  { kind: 'curve', label: 'เส้นโค้ง', path: 'M5 19c0-6 14-8 14-14', from: [5, 19], to: [19, 5] },
  { kind: 'elbow', label: 'เส้นหักศอก', path: 'M5 19V9a4 4 0 0 1 4-4h10', from: [5, 19], to: [19, 5] },
];

/// ภาพย่อของรูปทรงในแผง (เติมสีเต็ม)
export function ShapeGlyph({ kind, rounded, className = 'size-7 text-ink' }: { kind: ShapeKind; rounded?: boolean; className?: string }) {
  const polygon = (sides: number, offset: number) =>
    Array.from({ length: sides }, (_, i) => {
      const angle = -Math.PI / 2 + offset + (i * 2 * Math.PI) / sides;

      return `${12 + Math.cos(angle) * 10},${12 + Math.sin(angle) * 10}`;
    }).join(' ');
  const shapes: Partial<Record<ShapeKind, ReactNode>> = {
    rect: <rect x={3} y={3} width={18} height={18} rx={rounded ? 5 : 0} />,
    ellipse: <circle cx={12} cy={12} r={10} />,
    triangle: <polygon points="12,2 22,21 2,21" />,
    'triangle-down': <polygon points="2,3 22,3 12,22" />,
    diamond: <polygon points="12,1 23,12 12,23 1,12" />,
    pentagon: <polygon points={polygon(5, 0)} />,
    hexagon: <polygon points={polygon(6, Math.PI / 6)} />,
    octagon: <polygon points={polygon(8, Math.PI / 8)} />,
    star: <polygon points="12,1.5 15,8.6 22.6,9.2 16.8,14.2 18.6,21.7 12,17.7 5.4,21.7 7.2,14.2 1.4,9.2 9,8.6" />,
  };

  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      {shapes[kind]}
    </svg>
  );
}

// ── ตัวเลือกของ "วาด" ─────────────────────────────────────────────

const BRUSHES: { key: DrawBrush; label: string }[] = [
  { key: 'pen', label: 'ปากกา' },
  { key: 'marker', label: 'ปากกามาร์กเกอร์' },
  { key: 'highlighter', label: 'ปากกาไฮไลท์' },
  { key: 'eraser', label: 'ยางลบ' },
];

/// ชุดสีของแต่ละหัวปากกา — แยกกันตามบรีฟ ("ไม่ใช้ร่วมกับ ปากกาเฉยๆ กับไฮไลท์")
export const BRUSH_PALETTES: Record<BrushKind, { title: string; colors: string[] }> = {
  pen: {
    title: 'สีปากกา',
    colors: ['rgb(1 24 78)', 'rgb(0 32 140)', 'rgb(0 61 186)', 'rgb(0 112 214)', 'rgb(66 158 222)', 'rgb(135 196 255)'],
  },
  marker: {
    title: 'สีปากกามาร์กเกอร์',
    colors: ['rgb(34 34 34)', 'rgb(227 30 36)', 'rgb(255 160 40)', 'rgb(22 163 74)', 'rgb(147 72 255)', 'rgb(20 140 255)'],
  },
  highlighter: {
    title: 'สีปากกาไฮไลท์',
    colors: ['rgb(255 170 90)', 'rgb(255 240 50)', 'rgb(170 240 80)', 'rgb(110 240 240)', 'rgb(255 150 240)', 'rgb(180 150 250)'],
  },
};

function DrawOptions() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);

  return (
    <div className="flex flex-col items-center gap-2">
      <ul aria-label="หัวปากกา" className="flex flex-col gap-1">
        {BRUSHES.map((brush) => (
          <li key={brush.key}>
            <button
              type="button"
              aria-label={brush.label}
              title={brush.label}
              aria-pressed={tool.brush === brush.key}
              onClick={() => setTool({ brush: brush.key, mode: 'draw' })}
              className={cx('flex h-12 w-18 items-center transition-transform duration-150', tool.brush === brush.key ? 'translate-x-3' : 'hover:translate-x-1')}
            >
              <Nib brush={brush.key} color={brush.key === 'eraser' ? null : tool.colors[brush.key]} />
            </button>
          </li>
        ))}
      </ul>
      {tool.brush !== 'eraser' && <BrushColorButton brush={tool.brush} />}
      <WeightButton brush={tool.brush} />
    </div>
  );
}

/// ภาพหัวปากกาแนวนอน — ปลายเป็นสีที่เลือกอยู่
function Nib({ brush, color }: { brush: DrawBrush; color: string | null }) {
  if (brush === 'eraser') {
    return (
      <svg aria-hidden viewBox="0 0 72 24" className="h-6 w-18">
        <rect x={0} y={4} width={58} height={16} rx={2} className="fill-type-pink" />
        <rect x={48} y={4} width={10} height={16} rx={2} className="fill-type-red" />
      </svg>
    );
  }

  const tip = color ?? 'currentColor';

  return (
    <svg aria-hidden viewBox="0 0 72 24" className="h-6 w-18">
      <path d="M0 5h50l14 7-14 7H0z" className="fill-surface stroke-line-strong" strokeWidth={1} />
      <rect x={12} y={5} width={2.5} height={14} style={{ fill: tip }} />
      {brush === 'pen' && <path d="M58 9l9 3-9 3z" style={{ fill: tip }} />}
      {brush === 'marker' && <path d="M56 8h6l6 4-6 4h-6z" style={{ fill: tip }} />}
      {brush === 'highlighter' && <rect x={57} y={7} width={9} height={10} rx={1} style={{ fill: tip }} />}
    </svg>
  );
}

function BrushColorButton({ brush }: { brush: BrushKind }) {
  const color = useEditor((s) => s.tool.colors[brush]);
  const doc = useEditor((s) => s.doc);
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start', 'right');
  const [custom, setCustom] = useState(false);
  const palette = BRUSH_PALETTES[brush];
  const setColor = (next: string) => useEditor.getState().setTool({ colors: { ...useEditor.getState().tool.colors, [brush]: next } });
  const used = open ? documentColors(doc) : [];

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={palette.title}
        title={palette.title}
        aria-expanded={open}
        onClick={() => {
          setCustom(false);
          setOpen((v) => !v);
        }}
        className={cx('inline-flex size-12 items-center justify-center rounded-xl', open ? 'bg-surface-muted' : 'hover:bg-surface-muted')}
      >
        <span className="size-8 rounded-full border border-line-strong" style={{ background: color }} />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label={palette.title} className="rounded-2xl border border-line bg-surface p-5 shadow-csmju-lg">
        {custom ? (
          <ColorPicker value={color} onChange={setColor} />
        ) : (
          <div className="flex w-80 flex-col gap-4">
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-csmju-body font-bold text-ink">
                <PaletteIcon /> {palette.title}
              </h3>
              <div className="flex flex-wrap gap-2">
                {palette.colors.map((swatch) => (
                  <Swatch key={swatch} color={swatch} label={`ใช้สี ${swatch}`} selected={swatch === color} onClick={() => setColor(swatch)} />
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-csmju-body font-bold text-ink">
                <PaletteIcon /> สีในดีไซน์นี้
              </h3>
              <div className="flex flex-wrap gap-2">
                <RainbowSwatch label="เพิ่มสีเอง" onClick={() => setCustom(true)} />
                {hasEyeDropper() && (
                  <button
                    type="button"
                    aria-label="ดูดสีจากหน้าจอ"
                    title="ดูดสีจากหน้าจอ"
                    onClick={() => void pickScreenColor().then((picked) => picked && setColor(picked))}
                    className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-ink hover:bg-primary-soft"
                  >
                    <Pipette aria-hidden className="size-5" />
                  </button>
                )}
                {used.map((swatch) => (
                  <Swatch key={swatch} color={swatch} label={`ใช้สี ${swatch}`} selected={swatch === color} onClick={() => setColor(swatch)} />
                ))}
              </div>
              {used.length === 0 && <p className="mt-2 text-csmju-caption text-muted">ยังไม่มีสีในงานนี้</p>}
            </section>
          </div>
        )}
      </FloatingPanel>
    </>
  );
}

function PaletteIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4z" />
      <circle cx={7.5} cy={11} r={1.2} fill="currentColor" />
      <circle cx={10} cy={7} r={1.2} fill="currentColor" />
      <circle cx={15} cy={7.5} r={1.2} fill="currentColor" />
    </svg>
  );
}

function WeightButton({ brush }: { brush: DrawBrush }) {
  const weight = useEditor((s) => s.tool.weights[brush]);
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start', 'right');
  const rangeId = useId();
  const numberId = useId();
  const setWeight = (next: number) => {
    const value = Math.min(100, Math.max(1, Math.round(next) || 1));

    useEditor.getState().setTool({ weights: { ...useEditor.getState().tool.weights, [brush]: value } });
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="น้ำหนักเส้น"
        title="น้ำหนักเส้น"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx('inline-flex size-12 items-center justify-center rounded-xl text-ink', open ? 'bg-surface-muted' : 'hover:bg-surface-muted')}
      >
        <Equal aria-hidden className="size-7" strokeWidth={3} />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label="น้ำหนักเส้น" className="w-88 rounded-2xl border border-line bg-surface p-5 shadow-csmju-lg">
        <label htmlFor={rangeId} className="text-csmju-body font-medium text-ink">
          น้ำหนัก
        </label>
        <div className="mt-2 flex items-center gap-4">
          <input
            id={rangeId}
            type="range"
            min={1}
            max={100}
            value={weight}
            onChange={(event) => setWeight(Number(event.target.value))}
            className="min-w-0 flex-1 accent-primary"
          />
          <label htmlFor={numberId} className="sr-only">ค่าน้ำหนัก</label>
          <input
            id={numberId}
            type="number"
            min={1}
            max={100}
            value={weight}
            onChange={(event) => setWeight(Number(event.target.value))}
            className="min-h-11 w-16 rounded-xl border border-line-strong bg-surface text-center text-csmju-body text-ink tabular-nums focus:border-primary focus:outline-none"
          />
        </div>
      </FloatingPanel>
    </>
  );
}
