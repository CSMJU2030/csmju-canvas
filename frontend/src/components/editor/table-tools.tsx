'use client';

import {
  AlignCenter, AlignLeft, AlignRight, BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart,
  Columns3, Minus, PanelTop, Plus, Table2, Trash2,
} from 'lucide-react';
import { useId, useMemo, type ReactNode } from 'react';
import { cx } from '@/components/csmju/primitives';
import { SWATCHES, documentColors, toInputColor } from '@/lib/editor/color';
import { useEditor } from '@/lib/editor/store';
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  cellColor,
  cellFill,
  distributeColumns,
  insertColumn,
  insertRow,
  removeColumn,
  removeRow,
  setAllCells,
  setCell,
  tableSize,
} from '@/lib/editor/table';
import { activeCell, useTableUi } from '@/lib/editor/table-ui';
import type { TableElement, TableLines } from '@/lib/editor/types';
import { ColorPicker } from './color-picker';
import { FontPicker } from './font-picker';
import { PopoverButton, RangeField, ToolbarButton, ToolbarDivider } from './controls';

/// แถบเครื่องมือของตาราง (แบบ Canva)
///
/// ถ้าเลือกช่องไว้ (คลิกช่องในตารางที่เลือกอยู่) สีข้อความ/สีพื้นใช้กับช่องนั้น และเพิ่ม/ลบแถวคอลัมน์อิงช่องนั้น
/// ไม่ได้เลือกช่อง = ใช้กับทั้งตาราง และเพิ่ม/ลบที่ท้ายตาราง · ทุกปุ่มย้อนกลับได้ด้วย Ctrl+Z
export function TableTools({ el, trailing }: { el: TableElement; trailing?: ReactNode }) {
  const ref = useTableUi((s) => s.cell);
  const cell = activeCell(el, ref);
  const sizeId = useId();
  const AlignIcon = { left: AlignLeft, center: AlignCenter, right: AlignRight }[el.align];
  const update = (fn: (t: TableElement) => Partial<TableElement>) =>
    useEditor.getState().updateElements([el.id], (e) => (e.type === 'table' ? fn(e) : {}));
  const setSize = (size: number) => update(() => ({ fontSize: Math.max(4, Math.min(400, Math.round(size * 10) / 10)) }));

  return (
    <>
      <div className="w-44 shrink-0">
        <FontPicker value={el.fontFamily} onChange={(id) => update(() => ({ fontFamily: id }))} label="ฟอนต์ของตาราง" />
      </div>
      <div className="flex shrink-0 items-center rounded-lg border border-line-strong">
        <button type="button" aria-label="ลดขนาดตัวอักษร" onClick={() => setSize(el.fontSize - 1)} className="inline-flex size-9 items-center justify-center rounded-l-lg text-ink hover:bg-surface-muted">
          <Minus aria-hidden className="size-4" />
        </button>
        <label className="sr-only" htmlFor={sizeId}>ขนาดตัวอักษรในตาราง</label>
        <input
          id={sizeId}
          type="number"
          min={4}
          max={400}
          value={Math.round(el.fontSize * 10) / 10}
          onChange={(event) => Number(event.target.value) >= 1 && setSize(Number(event.target.value))}
          className="h-9 w-12 border-x border-line-strong bg-surface text-center text-csmju-caption text-ink tabular-nums focus:outline-none"
        />
        <button type="button" aria-label="เพิ่มขนาดตัวอักษร" onClick={() => setSize(el.fontSize + 1)} className="inline-flex size-9 items-center justify-center rounded-r-lg text-ink hover:bg-surface-muted">
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
      <TableColorButton
        label={cell ? 'สีข้อความของช่องที่เลือก' : 'สีข้อความทั้งตาราง'}
        value={cell ? cellColor(el, cell.row, cell.col) : el.color}
        trigger={<TextColorIcon color={cell ? cellColor(el, cell.row, cell.col) : el.color} />}
        onPick={(color) =>
          update((t) =>
            cell
              ? setCell(t, cell, { color })
              : { ...setAllCells(t, { color: null }), color: color ?? t.color, headerColor: t.headerFill ? t.headerColor : (color ?? t.headerColor) },
          )
        }
      />
      <TableColorButton
        label={cell ? 'สีพื้นช่องที่เลือก' : 'สีพื้นทุกช่อง'}
        value={cell ? cellFill(el, cell.row, cell.col) : null}
        allowNone
        trigger={<FillIcon color={cell ? cellFill(el, cell.row, cell.col) : null} />}
        onPick={(fill) => update((t) => (cell ? setCell(t, cell, { fill }) : setAllCells(t, { fill })))}
      />
      <ToolbarButton
        label={`จัดแนวข้อความ: ${{ left: 'ชิดซ้าย', center: 'กึ่งกลาง', right: 'ชิดขวา' }[el.align]}`}
        onClick={() => update((t) => ({ align: t.align === 'left' ? 'center' : t.align === 'center' ? 'right' : 'left' }))}
      >
        <AlignIcon aria-hidden className="size-5" />
      </ToolbarButton>
      <ToolbarButton label="แถวแรกเป็นหัวตาราง" wide active={el.header} onClick={() => update((t) => ({ header: !t.header }))}>
        <PanelTop aria-hidden className="size-5" /> หัวตาราง
      </ToolbarButton>
      <ToolbarDivider />
      <BorderPopover el={el} update={update} />
      {el.lines !== 'none' && el.borderWidth > 0 && (
        <TableColorButton label="สีเส้นตาราง" value={el.borderColor} onPick={(color) => color && update(() => ({ borderColor: color }))} />
      )}
      <RowsColumnsPopover el={el} update={update} />
      {trailing}
    </>
  );
}

type Update = (fn: (t: TableElement) => Partial<TableElement>) => void;

// ── เส้นตาราง ──────────────────────────────────────────────────────

const LINE_OPTIONS: { key: TableLines; label: string; d: string }[] = [
  { key: 'all', label: 'ทุกเส้น', d: 'M4 5h16v14H4zM4 12h16M12 5v14' },
  { key: 'horizontal', label: 'เฉพาะเส้นแนวนอน', d: 'M4 5h16M4 12h16M4 19h16' },
  { key: 'none', label: 'ไม่มีเส้น', d: 'M5 19 19 5' },
];

function BorderPopover({ el, update }: { el: TableElement; update: Update }) {
  return (
    <PopoverButton label="เส้นตาราง" trigger={<BorderIcon />}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2" role="group" aria-label="รูปแบบเส้นตาราง">
          {LINE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              title={option.label}
              aria-pressed={el.lines === option.key}
              onClick={() => update((t) => ({ lines: option.key, borderWidth: option.key !== 'none' && t.borderWidth === 0 ? 1 : t.borderWidth }))}
              className={cx(
                'inline-flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 py-1 text-csmju-caption text-ink',
                el.lines === option.key ? 'border-primary' : 'border-line hover:border-line-strong',
              )}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <path d={option.d} />
              </svg>
              {option.label}
            </button>
          ))}
        </div>
        <RangeField label="ความหนาเส้น" value={el.borderWidth} min={0} max={20} step={0.5} onChange={(v) => update(() => ({ borderWidth: v }))} />
      </div>
    </PopoverButton>
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

// ── แถวและคอลัมน์ ───────────────────────────────────────────────────

function RowsColumnsPopover({ el, update }: { el: TableElement; update: Update }) {
  const ref = useTableUi((s) => s.cell);
  const cell = activeCell(el, ref);
  const { rows, cols } = tableSize(el);
  const select = (row: number, col: number) => useTableUi.getState().selectCell({ id: el.id, row, col });

  const actions: { key: string; label: string; icon: ReactNode; disabled: boolean; run: () => void }[] = cell
    ? [
        { key: 'row-above', label: 'เพิ่มแถวด้านบน', icon: <BetweenHorizontalStart aria-hidden className="size-5" />, disabled: rows >= MAX_TABLE_ROWS, run: () => { update((t) => insertRow(t, cell.row)); select(cell.row + 1, cell.col); } },
        { key: 'row-below', label: 'เพิ่มแถวด้านล่าง', icon: <BetweenHorizontalEnd aria-hidden className="size-5" />, disabled: rows >= MAX_TABLE_ROWS, run: () => update((t) => insertRow(t, cell.row + 1)) },
        { key: 'row-remove', label: `ลบแถวที่ ${cell.row + 1}`, icon: <Trash2 aria-hidden className="size-5" />, disabled: rows <= 1, run: () => { update((t) => removeRow(t, cell.row)); select(Math.min(cell.row, rows - 2), cell.col); } },
        { key: 'col-left', label: 'เพิ่มคอลัมน์ทางซ้าย', icon: <BetweenVerticalStart aria-hidden className="size-5" />, disabled: cols >= MAX_TABLE_COLUMNS, run: () => { update((t) => insertColumn(t, cell.col)); select(cell.row, cell.col + 1); } },
        { key: 'col-right', label: 'เพิ่มคอลัมน์ทางขวา', icon: <BetweenVerticalEnd aria-hidden className="size-5" />, disabled: cols >= MAX_TABLE_COLUMNS, run: () => update((t) => insertColumn(t, cell.col + 1)) },
        { key: 'col-remove', label: `ลบคอลัมน์ที่ ${cell.col + 1}`, icon: <Trash2 aria-hidden className="size-5" />, disabled: cols <= 1, run: () => { update((t) => removeColumn(t, cell.col)); select(cell.row, Math.min(cell.col, cols - 2)); } },
      ]
    : [
        { key: 'row-add', label: 'เพิ่มแถวท้ายตาราง', icon: <BetweenHorizontalEnd aria-hidden className="size-5" />, disabled: rows >= MAX_TABLE_ROWS, run: () => update((t) => insertRow(t, rows)) },
        { key: 'row-remove', label: 'ลบแถวสุดท้าย', icon: <Trash2 aria-hidden className="size-5" />, disabled: rows <= 1, run: () => update((t) => removeRow(t, rows - 1)) },
        { key: 'col-add', label: 'เพิ่มคอลัมน์ท้ายตาราง', icon: <BetweenVerticalEnd aria-hidden className="size-5" />, disabled: cols >= MAX_TABLE_COLUMNS, run: () => update((t) => insertColumn(t, cols)) },
        { key: 'col-remove', label: 'ลบคอลัมน์สุดท้าย', icon: <Trash2 aria-hidden className="size-5" />, disabled: cols <= 1, run: () => update((t) => removeColumn(t, cols - 1)) },
      ];

  return (
    <PopoverButton label="แถวและคอลัมน์" wide trigger={<><Table2 aria-hidden className="size-5" /><span className="sr-only">แถวและคอลัมน์</span> {rows} × {cols}</>} panelClassName="w-72 p-2">
      <p className="px-2 pt-1 pb-2 text-csmju-caption text-muted">
        {cell ? `ช่องที่เลือก: แถว ${cell.row + 1} คอลัมน์ ${cell.col + 1}` : 'คลิกช่องในตารางเพื่อเพิ่มหรือลบรอบช่องนั้น'}
      </p>
      <div className="flex flex-col">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled}
            onClick={action.run}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted disabled:opacity-40"
          >
            {action.icon} {action.label}
          </button>
        ))}
        <button
          type="button"
          disabled={cols <= 1}
          onClick={() => update(distributeColumns)}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted disabled:opacity-40"
        >
          <Columns3 aria-hidden className="size-5" /> ทุกคอลัมน์กว้างเท่ากัน
        </button>
      </div>
    </PopoverButton>
  );
}

// ── สี ────────────────────────────────────────────────────────────

const sameColor = (a: string | null, b: string | null) => Boolean(a && b && toInputColor(a) === toInputColor(b));

/// ปุ่มสีของตาราง: ไม่มีสี (ถ้าอนุญาต) · สีในดีไซน์นี้ · สีเริ่มต้น · ตัวเลือกสีเอง
/// การลากในตัวเลือกสีรวมเป็น undo ขั้นเดียว
function TableColorButton({
  label,
  value,
  onPick,
  allowNone = false,
  trigger,
}: {
  label: string;
  value: string | null;
  onPick: (color: string | null) => void;
  allowNone?: boolean;
  trigger?: ReactNode;
}) {
  const doc = useEditor((s) => s.doc);
  const used = useMemo(() => documentColors(doc, 10), [doc]);
  const begin = () => useEditor.getState().beginGesture();
  const end = () => useEditor.getState().endGesture();

  return (
    <PopoverButton label={label} trigger={trigger ?? <ColorDot color={value} />}>
      <div className="flex flex-col gap-3">
        <p className="text-csmju-caption font-semibold text-ink">{label}</p>
        {allowNone && (
          <button
            type="button"
            aria-pressed={!value}
            onClick={() => onPick(null)}
            className={cx(
              'flex min-h-11 items-center gap-3 rounded-xl border-2 px-3 text-csmju-caption text-ink',
              !value ? 'border-primary' : 'border-line hover:border-line-strong',
            )}
          >
            <ColorDot color={null} /> ไม่มีสี
          </button>
        )}
        {used.length > 0 && <ColorRow title="สีในดีไซน์นี้" colors={used} value={value} onPick={onPick} />}
        <ColorRow title="สีเริ่มต้น" colors={SWATCHES} value={value} onPick={onPick} />
        <div onPointerDown={begin} onPointerUp={end} onPointerCancel={end}>
          <ColorPicker value={value ?? 'rgb(255 255 255)'} onChange={onPick} />
        </div>
      </div>
    </PopoverButton>
  );
}

function ColorRow({ title, colors, value, onPick }: { title: string; colors: string[]; value: string | null; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-csmju-caption text-muted">{title}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`เลือกสี ${color}`}
            title={color}
            aria-pressed={sameColor(color, value)}
            onClick={() => onPick(color)}
            className="relative inline-flex size-9 items-center justify-center rounded-full"
          >
            <span className="size-full rounded-full border border-line-strong" style={{ background: color }} />
            {sameColor(color, value) && <span aria-hidden className="absolute -inset-1 rounded-full border-2 border-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className={cx('block size-6 rounded-full border border-line-strong', !color && 'csmju-checker')}
      style={color ? { background: color } : undefined}
    />
  );
}

function TextColorIcon({ color }: { color: string }) {
  return (
    <span aria-hidden className="flex flex-col items-center leading-none">
      <span className="text-csmju-body font-bold">A</span>
      <span className="mt-0.5 h-1 w-5 rounded-full" style={{ background: color }} />
    </span>
  );
}

function FillIcon({ color }: { color: string | null }) {
  return (
    <span aria-hidden className="relative flex size-6 items-center justify-center">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
        <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11ZM5 2l5 5M2 13h15" />
      </svg>
      <span className={cx('absolute -bottom-1 h-1 w-5 rounded-full border border-line', !color && 'csmju-checker')} style={color ? { background: color } : undefined} />
    </span>
  );
}
