'use client';

import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, CaseSensitive, Clock, Eraser, FlipHorizontal2, FlipVertical2,
  Group, ImageOff, Italic, List, ListOrdered, Minus, Move, PaintRoller, Plus, Repeat, RotateCcw, Scissors, Trash2, Underline, Undo2, Ungroup,
  Unlink, Upload, Strikethrough, Volume2, VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import { cx } from '@/components/csmju/primitives';
import { clearCell, detachCell, isFrameLike, patchCellImage, type FrameLike } from '@/lib/editor/frame-actions';
import { FRAME_SHAPES, GRID_LAYOUTS, cellImages, gridCellRects, maxGridGap, relayoutCells } from '@/lib/editor/frames';
import { FONT_FAMILIES, cssFamily } from '@/lib/editor/fonts';
import { formatDuration, trimRange } from '@/lib/editor/media';
import { isGradient } from '@/lib/editor/paint';
import { currentPage, useEditor } from '@/lib/editor/store';
import {
  isLineShape, type CanvasElement, type ChartElement, type FrameElement, type FrameImage, type GridElement, type ImageElement, type PathElement,
  type ShapeElement, type StrokeStyle, type TableElement, type TextElement, type VideoElement,
} from '@/lib/editor/types';
import { useEditorUi, type ColorTarget } from '@/lib/editor/ui-store';
import { ChartTools } from './chart-panel';
import { PopoverButton, RangeField, ToolbarButton, ToolbarDivider } from './controls';
import { FrameShapeGlyph, GridLayoutGlyph } from './frame-glyphs';
import { TableTools } from './table-tools';

/// แถบเครื่องมือลอยกลางด้านบนผืนผ้าใบ (ภาพบรีฟ "แถบบนของข้อความ/รูป/เส้นวาด")
///
/// เปลี่ยนตามชนิดของสิ่งที่เลือก · ปุ่มที่เป็นคำ (เอฟเฟกต์ แอนิเมต ตำแหน่ง แก้ไข ครอป) เปิดแผงด้านซ้าย
/// ส่วนเส้นขอบ ขอบมน ความโปร่งใส ระยะห่าง เปิดกล่องลอยใต้ปุ่ม
export function ContextToolbar() {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);
  const selected = elements.filter((el) => selection.includes(el.id));
  const types = new Set(selected.map((el) => el.type));
  const only = types.size === 1 ? selected[0].type : null;
  const imageErase = useEditorUi((s) => s.imageErase);
  const erasing = imageErase && selected.length === 1 && selected[0].id === imageErase.id ? (selected[0] as ImageElement) : null;
  const frameEdit = useEditorUi((s) => s.frameEdit);
  const frameCell = useEditorUi((s) => s.frameCell);
  const framing = frameEdit && selected.length === 1 && selected[0].id === frameEdit.id && isFrameLike(selected[0]) ? selected[0] : null;

  let content: React.ReactNode;

  if (erasing) content = <EraseTools el={erasing} size={imageErase!.size} />;
  else if (framing) content = <FrameEditTools el={framing} cell={frameEdit!.cell} />;
  else if (selected.length === 0) content = <PageTools />;
  else if (only === 'frame' && selected.length === 1) content = <FrameTools el={selected[0] as FrameElement} />;
  else if (only === 'grid' && selected.length === 1) {
    content = <GridTools el={selected[0] as GridElement} cell={frameCell?.id === selected[0].id ? frameCell.cell : null} />;
  }
  else if (only === 'text') content = <TextTools els={selected as TextElement[]} />;
  else if (only === 'shape') content = <ShapeTools els={selected as ShapeElement[]} />;
  else if (only === 'image' && selected.length === 1) content = <ImageTools el={selected[0] as ImageElement} />;
  else if (only === 'svg') content = <ColorOnlyTools els={selected} target="icon" label="สีกราฟิก" />;
  else if (only === 'path') content = <PathTools els={selected as PathElement[]} />;
  else if (only === 'table' && selected.length === 1) {
    content = (
      <TableTools
        el={selected[0] as TableElement}
        trailing={<><TransparencyButton els={selected} /><TrailingTools effects={false} /></>}
      />
    );
  }
  else if (only === 'chart' && selected.length === 1) {
    content = (
      <ChartTools el={selected[0] as ChartElement}>
        <TransparencyButton els={selected} />
        <TrailingTools />
      </ChartTools>
    );
  }
  else if (only === 'video' && selected.length === 1) content = <VideoTools el={selected[0] as VideoElement} />;
  else content = <MixedTools els={selected} />;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center">
      <div
        role="toolbar"
        aria-label="เครื่องมือของสิ่งที่เลือก"
        className="csmju-scroll-x pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-surface px-1.5 py-1 shadow-csmju-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

function patch(ids: string[], values: Partial<CanvasElement> | ((el: CanvasElement) => Partial<CanvasElement>)) {
  useEditor.getState().updateElements(ids, typeof values === 'function' ? values : () => values);
}

function Swatch({ value }: { value: string | null }) {
  return (
    <span
      aria-hidden
      className={cx('block size-6 rounded-full border border-line-strong', !value && 'csmju-checker')}
      style={value ? { background: value } : undefined}
    />
  );
}

function ColorButton({ label, value, target }: { label: string; value: string | null; target: ColorTarget }) {
  const panel = useEditorUi((s) => s.panel);
  const colorTarget = useEditorUi((s) => s.colorTarget);

  return (
    <ToolbarButton label={label} active={panel === 'color' && colorTarget === target} onClick={() => useEditorUi.getState().openColor(target)}>
      <Swatch value={value} />
    </ToolbarButton>
  );
}

/// ปุ่มคำที่เปิดแผงด้านซ้าย
function PanelButton({ panel, label }: { panel: 'effects' | 'animate' | 'position' | 'image-edit' | 'crop' | 'replace'; label: string }) {
  const current = useEditorUi((s) => s.panel);

  return (
    <ToolbarButton label={label} wide active={current === panel} onClick={() => useEditorUi.getState().togglePanel(panel)}>
      {label}
    </ToolbarButton>
  );
}

function TrailingTools({ effects = true }: { effects?: boolean }) {
  const painting = useEditorUi((s) => s.painting);

  return (
    <>
      <ToolbarDivider />
      {effects && <PanelButton panel="effects" label="เอฟเฟกต์" />}
      <PanelButton panel="animate" label="แอนิเมต" />
      <PanelButton panel="position" label="ตำแหน่ง" />
      <ToolbarButton
        label="คัดลอกสไตล์ (Ctrl+Alt+C) แล้วคลิกชิ้นงานที่จะวาง"
        active={painting}
        onClick={() => {
          if (painting) {
            useEditorUi.getState().setPainting(false);
            return;
          }

          useEditor.getState().copyStyle();
          useEditorUi.getState().setPainting(true);
        }}
      >
        <PaintRoller aria-hidden className="size-5" />
      </ToolbarButton>
    </>
  );
}

function TransparencyButton({ els }: { els: CanvasElement[] }) {
  const ids = els.map((el) => el.id);
  const value = Math.round((els[0]?.opacity ?? 1) * 100);

  return (
    <PopoverButton label="ความโปร่งใส" trigger={<TransparencyIcon />}>
      <RangeField label="ความโปร่งใส" value={value} min={0} max={100} onChange={(v) => patch(ids, { opacity: v / 100 })} />
    </PopoverButton>
  );
}

function TransparencyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5">
      <rect x={3.5} y={3.5} width={17} height={17} rx={3} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <rect x={8} y={4} width={4} height={4} fill="currentColor" />
      <rect x={16} y={4} width={4} height={4} rx={1} fill="currentColor" />
      <rect x={4} y={8} width={4} height={4} fill="currentColor" />
      <rect x={12} y={8} width={4} height={4} fill="currentColor" />
      <rect x={8} y={12} width={4} height={4} fill="currentColor" />
      <rect x={16} y={12} width={4} height={4} fill="currentColor" />
      <rect x={4} y={16} width={4} height={4} rx={1} fill="currentColor" />
      <rect x={12} y={16} width={4} height={4} fill="currentColor" />
    </svg>
  );
}

// ── หน้า ───────────────────────────────────────────────────────────

function PageTools() {
  const pageIndex = useEditor((s) => s.pageIndex);
  const page = useEditor((s) => currentPage(s));
  const pageCount = useEditor((s) => s.doc.pages.length);
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [synced, setSynced] = useState(`${width}x${height}`);
  const duration = page.duration ?? 5;

  if (synced !== `${width}x${height}`) {
    setSynced(`${width}x${height}`);
    setW(String(width));
    setH(String(height));
  }

  const applySize = () => {
    const nw = Math.round(Number(w));
    const nh = Math.round(Number(h));

    if (nw >= 16 && nh >= 16 && nw <= 8000 && nh <= 8000) {
      const state = useEditor.getState();

      // หน้าเดียวในงาน = เปลี่ยนขนาดของงาน · หลายหน้า = ขนาดเฉพาะหน้านี้ (แบบ Canva "ปรับขนาดหน้า")
      if (state.doc.pages.length === 1) state.resize(nw, nh);
      else state.resizePage(state.pageIndex, nw === state.baseWidth && nh === state.baseHeight ? null : { width: nw, height: nh });
    }
    else {
      setW(String(width));
      setH(String(height));
    }
  };

  return (
    <>
      <ColorButton label="สีพื้นหลังหน้า" value={page.background} target="background" />
      <PopoverButton label="เวลาแสดงหน้านี้ตอนเล่นอัตโนมัติ" wide trigger={<><Clock aria-hidden className="size-5" /> {duration.toFixed(1)}วิ</>}>
        <RangeField
          label="เวลาแสดงหน้า (วินาที)"
          value={duration}
          min={0.5}
          max={30}
          step={0.5}
          onChange={(v) => useEditor.getState().updatePage(pageIndex, { duration: v })}
        />
      </PopoverButton>
      <PopoverButton label="ขนาดหน้า" wide trigger={<>{width} × {height}</>}>
        {(close) => (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              applySize();
              close();
            }}
          >
            <p className="text-csmju-caption font-semibold text-ink">ขนาดหน้านี้</p>
            <div className="flex items-end gap-2">
              <SizeField label="กว้าง" value={w} onChange={setW} />
              <span aria-hidden className="pb-3 text-muted">×</span>
              <SizeField label="สูง" value={h} onChange={setH} />
            </div>
            <button type="submit" className="min-h-11 rounded-xl bg-primary text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
              ปรับขนาด
            </button>
          </form>
        )}
      </PopoverButton>
      <ToolbarDivider />
      <PanelButton panel="animate" label="แอนิเมต" />
      <PanelButton panel="position" label="ตำแหน่ง" />
      <ToolbarButton
        label="ลบหน้านี้"
        disabled={pageCount <= 1}
        onClick={() => {
          if (window.confirm(`ลบหน้า ${pageIndex + 1}? (ย้อนกลับได้ด้วย Ctrl+Z)`)) useEditor.getState().deletePage(pageIndex);
        }}
      >
        <Trash2 aria-hidden className="size-5" />
      </ToolbarButton>
    </>
  );
}

function SizeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-csmju-caption text-ink">
      {label} (px)
      <input
        type="number"
        min={16}
        max={8000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-csmju-body text-ink tabular-nums focus:border-primary focus:outline-none"
      />
    </label>
  );
}

// ── ข้อความ ────────────────────────────────────────────────────────

const ALIGN_NEXT: Record<TextElement['align'], TextElement['align']> = { left: 'center', center: 'right', right: 'justify', justify: 'left' };
const LIST_NEXT = { none: 'bullet', bullet: 'number', number: 'none' } as const;

function TextTools({ els }: { els: TextElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const panel = useEditorUi((s) => s.panel);
  const font = FONT_FAMILIES.find((f) => f.id === el.fontFamily);
  const AlignIcon = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }[el.align];
  const list = el.list ?? 'none';
  const setSize = (size: number) => patch(ids, (e) => ({ fontSize: Math.max(4, Math.min(800, Math.round(size * ((e as TextElement).fontSize / el.fontSize) * 10) / 10)) }));
  const spacingThousandths = Math.round((el.letterSpacing / el.fontSize) * 1000);

  return (
    <>
      <ToolbarButton label="ฟอนต์" wide active={panel === 'font'} onClick={() => useEditorUi.getState().togglePanel('font')}>
        <span className="max-w-32 truncate text-csmju-caption" style={{ fontFamily: cssFamily(el.fontFamily) }}>
          {font?.label.replace(/\s*\(.*\)$/, '') ?? el.fontFamily}
        </span>
      </ToolbarButton>
      <div className="flex shrink-0 items-center rounded-lg border border-line-strong">
        <button type="button" aria-label="ลดขนาดตัวอักษร" onClick={() => setSize(el.fontSize - 1)} className="inline-flex size-9 items-center justify-center rounded-l-lg text-ink hover:bg-surface-muted">
          <Minus aria-hidden className="size-4" />
        </button>
        <label className="sr-only" htmlFor="toolbar-font-size">ขนาดตัวอักษร</label>
        <input
          id="toolbar-font-size"
          type="number"
          min={4}
          max={800}
          value={Math.round(el.fontSize * 10) / 10}
          onChange={(event) => Number(event.target.value) >= 1 && setSize(Number(event.target.value))}
          className="h-9 w-12 border-x border-line-strong bg-surface text-center text-csmju-caption text-ink tabular-nums focus:outline-none"
        />
        <button type="button" aria-label="เพิ่มขนาดตัวอักษร" onClick={() => setSize(el.fontSize + 1)} className="inline-flex size-9 items-center justify-center rounded-r-lg text-ink hover:bg-surface-muted">
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
      <ToolbarButton label="สีข้อความ" active={panel === 'color'} onClick={() => useEditorUi.getState().openColor('text')}>
        <span aria-hidden className="flex flex-col items-center leading-none">
          <span className="text-csmju-body font-bold">A</span>
          <span className="mt-0.5 h-1 w-5 rounded-full" style={{ background: el.color }} />
        </span>
      </ToolbarButton>
      <ToolbarButton label="ตัวหนา (Ctrl+B)" active={el.fontWeight === 700} onClick={() => patch(ids, { fontWeight: el.fontWeight === 700 ? 400 : 700 })}>
        <Bold aria-hidden className="size-5" />
      </ToolbarButton>
      <ToolbarButton label="ตัวเอียง (Ctrl+I)" active={el.italic} onClick={() => patch(ids, { italic: !el.italic })}>
        <Italic aria-hidden className="size-5" />
      </ToolbarButton>
      <ToolbarButton label="ขีดเส้นใต้ (Ctrl+U)" active={el.underline} onClick={() => patch(ids, { underline: !el.underline })}>
        <Underline aria-hidden className="size-5" />
      </ToolbarButton>
      <ToolbarButton label="ขีดฆ่า" active={el.strike} onClick={() => patch(ids, { strike: !el.strike })}>
        <Strikethrough aria-hidden className="size-5" />
      </ToolbarButton>
      <ToolbarButton label="ตัวพิมพ์ใหญ่" active={el.uppercase} onClick={() => patch(ids, { uppercase: !el.uppercase })}>
        <CaseSensitive aria-hidden className="size-5" />
      </ToolbarButton>
      <ToolbarButton label={`จัดแนว: ${{ left: 'ชิดซ้าย', center: 'กึ่งกลาง', right: 'ชิดขวา', justify: 'เต็มแนว' }[el.align]}`} onClick={() => patch(ids, { align: ALIGN_NEXT[el.align] })}>
        <AlignIcon aria-hidden className="size-5" />
      </ToolbarButton>
      <ToolbarButton label={`รายการ: ${{ none: 'ไม่มี', bullet: 'สัญลักษณ์', number: 'ตัวเลข' }[list]}`} active={list !== 'none'} onClick={() => patch(ids, { list: LIST_NEXT[list] })}>
        {list === 'number' ? <ListOrdered aria-hidden className="size-5" /> : <List aria-hidden className="size-5" />}
      </ToolbarButton>
      <PopoverButton label="ระยะห่าง" trigger={<SpacingIcon />}>
        <div className="flex flex-col gap-4">
          <RangeField
            label="ระยะห่างตัวอักษร"
            value={spacingThousandths}
            min={-200}
            max={800}
            onChange={(v) => patch(ids, (e) => ({ letterSpacing: (v / 1000) * (e as TextElement).fontSize }))}
          />
          <RangeField label="ระยะห่างบรรทัด" value={el.lineHeight} min={0.5} max={2.5} step={0.01} onChange={(v) => patch(ids, { lineHeight: v })} />
        </div>
      </PopoverButton>
      <TransparencyButton els={els} />
      <TrailingTools />
    </>
  );
}

function SpacingIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7h11M9 12h11M9 17h11M4 5v14M2.5 6.5 4 5l1.5 1.5M2.5 17.5 4 19l1.5-1.5" />
    </svg>
  );
}

// ── รูปทรง ─────────────────────────────────────────────────────────

const STROKE_STYLES: { key: StrokeStyle | 'none'; label: string; dash: string }[] = [
  { key: 'none', label: 'ไม่มี', dash: '' },
  { key: 'solid', label: 'เส้นทึบ', dash: '' },
  { key: 'long-dash', label: 'เส้นประยาว', dash: '6 4' },
  { key: 'dash', label: 'เส้นประ', dash: '3 3' },
  { key: 'dot', label: 'จุด', dash: '0.5 3' },
];

/// กล่องเส้นขอบแบบ Canva: เลือกลาย (ไม่มี ทึบ ประ จุด) + ความหนา
function BorderPopover({
  style,
  width,
  color,
  colorTarget,
  onStyle,
  onWidth,
  allowNone = true,
}: {
  style: StrokeStyle | 'none';
  width: number;
  color: string | null;
  colorTarget: ColorTarget;
  onStyle: (style: StrokeStyle | 'none') => void;
  onWidth: (width: number) => void;
  allowNone?: boolean;
}) {
  return (
    <>
      <PopoverButton label="รูปแบบเส้นขอบ" trigger={<BorderIcon />} panelClassName="w-80">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            {STROKE_STYLES.filter((s) => allowNone || s.key !== 'none').map((s) => (
              <button
                key={s.key}
                type="button"
                aria-label={s.label}
                title={s.label}
                aria-pressed={style === s.key}
                onClick={() => onStyle(s.key)}
                className={cx(
                  'inline-flex h-11 flex-1 items-center justify-center rounded-xl border-2 text-ink',
                  style === s.key ? 'border-primary' : 'border-line hover:border-line-strong',
                )}
              >
                {s.key === 'none' ? (
                  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx={12} cy={12} r={8} />
                    <path d="m6.5 17.5 11-11" />
                  </svg>
                ) : (
                  <svg aria-hidden viewBox="0 0 28 8" className="h-2 w-7">
                    <path d="M1 4h26" stroke="currentColor" strokeWidth={2} strokeDasharray={s.dash} strokeLinecap="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <RangeField label="ความหนา" value={style === 'none' ? 0 : width} min={0} max={100} onChange={onWidth} />
        </div>
      </PopoverButton>
      {style !== 'none' && <ColorButton label="สีเส้นขอบ" value={color} target={colorTarget} />}
    </>
  );
}

function BorderIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 6h16M4 12h16" />
      <path d="M4 18h3M10 18h4M17 18h3" />
    </svg>
  );
}

function CornerPopover({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <PopoverButton label="ขอบมน" trigger={<CornerIcon />}>
      <RangeField label="ขอบมน" value={Math.min(value, max)} min={0} max={Math.max(1, Math.round(max))} onChange={onChange} />
    </PopoverButton>
  );
}

function CornerIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M5 19V12a7 7 0 0 1 7-7h7" />
    </svg>
  );
}

function ShapeTools({ els }: { els: ShapeElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const line = isLineShape(el.shape);
  const style: StrokeStyle | 'none' = !el.stroke || el.strokeWidth === 0 ? 'none' : (el.strokeStyle ?? 'solid');

  return (
    <>
      {!line && <ColorButton label={isGradient(el.fill) ? 'สีพื้น (กราเดียนต์)' : 'สีพื้น'} value={el.fill} target="fill" />}
      {line && <ColorButton label="สีเส้น" value={el.stroke} target="stroke" />}
      <BorderPopover
        style={style}
        width={el.strokeWidth}
        color={el.stroke}
        colorTarget="stroke"
        allowNone={!line}
        onStyle={(next) =>
          patch(ids, (e) =>
            next === 'none'
              ? { strokeWidth: 0 }
              : { strokeStyle: next, stroke: (e as ShapeElement).stroke ?? 'rgb(0 0 0)', strokeWidth: (e as ShapeElement).strokeWidth || 4 },
          )
        }
        onWidth={(w) => patch(ids, (e) => ({ strokeWidth: w, stroke: (e as ShapeElement).stroke ?? 'rgb(0 0 0)' }))}
      />
      {el.shape === 'rect' && (
        <CornerPopover value={el.cornerRadius} max={Math.min(el.width, el.height) / 2} onChange={(v) => patch(ids, { cornerRadius: v })} />
      )}
      <TransparencyButton els={els} />
      <TrailingTools />
    </>
  );
}

// ── รูปภาพ ─────────────────────────────────────────────────────────

/// แถบของโหมดยางลบพิกเซล: ขนาดแปรง · ย้อนรอยล่าสุด · ล้างรอยลบ · เสร็จแล้ว
function EraseTools({ el, size }: { el: ImageElement; size: number }) {
  const strokes = el.erase ?? [];
  const done = () => useEditorUi.getState().set({ imageErase: null });

  return (
    <>
      <span className="flex items-center gap-2 px-2 text-csmju-caption font-semibold text-ink">
        <Eraser aria-hidden className="size-5" /> ยางลบพิกเซล
      </span>
      <ToolbarDivider />
      <label className="flex items-center gap-2 px-2 text-csmju-caption text-ink">
        ขนาดแปรง
        <input
          type="range"
          min={5}
          max={200}
          value={size}
          onChange={(e) => useEditorUi.getState().set({ imageErase: { id: el.id, size: Number(e.target.value) } })}
          className="w-28 accent-primary"
        />
        <span className="w-8 tabular-nums">{size}</span>
      </label>
      <ToolbarDivider />
      <ToolbarButton label="ย้อนรอยลบล่าสุด" wide disabled={strokes.length === 0} onClick={() => patch([el.id], { erase: strokes.slice(0, -1) })}>
        <Undo2 aria-hidden className="size-5" /> ย้อนรอย
      </ToolbarButton>
      <ToolbarButton label="คืนรูปเดิมทั้งหมด" wide disabled={strokes.length === 0} onClick={() => patch([el.id], { erase: null })}>
        <RotateCcw aria-hidden className="size-5" /> คืนรูปเดิม
      </ToolbarButton>
      <ToolbarDivider />
      <button type="button" onClick={done} className="min-h-10 rounded-lg bg-primary px-4 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
        เสร็จแล้ว
      </button>
    </>
  );
}

function ImageTools({ el }: { el: ImageElement }) {
  const ids = [el.id];
  const border = el.border;
  const style: StrokeStyle | 'none' = !border || border.width === 0 ? 'none' : border.style;

  return (
    <>
      <PanelButton panel="image-edit" label="แก้ไข" />
      <PanelButton panel="replace" label="แทนที่" />
      <ToolbarButton label="ยางลบพิกเซล — ลากบนรูปเพื่อลบส่วนนั้น" wide disabled={el.locked} onClick={() => useEditorUi.getState().set({ imageErase: { id: el.id, size: 40 } })}>
        <Eraser aria-hidden className="size-5" /> ยางลบ
      </ToolbarButton>
      <ToolbarDivider />
      <BorderPopover
        style={style}
        width={border?.width ?? 0}
        color={border?.color ?? null}
        colorTarget="border"
        onStyle={(next) =>
          patch(ids, {
            border: next === 'none' ? null : { style: next, width: border?.width || 6, color: border?.color ?? 'rgb(0 0 0)' },
          })
        }
        onWidth={(w) => patch(ids, { border: { style: border?.style ?? 'solid', width: w, color: border?.color ?? 'rgb(0 0 0)' } })}
      />
      <CornerPopover value={el.cornerRadius} max={Math.min(el.width, el.height) / 2} onChange={(v) => patch(ids, { cornerRadius: v })} />
      <PanelButton panel="crop" label="ครอป" />
      <PopoverButton label="พลิก" wide trigger={<><FlipHorizontal2 aria-hidden className="size-5" /> พลิก</>} panelClassName="w-60 p-1">
        {(close) => (
          <div className="flex flex-col">
            <button type="button" onClick={() => { patch(ids, { flipX: !el.flipX }); close(); }} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
              <FlipHorizontal2 aria-hidden className="size-5" /> พลิกแนวนอน
            </button>
            <button type="button" onClick={() => { patch(ids, { flipY: !el.flipY }); close(); }} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
              <FlipVertical2 aria-hidden className="size-5" /> พลิกแนวตั้ง
            </button>
          </div>
        )}
      </PopoverButton>
      <TransparencyButton els={[el]} />
      <TrailingTools effects={false} />
    </>
  );
}

// ── กรอบและกริด ────────────────────────────────────────────────────

const MENU_ITEM = 'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted';

/// ปุ่มของช่องที่มีรูป: แก้ไข · แทนที่ · ปรับตำแหน่ง · แยกรูปออก · ลบรูป · พลิก
function CellImageTools({ el, cell, image }: { el: FrameLike; cell: number; image: FrameImage }) {
  const ui = useEditorUi.getState;

  return (
    <>
      <PanelButton panel="image-edit" label="แก้ไข" />
      <PanelButton panel="replace" label="แทนที่" />
      <ToolbarButton
        label="ปรับตำแหน่งรูปในกรอบ (ดับเบิลคลิกหรือกด Enter)"
        wide
        disabled={el.locked}
        onClick={() => ui().set({ frameCell: { id: el.id, cell }, frameEdit: { id: el.id, cell } })}
      >
        <Move aria-hidden className="size-5" /> ปรับตำแหน่ง
      </ToolbarButton>
      <ToolbarButton label="แยกรูปออกจากกรอบเป็นรูปเดี่ยว" wide disabled={el.locked} onClick={() => detachCell(el.id, cell)}>
        <Unlink aria-hidden className="size-5" /> แยกรูปออก
      </ToolbarButton>
      <ToolbarButton label="ลบรูปออกจากกรอบ (กรอบยังอยู่)" wide disabled={el.locked} onClick={() => clearCell(el.id, cell)}>
        <ImageOff aria-hidden className="size-5" /> ลบรูป
      </ToolbarButton>
      <PopoverButton label="พลิกรูปในกรอบ" wide trigger={<><FlipHorizontal2 aria-hidden className="size-5" /> พลิก</>} panelClassName="w-60 p-1">
        {(close) => (
          <div className="flex flex-col">
            <button type="button" onClick={() => { patchCellImage(el.id, cell, { flipX: !image.flipX }); close(); }} className={MENU_ITEM}>
              <FlipHorizontal2 aria-hidden className="size-5" /> พลิกแนวนอน
            </button>
            <button type="button" onClick={() => { patchCellImage(el.id, cell, { flipY: !image.flipY }); close(); }} className={MENU_ITEM}>
              <FlipVertical2 aria-hidden className="size-5" /> พลิกแนวตั้ง
            </button>
          </div>
        )}
      </PopoverButton>
    </>
  );
}

/// ช่องว่าง: ปุ่มเปิดแผงอัปโหลด (กดรูปในแผงแล้วรูปจะลงช่องนี้) + คำแนะนำการลากวาง
function EmptyCellTools({ el, cell }: { el: FrameLike; cell: number }) {
  return (
    <>
      <ToolbarButton
        label="เลือกรูปจากแผงอัปโหลดมาใส่ช่องนี้"
        wide
        disabled={el.locked}
        onClick={() => {
          useEditorUi.getState().set({ frameCell: { id: el.id, cell } });
          useEditorUi.getState().setPanel('uploads');
        }}
      >
        <Upload aria-hidden className="size-5" /> เลือกรูป
      </ToolbarButton>
      <span className="px-2 text-csmju-caption whitespace-nowrap text-muted">หรือลากรูปมาวางในช่อง</span>
    </>
  );
}

function FrameShapePopover({ el }: { el: FrameElement }) {
  return (
    <PopoverButton label="รูปทรงกรอบ" trigger={<FrameShapeGlyph shape={el.shape} className="size-6" />} panelClassName="w-72">
      {(close) => (
        <div className="grid grid-cols-5 gap-2">
          {FRAME_SHAPES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-label={s.label}
              title={s.label}
              aria-pressed={el.shape === s.key}
              onClick={() => {
                patch([el.id], { shape: s.key });
                close();
              }}
              className={cx(
                'flex aspect-square items-center justify-center rounded-xl border-2 text-ink',
                el.shape === s.key ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <FrameShapeGlyph shape={s.key} className="size-8" />
            </button>
          ))}
        </div>
      )}
    </PopoverButton>
  );
}

function FrameTools({ el }: { el: FrameElement }) {
  return (
    <>
      <FrameShapePopover el={el} />
      <ToolbarDivider />
      {el.image ? <CellImageTools el={el} cell={0} image={el.image} /> : <EmptyCellTools el={el} cell={0} />}
      <ToolbarDivider />
      <TransparencyButton els={[el]} />
      <TrailingTools />
    </>
  );
}

function GridTools({ el, cell }: { el: GridElement; cell: number | null }) {
  const active = cell !== null && cell >= 0 && cell < el.cells.length ? cell : null;
  const image = active !== null ? el.cells[active] : null;
  const maxRadius = Math.max(1, Math.min(...gridCellRects(el).map((c) => Math.min(c.width, c.height) / 2)));

  return (
    <>
      <PopoverButton label="เค้าโครงกริด" trigger={<GridLayoutGlyph layout={el.layout} className="size-6" />} panelClassName="w-72">
        {(close) => (
          <div className="grid grid-cols-4 gap-2">
            {GRID_LAYOUTS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-label={l.label}
                title={l.label}
                aria-pressed={el.layout === l.key}
                onClick={() => {
                  patch([el.id], (e) => ({ layout: l.key, cells: relayoutCells((e as GridElement).cells, l.key) }));
                  useEditorUi.getState().set({ frameCell: { id: el.id, cell: 0 } });
                  close();
                }}
                className={cx(
                  'flex aspect-square items-center justify-center rounded-xl border-2 text-ink',
                  el.layout === l.key ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong',
                )}
              >
                <GridLayoutGlyph layout={l.key} className="size-9" />
              </button>
            ))}
          </div>
        )}
      </PopoverButton>
      <PopoverButton label="ระยะห่างระหว่างช่อง" trigger={<SpacingIcon />}>
        <RangeField label="ระยะห่าง" value={Math.round(el.gap)} min={0} max={maxGridGap(el)} onChange={(v) => patch([el.id], { gap: v })} />
      </PopoverButton>
      <CornerPopover value={el.cornerRadius} max={maxRadius} onChange={(v) => patch([el.id], { cornerRadius: v })} />
      <ToolbarDivider />
      {active === null ? (
        <span className="px-2 text-csmju-caption whitespace-nowrap text-muted">คลิกช่องเพื่อใส่หรือแก้รูป</span>
      ) : (
        <>
          <span className="px-2 text-csmju-caption font-semibold whitespace-nowrap text-ink">ช่อง {active + 1}</span>
          {image ? <CellImageTools el={el} cell={active} image={image} /> : <EmptyCellTools el={el} cell={active} />}
        </>
      )}
      <ToolbarDivider />
      <TransparencyButton els={[el]} />
      <TrailingTools />
    </>
  );
}

/// โหมดจัดตำแหน่งรูปในกรอบ: ลากบนผืนผ้าใบเพื่อเลื่อน · สไลเดอร์/ล้อเมาส์เพื่อซูม · เสร็จแล้ว (Enter/Esc)
function FrameEditTools({ el, cell }: { el: FrameLike; cell: number }) {
  const image = cellImages(el)[cell];
  const done = () => useEditorUi.getState().set({ frameEdit: null });

  if (!image) return null;

  const zoom = Math.round(image.zoom * 100);

  return (
    <>
      <span className="flex items-center gap-2 px-2 text-csmju-caption font-semibold whitespace-nowrap text-ink">
        <Move aria-hidden className="size-5" /> ลากรูปเพื่อจัดตำแหน่ง
      </span>
      <ToolbarDivider />
      <label className="flex items-center gap-2 px-2 text-csmju-caption text-ink">
        ซูม
        <input
          type="range"
          min={100}
          max={500}
          value={zoom}
          onPointerDown={() => useEditor.getState().beginGesture()}
          onPointerUp={() => useEditor.getState().endGesture()}
          onChange={(e) => patchCellImage(el.id, cell, { zoom: Number(e.target.value) / 100 })}
          className="w-28 accent-primary"
        />
        <span className="w-12 tabular-nums">{zoom}%</span>
      </label>
      <ToolbarButton label="รีเซ็ตตำแหน่งและการซูม" wide onClick={() => patchCellImage(el.id, cell, { zoom: 1, offsetX: 0.5, offsetY: 0.5 })}>
        <RotateCcw aria-hidden className="size-5" /> รีเซ็ต
      </ToolbarButton>
      <ToolbarDivider />
      <button type="button" onClick={done} className="min-h-10 rounded-lg bg-primary px-4 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
        เสร็จแล้ว
      </button>
    </>
  );
}

/// วิดีโอ: เปิด/ปิดเสียง · เล่นวนซ้ำ · ตัดต่อช่วงที่เล่น (พร้อมตัวอย่าง) · ขอบมน · ความโปร่งใส
function VideoTools({ el }: { el: VideoElement }) {
  const ids = [el.id];
  const { start, end } = trimRange(el);
  const length = Number.isFinite(end) ? end - start : 0;
  const duration = el.duration > 0 ? el.duration : 0;

  return (
    <>
      <span className="px-2 text-csmju-caption text-ink tabular-nums" aria-label={`ความยาวที่เล่น ${formatDuration(length)}`}>
        {formatDuration(length)}
      </span>
      <ToolbarButton label={el.muted ? 'เปิดเสียงของคลิป' : 'ปิดเสียงของคลิป'} active={el.muted} disabled={el.locked} onClick={() => patch(ids, { muted: !el.muted })}>
        {el.muted ? <VolumeX aria-hidden className="size-5" /> : <Volume2 aria-hidden className="size-5" />}
      </ToolbarButton>
      <ToolbarButton label={el.loop ? 'เลิกเล่นวนซ้ำ' : 'เล่นวนซ้ำ'} active={el.loop} disabled={el.locked} onClick={() => patch(ids, { loop: !el.loop })}>
        <Repeat aria-hidden className="size-5" />
      </ToolbarButton>
      {duration > 0 && (
        <PopoverButton label="ตัดต่อช่วงที่เล่น" wide trigger={<><Scissors aria-hidden className="size-5" /> ตัดต่อ</>} panelClassName="w-80 p-4">
          <div className="flex flex-col gap-3">
            {/* ตัวอย่างเล่นเฉพาะช่วงที่ตัด (media fragment #t=เริ่ม,จบ) จากไฟล์ของผู้ใช้ในระบบ */}
            <video
              key={`${start}-${end}`}
              src={`${el.src}#t=${start.toFixed(2)},${end.toFixed(2)}`}
              controls
              muted={el.muted}
              playsInline
              preload="metadata"
              aria-label={`ตัวอย่างคลิป ${el.name}`}
              className="aspect-video w-full rounded-lg bg-inverse object-contain"
            />
            <RangeField
              label="เริ่มที่ (วินาที)"
              value={start}
              min={0}
              max={Math.max(0, duration - 0.1)}
              step={0.1}
              onChange={(v) => patch(ids, { trimStart: v, trimEnd: el.trimEnd !== null && el.trimEnd <= v ? Math.min(duration, v + 0.1) : el.trimEnd })}
            />
            <RangeField
              label="จบที่ (วินาที)"
              value={end}
              min={0.1}
              max={duration}
              step={0.1}
              onChange={(v) => patch(ids, { trimEnd: v >= duration ? null : Math.max(start + 0.1, v) })}
            />
            <p className="text-csmju-caption text-muted">
              เล่น {formatDuration(start)}–{formatDuration(end)} จากทั้งคลิป {formatDuration(duration)} · ภาพบนผืนผ้าใบและไฟล์ภาพนิ่งใช้เฟรมที่จุดเริ่ม
            </p>
            {(el.trimStart > 0 || el.trimEnd !== null) && (
              <button
                type="button"
                onClick={() => patch(ids, { trimStart: 0, trimEnd: null })}
                className="min-h-11 rounded-lg border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
              >
                เล่นทั้งคลิป
              </button>
            )}
          </div>
        </PopoverButton>
      )}
      <ToolbarDivider />
      <CornerPopover value={el.cornerRadius} max={Math.min(el.width, el.height) / 2} onChange={(v) => patch(ids, { cornerRadius: v })} />
      <TransparencyButton els={[el]} />
      <TrailingTools />
    </>
  );
}

function PathTools({ els }: { els: PathElement[] }) {
  const ids = els.map((e) => e.id);

  return (
    <>
      <ColorButton label="สีเส้นวาด" value={els[0].color} target="path" />
      <PopoverButton label="น้ำหนักเส้น" trigger={<BorderIcon />}>
        <RangeField label="น้ำหนักเส้น" value={els[0].strokeWidth} min={1} max={200} onChange={(v) => patch(ids, { strokeWidth: v })} />
      </PopoverButton>
      <TransparencyButton els={els} />
      <TrailingTools />
    </>
  );
}

function ColorOnlyTools({ els, target, label }: { els: CanvasElement[]; target: ColorTarget; label: string }) {
  const first = els[0] as { color?: string };

  return (
    <>
      <ColorButton label={label} value={first.color ?? null} target={target} />
      <TransparencyButton els={els} />
      <TrailingTools />
    </>
  );
}

function MixedTools({ els }: { els: CanvasElement[] }) {
  const grouped = els.some((el) => el.groupId);
  const state = useEditor.getState;

  return (
    <>
      {els.length > 1 && !grouped && (
        <ToolbarButton label="จัดกลุ่ม (Ctrl+G)" wide onClick={() => state().groupSelected()}>
          <Group aria-hidden className="size-5" /> จัดกลุ่ม
        </ToolbarButton>
      )}
      {grouped && (
        <ToolbarButton label="ยกเลิกการจัดกลุ่ม (Ctrl+Shift+G)" wide onClick={() => state().ungroupSelected()}>
          <Ungroup aria-hidden className="size-5" /> ยกเลิกกลุ่ม
        </ToolbarButton>
      )}
      <TransparencyButton els={els} />
      <TrailingTools effects={false} />
    </>
  );
}

