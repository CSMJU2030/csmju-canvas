'use client';

import { ClipboardPaste, List, Plus, Table2, Trash2, X } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { Toggle, cx } from '@/components/csmju/primitives';
import {
  CHART_KINDS,
  CHART_PALETTES,
  MAX_CHART_ROWS,
  MAX_CHART_SERIES,
  addRow,
  addSeries,
  cellText,
  chartColor,
  chartKindLabel,
  colorsFollowRows,
  isAxisChart,
  isTabular,
  parseTabular,
  removeRow,
  removeSeries,
  tableToChart,
  writeCells,
  type ChartData,
} from '@/lib/editor/chart-data';
import { SWATCHES } from '@/lib/editor/color';
import { createChart } from '@/lib/editor/factory';
import { FONT_FAMILIES, cssFamily } from '@/lib/editor/fonts';
import { currentPage, useEditor } from '@/lib/editor/store';
import type { CanvasElement, ChartElement, ChartKind } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { ColorPicker, Swatch } from './color-picker';
import { PanelHeader, PresetTile, RangeField, ToolbarButton, UnderlineTabs, PopoverButton } from './controls';
import { FontPicker } from './font-picker';

/// ชาร์ตแบบ Canva: แผง "แก้ไขข้อมูลชาร์ต" แถบเครื่องมือของชาร์ต และภาพตัวอย่างชนิดชาร์ต
///
/// ทุกการแก้ไขผ่าน updateElements จึงเห็นผลบนผืนผ้าใบทันทีและย้อนกลับได้ (Ctrl+Z)
/// การพิมพ์ในช่องหนึ่งช่องนับเป็นหนึ่งขั้นของ undo (เริ่มเมื่อโฟกัส จบเมื่อออกจากช่อง)

export { CHART_KINDS };

type ChartTab = 'data' | 'settings';

/// แท็บที่เปิดอยู่ของแผง — ปุ่มฟอนต์/สีบนแถบเครื่องมือเปิดแผงที่แท็บ "การตั้งค่า" ได้ตรง ๆ
const useChartTab = create<{ tab: ChartTab; setTab(tab: ChartTab): void }>((set) => ({
  tab: 'data',
  setTab(tab) {
    set({ tab });
  },
}));

export function openChartPanel(tab: ChartTab = 'data') {
  useChartTab.getState().setTab(tab);
  useEditorUi.getState().setPanel('chart-data');
}

/// ใส่ชาร์ตใหม่กลางหน้าแล้วเลือกไว้ · ค่าเริ่มต้นเปิดแผงแก้ไขข้อมูลให้พิมพ์ทับค่าตัวอย่างต่อได้เลย (แบบ Canva)
export function insertChart(page: { width: number; height: number }, kind: ChartKind, options: { openPanel?: boolean } = {}): ChartElement {
  const el = createChart(page, kind);

  useEditor.getState().addElements([el]);
  if (options.openPanel ?? true) openChartPanel('data');

  return el;
}

function update(id: string, fn: (el: ChartElement) => Partial<ChartElement>) {
  useEditor.getState().updateElements([id], (el) => (el.type === 'chart' ? fn(el) : {}) as Partial<CanvasElement>);
}

function updateData(id: string, fn: (el: ChartElement) => ChartData) {
  update(id, fn);
}

function useSelectedChart(): ChartElement | null {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);

  return useMemo(() => {
    const picked = elements.filter((el) => selection.includes(el.id));

    return picked.length === 1 && picked[0].type === 'chart' ? picked[0] : null;
  }, [elements, selection]);
}

// ── ภาพตัวอย่างชนิดชาร์ต ───────────────────────────────────────────

/// ภาพย่อของชาร์ตแต่ละชนิด (แผงองค์ประกอบ ตัวเลือกชนิด และปุ่มบนแถบเครื่องมือ) — สีจาก token ของระบบ
export function ChartKindGlyph({ kind, className = 'size-10' }: { kind: ChartKind; className?: string }) {
  const body = (() => {
    switch (kind) {
      case 'column':
        return (
          <>
            <rect x={8} y={20} width={6} height={18} rx={1} className="fill-type-purple" />
            <rect x={15} y={12} width={6} height={26} rx={1} className="fill-type-teal" />
            <rect x={26} y={16} width={6} height={22} rx={1} className="fill-type-purple" />
            <rect x={33} y={24} width={6} height={14} rx={1} className="fill-type-teal" />
            <rect x={5} y={38} width={38} height={1.5} className="fill-line-strong" />
          </>
        );
      case 'bar':
        return (
          <>
            <rect x={8} y={8} width={26} height={6} rx={1} className="fill-type-purple" />
            <rect x={8} y={17} width={18} height={6} rx={1} className="fill-type-teal" />
            <rect x={8} y={26} width={32} height={6} rx={1} className="fill-type-purple" />
            <rect x={6.5} y={5} width={1.5} height={32} className="fill-line-strong" />
          </>
        );
      case 'line':
        return (
          <>
            <polyline points="7,32 16,22 25,27 34,12 42,17" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-type-purple" />
            <polyline points="7,36 16,30 25,33 34,26 42,28" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-type-teal" />
            {[[7, 32], [16, 22], [25, 27], [34, 12], [42, 17]].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r={2.2} className="fill-type-purple" />
            ))}
          </>
        );
      case 'area':
        return (
          <>
            <polygon points="6,38 6,28 16,18 26,24 35,10 42,16 42,38" className="fill-type-teal" opacity={0.45} />
            <polyline points="6,28 16,18 26,24 35,10 42,16" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-type-teal" />
            <rect x={5} y={38} width={38} height={1.5} className="fill-line-strong" />
          </>
        );
      case 'pie':
        return (
          <>
            <path d="M24 24 L24 8 A16 16 0 0 1 39.2 29 Z" className="fill-type-purple" />
            <path d="M24 24 L39.2 29 A16 16 0 0 1 12.7 35.3 Z" className="fill-type-teal" />
            <path d="M24 24 L12.7 35.3 A16 16 0 0 1 24 8 Z" className="fill-type-orange" />
          </>
        );
      case 'donut':
        return (
          <>
            <circle cx={24} cy={24} r={12} fill="none" strokeWidth={7} strokeDasharray="30 45.4" transform="rotate(-90 24 24)" className="stroke-type-purple" />
            <circle cx={24} cy={24} r={12} fill="none" strokeWidth={7} strokeDasharray="0 30 25 20.4" transform="rotate(-90 24 24)" className="stroke-type-teal" />
            <circle cx={24} cy={24} r={12} fill="none" strokeWidth={7} strokeDasharray="0 55 20.4 0" transform="rotate(-90 24 24)" className="stroke-type-orange" />
          </>
        );
      case 'progress-ring':
        return (
          <>
            <circle cx={24} cy={24} r={13} fill="none" strokeWidth={5} className="stroke-line" />
            <circle cx={24} cy={24} r={13} fill="none" strokeWidth={5} strokeLinecap="round" strokeDasharray="57 81.7" transform="rotate(-90 24 24)" className="stroke-type-purple" />
          </>
        );
    }
  })();

  return (
    <svg aria-hidden viewBox="0 0 48 44" className={className}>
      {body}
    </svg>
  );
}

// ── แถบเครื่องมือของชาร์ต ──────────────────────────────────────────

/// ปุ่มบนแถบเครื่องมือลอยเมื่อเลือกชาร์ต · `children` = ปุ่มท้ายแถบร่วม (ความโปร่งใส เอฟเฟกต์ ฯลฯ)
export function ChartTools({ el, children }: { el: ChartElement; children?: ReactNode }) {
  const panel = useEditorUi((s) => s.panel);
  const font = FONT_FAMILIES.find((f) => f.id === el.fontFamily);
  const ring = el.chart === 'progress-ring';

  return (
    <>
      <ToolbarButton
        label="แก้ไขข้อมูล"
        wide
        active={panel === 'chart-data'}
        onClick={() => (panel === 'chart-data' ? useEditorUi.getState().setPanel(null) : openChartPanel('data'))}
      >
        <Table2 aria-hidden className="size-5" /> แก้ไขข้อมูล
      </ToolbarButton>
      <PopoverButton label={`ชนิดชาร์ต: ${chartKindLabel(el.chart)}`} trigger={<ChartKindGlyph kind={el.chart} className="size-7" />} panelClassName="w-80">
        {(close) => (
          <div className="grid grid-cols-3 gap-2">
            {CHART_KINDS.map((k) => (
              <PresetTile
                key={k.key}
                label={k.label}
                selected={el.chart === k.key}
                onClick={() => {
                  update(el.id, () => ({ chart: k.key }));
                  close();
                }}
              >
                <ChartKindGlyph kind={k.key} className="size-12" />
              </PresetTile>
            ))}
          </div>
        )}
      </PopoverButton>
      <PopoverButton label="ชุดสีของชาร์ต" trigger={<PaletteDots colors={el.colors} />} panelClassName="w-72">
        {(close) => (
          <div className="flex flex-col gap-1">
            <PaletteList el={el} onPicked={close} />
            <button
              type="button"
              onClick={() => {
                openChartPanel('settings');
                close();
              }}
              className="mt-2 min-h-11 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
            >
              ปรับสีทีละชุด
            </button>
          </div>
        )}
      </PopoverButton>
      <ToolbarButton label="ฟอนต์ของชาร์ต" wide onClick={() => openChartPanel('settings')}>
        <span className="max-w-32 truncate text-csmju-caption" style={{ fontFamily: cssFamily(el.fontFamily) }}>
          {font?.label.replace(/\s*\(.*\)$/, '') ?? el.fontFamily}
        </span>
      </ToolbarButton>
      <ToolbarButton label={ring ? 'แสดงชื่อใต้เปอร์เซ็นต์' : 'แสดงคำอธิบายสี'} active={el.showLegend} onClick={() => update(el.id, (c) => ({ showLegend: !c.showLegend }))}>
        <List aria-hidden className="size-5" />
      </ToolbarButton>
      {children}
    </>
  );
}

function PaletteDots({ colors }: { colors: string[] }) {
  return (
    <span aria-hidden className="flex -space-x-1.5">
      {colors.slice(0, 3).map((c, i) => (
        <span key={i} className="block size-5 rounded-full border-2 border-surface" style={{ background: c }} />
      ))}
    </span>
  );
}

function samePalette(a: string[], b: string[]) {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

function PaletteList({ el, onPicked }: { el: ChartElement; onPicked?: () => void }) {
  return (
    <ul className="flex flex-col gap-1" aria-label="ชุดสีสำเร็จรูป">
      {CHART_PALETTES.map((p) => {
        const selected = samePalette(el.colors, p.colors);

        return (
          <li key={p.key}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => {
                update(el.id, () => ({ colors: [...p.colors] }));
                onPicked?.();
              }}
              className={cx(
                'flex min-h-11 w-full items-center gap-3 rounded-xl border-2 px-3 text-left text-csmju-caption text-ink',
                selected ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-muted',
              )}
            >
              <span aria-hidden className="flex overflow-hidden rounded-md">
                {p.colors.slice(0, 6).map((c, i) => (
                  <span key={i} className="block h-6 w-4" style={{ background: c }} />
                ))}
              </span>
              {p.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── แผงแก้ไขข้อมูลชาร์ต ─────────────────────────────────────────────

export function ChartDataPanel() {
  const el = useSelectedChart();
  const tab = useChartTab((s) => s.tab);
  const setTab = useChartTab((s) => s.setTab);
  const close = () => useEditorUi.getState().setPanel(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="แก้ไขข้อมูลชาร์ต" onClose={close} />
      {!el ? (
        <p className="px-4 pt-2 text-csmju-caption text-muted">เลือกชาร์ตบนผืนผ้าใบหนึ่งชิ้นก่อน แล้วแก้ข้อมูลที่นี่ (ดับเบิลคลิกที่ชาร์ตก็เปิดแผงนี้ได้)</p>
      ) : (
        <>
          <UnderlineTabs
            label="แก้ไขข้อมูลชาร์ต"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'data', label: 'ข้อมูล' },
              { key: 'settings', label: 'การตั้งค่า' },
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
            {el.locked && <p className="mb-3 rounded-xl bg-surface-muted p-3 text-csmju-caption text-ink">ชาร์ตนี้ถูกล็อกอยู่ ปลดล็อกก่อนจึงจะแก้ได้</p>}
            <fieldset disabled={el.locked} className="min-w-0">
              {tab === 'data' ? <DataTab el={el} /> : <SettingsTab el={el} />}
            </fieldset>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mb-6', className)}>
      <h3 className="mb-3 text-csmju-body font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/// ช่องของตาราง: เก็บข้อความที่กำลังพิมพ์ไว้เอง (พิมพ์ "1." แล้วจุดไม่หาย) แต่เขียนลงชาร์ตทุกตัวอักษร
/// วางข้อความหลายช่อง (คัดลอกจาก Excel/ชีต) = เติมตารางเริ่มจากช่องนี้
function Cell({
  value,
  label,
  numeric = false,
  onInput,
  onPasteTable,
  className,
  marker,
}: {
  value: string;
  label: string;
  numeric?: boolean;
  onInput: (text: string) => void;
  onPasteTable: (rows: string[][]) => void;
  className?: string;
  marker?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-1.5">
      {marker && <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: marker }} />}
      <input
        aria-label={label}
        value={draft ?? value}
        inputMode={numeric ? 'decimal' : undefined}
        onFocus={() => {
          setDraft(value);
          useEditor.getState().beginGesture();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          onInput(event.target.value);
        }}
        onBlur={() => {
          setDraft(null);
          useEditor.getState().endGesture();
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text/plain');

          if (!isTabular(text)) return;

          event.preventDefault();
          setDraft(null);
          onPasteTable(parseTabular(text));
        }}
        onKeyDown={(event) => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
        className={cx(
          'min-h-10 w-full min-w-0 rounded-lg border border-transparent bg-surface px-2 text-csmju-caption text-ink hover:border-line-strong focus:border-primary focus:outline-none',
          numeric && 'text-right tabular-nums',
          className,
        )}
      />
    </span>
  );
}

function DataTab({ el }: { el: ChartElement }) {
  if (el.chart === 'progress-ring') return <ProgressData el={el} />;

  const axis = isAxisChart(el.chart);
  const rowColors = colorsFollowRows(el.chart);
  const write = (row: number, col: number, rows: string[][]) => updateData(el.id, (c) => writeCells(c, row, col, rows));

  return (
    <>
      <p className="mb-3 text-csmju-caption text-muted">
        พิมพ์ทับค่าตัวอย่างได้เลย · คัดลอกตารางจาก Excel หรือ Google ชีตแล้ววางลงช่องใดก็ได้ ระบบจะเติมตารางต่อจากช่องนั้น
      </p>
      {!axis && el.series.length > 1 && (
        <p className="mb-3 rounded-xl bg-surface-muted p-3 text-csmju-caption text-ink">{chartKindLabel(el.chart)}ใช้เฉพาะคอลัมน์แรก คอลัมน์อื่นยังเก็บไว้ให้เมื่อเปลี่ยนกลับเป็นกราฟแท่งหรือกราฟเส้น</p>
      )}
      <div className="csmju-scroll-x overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-muted">
              <th scope="col" className="min-w-32 px-2 py-1 text-left text-csmju-caption font-semibold text-muted">
                รายการ
              </th>
              {el.series.map((s, si) => (
                <th key={si} scope="col" className="min-w-28 px-1 py-1">
                  <span className="flex items-center gap-0.5">
                    <Cell
                      value={s.name}
                      label={`ชื่อชุดข้อมูลที่ ${si + 1}`}
                      marker={rowColors ? undefined : chartColor(el, si)}
                      className="font-semibold"
                      onInput={(text) => write(0, si + 1, [[text]])}
                      onPasteTable={(rows) => write(0, si + 1, rows)}
                    />
                    {el.series.length > 1 && (
                      <button
                        type="button"
                        aria-label={`ลบชุดข้อมูล ${s.name || si + 1}`}
                        title="ลบชุดข้อมูลนี้"
                        onClick={() => updateData(el.id, (c) => removeSeries(c, si))}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink"
                      >
                        <X aria-hidden className="size-4" />
                      </button>
                    )}
                  </span>
                </th>
              ))}
              <th scope="col" className="w-10">
                <span className="sr-only">ลบแถว</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {el.labels.map((label, ri) => (
              <tr key={ri} className="border-t border-line">
                <td className="px-1 py-0.5">
                  <Cell
                    value={label}
                    label={`ชื่อรายการแถวที่ ${ri + 1}`}
                    marker={rowColors ? chartColor(el, ri) : undefined}
                    onInput={(text) => write(ri + 1, 0, [[text]])}
                    onPasteTable={(rows) => write(ri + 1, 0, rows)}
                  />
                </td>
                {el.series.map((s, si) => (
                  <td key={si} className="px-1 py-0.5">
                    <Cell
                      numeric
                      value={cellText(el, ri + 1, si + 1)}
                      label={`ค่า${s.name ? ` ${s.name}` : ''} ของ ${label || `แถวที่ ${ri + 1}`}`}
                      onInput={(text) => write(ri + 1, si + 1, [[text]])}
                      onPasteTable={(rows) => write(ri + 1, si + 1, rows)}
                    />
                  </td>
                ))}
                <td className="px-0.5">
                  <button
                    type="button"
                    aria-label={`ลบแถว ${label || ri + 1}`}
                    title="ลบแถวนี้"
                    disabled={el.labels.length <= 1}
                    onClick={() => updateData(el.id, (c) => removeRow(c, ri))}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={el.labels.length >= MAX_CHART_ROWS}
          onClick={() => updateData(el.id, addRow)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
        >
          <Plus aria-hidden className="size-4" /> เพิ่มแถว
        </button>
        {axis && (
          <button
            type="button"
            disabled={el.series.length >= MAX_CHART_SERIES}
            onClick={() => updateData(el.id, addSeries)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
          >
            <Plus aria-hidden className="size-4" /> เพิ่มชุดข้อมูล
          </button>
        )}
      </div>
      <PasteTable el={el} />
    </>
  );
}

/// วางตารางทั้งชุดแทนข้อมูลเดิม — เดาหัวคอลัมน์และชื่อรายการให้เอง
function PasteTable({ el }: { el: ChartElement }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const apply = () => {
    const parsed = tableToChart(parseTabular(text));

    if (!parsed) {
      setError('ยังไม่มีข้อมูลให้ใช้ ลองคัดลอกตารางจากสเปรดชีตแล้ววางในช่องนี้');
      return;
    }

    updateData(el.id, (c) => ({ ...parsed, colors: c.colors }));
    setText('');
    setError(null);
  };

  return (
    <Section title="วางตารางทั้งชุด" className="mt-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-csmju-caption text-ink">
          วางข้อมูลจาก Excel หรือ Google ชีต (แถวแรกเป็นชื่อชุดข้อมูล คอลัมน์แรกเป็นชื่อรายการ)
        </label>
        <textarea
          id={id}
          rows={4}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-csmju-caption text-ink focus:border-primary focus:outline-none"
        />
        {error && <p className="text-csmju-caption text-danger">{error}</p>}
        <button
          type="button"
          onClick={apply}
          disabled={text.trim() === ''}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-40"
        >
          <ClipboardPaste aria-hidden className="size-4" /> ใช้ข้อมูลนี้แทนข้อมูลเดิม
        </button>
      </div>
    </Section>
  );
}

function ProgressData({ el }: { el: ChartElement }) {
  const id = useId();
  const value = Math.max(0, Math.min(100, el.series[0]?.values[0] ?? 0));

  return (
    <div className="flex flex-col gap-5">
      <RangeField
        label="ความคืบหน้า (เปอร์เซ็นต์)"
        value={value}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(v) => updateData(el.id, (c) => writeCells(c, 1, 1, [[String(v)]]))}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-csmju-caption text-ink">
          ชื่อที่แสดงใต้เปอร์เซ็นต์
        </label>
        <input
          id={id}
          value={el.labels[0] ?? ''}
          onFocus={() => useEditor.getState().beginGesture()}
          onBlur={() => useEditor.getState().endGesture()}
          onChange={(event) => updateData(el.id, (c) => writeCells(c, 1, 0, [[event.target.value]]))}
          className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-csmju-body text-ink focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  );
}

function SettingsTab({ el }: { el: ChartElement }) {
  const axis = isAxisChart(el.chart);
  const ring = el.chart === 'progress-ring';
  const rowColors = colorsFollowRows(el.chart);
  const colorItems = ring
    ? [{ label: 'สีวงแหวน', index: 0 }]
    : rowColors
      ? el.labels.map((label, i) => ({ label: label || `รายการที่ ${i + 1}`, index: i }))
      : el.series.map((s, i) => ({ label: s.name || `ชุดข้อมูลที่ ${i + 1}`, index: i }));

  const setColor = (index: number, color: string) =>
    update(el.id, (c) => {
      const colors = [...c.colors];

      // สีที่ยังไม่เคยตั้ง (วนจากชุดสี) เติมให้ครบก่อน แล้วค่อยเปลี่ยนช่องที่เลือก
      for (let i = colors.length; i <= index; i++) colors.push(chartColor(c, i));
      colors[index] = color;

      return { colors };
    });

  return (
    <>
      <Section title="ชนิดชาร์ต">
        <div className="grid grid-cols-3 gap-2">
          {CHART_KINDS.map((k) => (
            <PresetTile key={k.key} label={k.label} selected={el.chart === k.key} onClick={() => update(el.id, () => ({ chart: k.key }))}>
              <ChartKindGlyph kind={k.key} className="size-12" />
            </PresetTile>
          ))}
        </div>
      </Section>
      <Section title="การแสดงผล">
        <div className="divide-y divide-line">
          <Toggle
            label={ring ? 'ชื่อใต้เปอร์เซ็นต์' : 'คำอธิบายสี'}
            checked={el.showLegend}
            onChange={(v) => update(el.id, () => ({ showLegend: v }))}
          />
          <Toggle
            label={ring ? 'เปอร์เซ็นต์ตรงกลาง' : rowColors ? 'เปอร์เซ็นต์บนชิ้น' : 'ตัวเลขบนชาร์ต'}
            checked={el.showLabels}
            onChange={(v) => update(el.id, () => ({ showLabels: v }))}
          />
          {axis && <Toggle label="เส้นตารางและตัวเลขแกน" checked={el.showGrid} onChange={(v) => update(el.id, () => ({ showGrid: v }))} />}
        </div>
      </Section>
      <Section title="สี">
        <PaletteList el={el} />
        <ul className="mt-3 flex flex-col gap-1">
          {colorItems.map((item) => (
            <li key={item.index}>
              <ColorChip label={item.label} value={chartColor(el, item.index)} onChange={(color) => setColor(item.index, color)} />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="ตัวอักษร">
        <div className="flex flex-col gap-4">
          <FontPicker value={el.fontFamily} onChange={(id) => update(el.id, () => ({ fontFamily: id }))} />
          <RangeField label="ขนาดตัวอักษร" value={el.fontSize} min={6} max={120} onChange={(v) => update(el.id, () => ({ fontSize: v }))} />
          <ColorChip label="สีตัวอักษรและเส้นแกน" value={el.color} onChange={(color) => update(el.id, () => ({ color }))} />
        </div>
      </Section>
    </>
  );
}

/// แถวสีหนึ่งรายการ: กดแล้วเปิดกล่องเลือกสี (ชุดสีพื้นฐาน + ตัวเลือกสีละเอียด)
/// การลากในตัวเลือกสีรวมเป็นหนึ่งขั้นของ undo
function ColorChip({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-csmju-caption text-ink hover:bg-surface-muted"
      >
        <span aria-hidden className="size-7 shrink-0 rounded-full border border-line-strong" style={{ background: value }} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="sr-only">เปลี่ยนสี</span>
      </button>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label={`สีของ ${label}`} className="w-72 rounded-2xl border border-line bg-surface p-4 shadow-csmju-lg">
        <div className="mb-3 grid grid-cols-6 gap-2">
          {SWATCHES.map((c) => (
            <Swatch key={c} color={c} label={`ใช้สี ${c}`} selected={c === value} onClick={() => onChange(c)} />
          ))}
        </div>
        <div onPointerDown={() => useEditor.getState().beginGesture()} onPointerUp={() => useEditor.getState().endGesture()}>
          <ColorPicker value={value} onChange={onChange} />
        </div>
      </FloatingPanel>
    </>
  );
}
