import { DEFAULT_FONT } from './fonts';
import { center, rotatePoint, type Point, type Rect } from './geometry';
import type { TableCell, TableElement, TableLines } from './types';

/// ตาราง (แบบ Canva): ข้อมูล การจัดวาง และการแก้ไขที่ไม่ขึ้นกับ canvas
///
/// ไฟล์นี้ไม่วาดอะไรเอง (ตัววาดอยู่ใน table-render.ts) จึงทดสอบได้ใน jsdom
/// การวัดข้อความรับเป็นฟังก์ชันจากผู้เรียก — บนจอใช้ตัวตัดคำภาษาไทยของ render.ts

/// ระยะบรรทัดของข้อความในช่อง (เท่าของขนาดตัวอักษร)
export const TABLE_LINE_HEIGHT = 1.4;

/// จำนวนแถว/คอลัมน์สูงสุดที่เพิ่มได้จากแถบเครื่องมือ
export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 20;

export interface CellRef {
  row: number;
  col: number;
}

/// ระยะห่างจากขอบช่องถึงข้อความ = ครึ่งหนึ่งของขนาดตัวอักษร
export function cellPadding(el: Pick<TableElement, 'fontSize'>): number {
  return el.fontSize * 0.5;
}

export function tableSize(el: Pick<TableElement, 'cells'>): { rows: number; cols: number } {
  return { rows: el.cells.length, cols: el.cells[0]?.length ?? 0 };
}

/// แถวแรกของเนื้อหา (ถัดจากหัวตาราง) นับเป็น 0 — แถวคี่ได้สีสลับ
function bodyIndex(el: Pick<TableElement, 'header'>, row: number): number {
  return el.header ? row - 1 : row;
}

export function isHeaderRow(el: Pick<TableElement, 'header'>, row: number): boolean {
  return el.header && row === 0;
}

/// สีพื้นที่ใช้จริงของช่อง: สีของช่อง → สีหัวตาราง → สีแถวสลับ → โปร่งใส
export function cellFill(el: TableElement, row: number, col: number): string | null {
  const own = el.cells[row]?.[col]?.fill;

  if (own) return own;
  if (isHeaderRow(el, row)) return el.headerFill;
  if (el.stripeFill && bodyIndex(el, row) % 2 === 1) return el.stripeFill;

  return null;
}

/// สีตัวอักษรที่ใช้จริงของช่อง
export function cellColor(el: TableElement, row: number, col: number): string {
  return el.cells[row]?.[col]?.color || (isHeaderRow(el, row) ? el.headerColor : el.color);
}

export function cellWeight(el: Pick<TableElement, 'header'>, row: number): 400 | 700 {
  return isHeaderRow(el, row) ? 700 : 400;
}

// ── การจัดวาง ───────────────────────────────────────────────────────

/// จำนวนบรรทัดของข้อความเมื่อตัดคำในความกว้างที่ให้ (อย่างน้อย 1)
export type LineCounter = (text: string, width: number, weight: 400 | 700) => number;

export interface TableLayout {
  /// ตำแหน่งซ้ายและความกว้างของแต่ละคอลัมน์ (พิกัดหน้า ก่อนหมุน)
  cols: { x: number; width: number }[];
  /// ตำแหน่งบนและความสูงของแต่ละแถว
  rows: { y: number; height: number }[];
  /// ความสูงรวมจริง (≥ el.height เมื่อข้อความต้องการที่มากกว่า)
  height: number;
}

/// ทำสัดส่วนให้มีจำนวนตรงและรวมกันได้ 1 (ค่าผิด/ขาดได้ส่วนเท่ากัน)
export function normalizeFractions(values: unknown, count: number): number[] {
  if (count <= 0) return [];

  const list = Array.isArray(values) ? values : [];
  const valid = list.length === count && list.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);

  if (!valid) return Array.from({ length: count }, () => 1 / count);

  const total = (list as number[]).reduce((sum, v) => sum + v, 0);

  return (list as number[]).map((v) => v / total);
}

/// ความสูงต่ำสุดของแถวที่มีข้อความ n บรรทัด
export function rowHeightFor(el: Pick<TableElement, 'fontSize'>, lines: number): number {
  return Math.max(1, lines) * el.fontSize * TABLE_LINE_HEIGHT + cellPadding(el) * 2;
}

/// ตำแหน่งของทุกแถวและคอลัมน์ · ความสูงแถว = max(สัดส่วน × ความสูงกล่อง, ความสูงที่ข้อความต้องใช้)
export function tableLayout(el: TableElement, countLines: LineCounter): TableLayout {
  const { rows, cols } = tableSize(el);
  const colFractions = normalizeFractions(el.columns, cols);
  const rowFractions = normalizeFractions(el.rows, rows);
  const pad = cellPadding(el);
  const colLayout: TableLayout['cols'] = [];
  let x = el.x;

  for (const fraction of colFractions) {
    const width = fraction * el.width;

    colLayout.push({ x, width });
    x += width;
  }

  const rowLayout: TableLayout['rows'] = [];
  let y = el.y;

  rowFractions.forEach((fraction, r) => {
    let lines = 1;

    for (let c = 0; c < cols; c++) {
      const text = el.cells[r][c]?.text ?? '';

      if (text) lines = Math.max(lines, countLines(text, Math.max(1, colLayout[c].width - pad * 2), cellWeight(el, r)));
    }

    const height = Math.max(fraction * el.height, rowHeightFor(el, lines));

    rowLayout.push({ y, height });
    y += height;
  });

  return { cols: colLayout, rows: rowLayout, height: y - el.y };
}

/// ปรับกล่องให้สูงพอดีแถวที่ขยายตามข้อความ (คืนตัวเดิมถ้าไม่ต้องเปลี่ยน)
export function fitTable(el: TableElement, countLines: LineCounter): TableElement {
  const layout = tableLayout(el, countLines);

  if (Math.abs(layout.height - el.height) < 0.01) return el;

  return {
    ...el,
    height: Math.round(layout.height * 100) / 100,
    rows: layout.rows.map((row) => round4(row.height / layout.height)),
  };
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/// กล่องของช่อง (พิกัดหน้า ก่อนหมุน)
export function cellRectOf(layout: TableLayout, row: number, col: number): Rect | null {
  const r = layout.rows[row];
  const c = layout.cols[col];

  if (!r || !c) return null;

  return { x: c.x, y: r.y, width: c.width, height: r.height };
}

/// ช่องที่อยู่ใต้จุดบนหน้า (ย้อนการหมุนของตารางก่อน) · null = อยู่นอกตาราง
export function cellAtPoint(el: TableElement, layout: TableLayout, p: Point): CellRef | null {
  const local = el.rotation ? rotatePoint(p, center(el), -el.rotation) : p;
  const row = layout.rows.findIndex((r) => local.y >= r.y && local.y <= r.y + r.height);
  const col = layout.cols.findIndex((c) => local.x >= c.x && local.x <= c.x + c.width);

  return row < 0 || col < 0 ? null : { row, col };
}

/// ช่องถัดไปตามลำดับการอ่าน (Tab = 1, Shift+Tab = −1) · null = สุดตาราง
export function nextCell(el: Pick<TableElement, 'cells'>, cell: CellRef, step: 1 | -1): CellRef | null {
  const { rows, cols } = tableSize(el);
  const index = cell.row * cols + cell.col + step;

  if (index < 0 || index >= rows * cols) return null;

  return { row: Math.floor(index / cols), col: index % cols };
}

// ── การแก้ไข (คืนค่าเป็นส่วนที่เปลี่ยนสำหรับ updateElements) ───────────────

type TablePatch = Pick<TableElement, 'cells' | 'rows' | 'columns' | 'height'>;

const emptyCell = (): TableCell => ({ text: '' });

export function setCell(el: TableElement, cell: CellRef, values: Partial<TableCell>): Pick<TableElement, 'cells'> {
  return {
    cells: el.cells.map((row, r) => (r === cell.row ? row.map((c, i) => (i === cell.col ? { ...c, ...values } : c)) : row)),
  };
}

/// ใช้ค่ากับทุกช่อง
export function setAllCells(el: TableElement, values: Partial<TableCell>): Pick<TableElement, 'cells'> {
  return { cells: el.cells.map((row) => row.map((c) => ({ ...c, ...values }))) };
}

/// แทรกแถวว่างที่ตำแหน่ง `at` (0 = บนสุด) — แถวใหม่สูงเท่าแถวข้างเคียง กล่องสูงขึ้นตาม แถวเดิมไม่เปลี่ยนขนาด
export function insertRow(el: TableElement, at: number): TablePatch {
  const { rows, cols } = tableSize(el);

  if (rows >= MAX_TABLE_ROWS) return pickPatch(el);

  const index = Math.max(0, Math.min(rows, at));
  const fractions = normalizeFractions(el.rows, rows);
  const added = fractions[Math.min(index, rows - 1)] ?? 1;
  const next = [...fractions.slice(0, index), added, ...fractions.slice(index)];
  const total = 1 + added;

  return {
    cells: [...el.cells.slice(0, index), Array.from({ length: cols }, emptyCell), ...el.cells.slice(index)],
    rows: next.map((f) => round4(f / total)),
    columns: el.columns,
    height: el.height * total,
  };
}

/// ลบแถว — ตารางต้องเหลืออย่างน้อยหนึ่งแถว · กล่องเตี้ยลงเท่าความสูงแถวที่ลบ
export function removeRow(el: TableElement, at: number): TablePatch {
  const { rows } = tableSize(el);

  if (rows <= 1 || at < 0 || at >= rows) return pickPatch(el);

  const fractions = normalizeFractions(el.rows, rows);
  const removed = fractions[at];
  const rest = fractions.filter((_, i) => i !== at);
  const total = 1 - removed;

  return {
    cells: el.cells.filter((_, i) => i !== at),
    rows: rest.map((f) => round4(f / total)),
    columns: el.columns,
    height: el.height * total,
  };
}

/// แทรกคอลัมน์ว่าง — ความกว้างตารางคงเดิม คอลัมน์ใหม่ได้ส่วนเฉลี่ย คอลัมน์เดิมหดตามสัดส่วน
export function insertColumn(el: TableElement, at: number): TablePatch {
  const { cols } = tableSize(el);

  if (cols >= MAX_TABLE_COLUMNS) return pickPatch(el);

  const index = Math.max(0, Math.min(cols, at));
  const fractions = normalizeFractions(el.columns, cols);
  const added = 1 / (cols + 1);
  const scaled = fractions.map((f) => f * (1 - added));

  return {
    cells: el.cells.map((row) => [...row.slice(0, index), emptyCell(), ...row.slice(index)]),
    rows: el.rows,
    columns: [...scaled.slice(0, index), added, ...scaled.slice(index)].map(round4),
    height: el.height,
  };
}

/// ลบคอลัมน์ — ต้องเหลืออย่างน้อยหนึ่งคอลัมน์ · คอลัมน์ที่เหลือขยายเต็มความกว้างเดิม
export function removeColumn(el: TableElement, at: number): TablePatch {
  const { cols } = tableSize(el);

  if (cols <= 1 || at < 0 || at >= cols) return pickPatch(el);

  const rest = normalizeFractions(el.columns, cols).filter((_, i) => i !== at);
  const total = rest.reduce((sum, f) => sum + f, 0);

  return {
    cells: el.cells.map((row) => row.filter((_, i) => i !== at)),
    rows: el.rows,
    columns: rest.map((f) => round4(f / total)),
    height: el.height,
  };
}

/// ทุกคอลัมน์กว้างเท่ากัน
export function distributeColumns(el: TableElement): Pick<TableElement, 'columns'> {
  const { cols } = tableSize(el);

  return { columns: Array.from({ length: cols }, () => round4(1 / cols)) };
}

function pickPatch(el: TableElement): TablePatch {
  return { cells: el.cells, rows: el.rows, columns: el.columns, height: el.height };
}

// ── สี (แทนที่สีทั้งงาน · สีในดีไซน์นี้) ───────────────────────────────

/// ทุกสีที่ตารางใช้
export function tableColors(el: TableElement): string[] {
  const colors = [el.color, el.headerColor, el.headerFill, el.stripeFill, el.borderColor];

  for (const row of el.cells) for (const c of row) colors.push(c.fill ?? null, c.color ?? null);

  return colors.filter((c): c is string => Boolean(c));
}

/// เปลี่ยนทุกสีของตารางผ่านฟังก์ชันเดียว (ใช้กับ "แทนที่สีทั้งหมด")
export function mapTableColors(el: TableElement, swap: (color: string | null | undefined) => string | null | undefined): TableElement {
  return {
    ...el,
    color: swap(el.color) ?? el.color,
    headerColor: swap(el.headerColor) ?? el.headerColor,
    headerFill: swap(el.headerFill) ?? null,
    stripeFill: swap(el.stripeFill) ?? null,
    borderColor: swap(el.borderColor) ?? el.borderColor,
    cells: el.cells.map((row) => row.map((c) => ({ ...c, fill: swap(c.fill) ?? null, color: swap(c.color) ?? null }))),
  };
}

// ── รูปแบบสำเร็จรูป ─────────────────────────────────────────────────

export type TablePresetKey = 'grid' | 'header' | 'striped' | 'minimal' | 'teal' | 'soft';

export interface TablePreset {
  key: TablePresetKey;
  label: string;
  header: boolean;
  headerFill: string | null;
  headerColor: string;
  stripeFill: string | null;
  /// สีพื้นของทุกช่องในส่วนเนื้อหา (ใส่ลงช่องตอนสร้าง)
  bodyFill: string | null;
  color: string;
  borderColor: string;
  /// ความหนาเส้นเทียบกับขนาดตัวอักษร
  borderScale: number;
  lines: TableLines;
}

const INK = 'rgb(15 23 42)';
const WHITE = 'rgb(255 255 255)';
const PURPLE = 'rgb(125 42 232)';
const PURPLE_SOFT = 'rgb(240 233 253)';
const PURPLE_LINE = 'rgb(196 170 245)';
const TEAL = 'rgb(19 165 155)';
const TEAL_SOFT = 'rgb(220 247 248)';
const TEAL_LINE = 'rgb(150 220 215)';

/// รูปแบบตารางที่ทีมจัดไว้ (โทนม่วง/เขียวน้ำทะเลของระบบ)
export const TABLE_PRESETS: TablePreset[] = [
  {
    key: 'grid',
    label: 'เส้นตาราง',
    header: false,
    headerFill: null,
    headerColor: INK,
    stripeFill: null,
    bodyFill: null,
    color: INK,
    borderColor: 'rgb(71 85 105)',
    borderScale: 0.06,
    lines: 'all',
  },
  {
    key: 'header',
    label: 'หัวตารางสีม่วง',
    header: true,
    headerFill: PURPLE,
    headerColor: WHITE,
    stripeFill: null,
    bodyFill: null,
    color: INK,
    borderColor: PURPLE_LINE,
    borderScale: 0.06,
    lines: 'all',
  },
  {
    key: 'striped',
    label: 'แถวสลับสี',
    header: true,
    headerFill: PURPLE,
    headerColor: WHITE,
    stripeFill: PURPLE_SOFT,
    bodyFill: null,
    color: INK,
    borderColor: PURPLE_LINE,
    borderScale: 0.04,
    lines: 'horizontal',
  },
  {
    key: 'minimal',
    label: 'เส้นบางเรียบ',
    header: true,
    headerFill: null,
    headerColor: INK,
    stripeFill: null,
    bodyFill: null,
    color: 'rgb(51 65 85)',
    borderColor: 'rgb(203 213 225)',
    borderScale: 0.04,
    lines: 'horizontal',
  },
  {
    key: 'teal',
    label: 'หัวตารางเขียวน้ำทะเล',
    header: true,
    headerFill: TEAL,
    headerColor: WHITE,
    stripeFill: TEAL_SOFT,
    bodyFill: null,
    color: INK,
    borderColor: TEAL_LINE,
    borderScale: 0.05,
    lines: 'all',
  },
  {
    key: 'soft',
    label: 'พื้นอ่อนเส้นขาว',
    header: true,
    headerFill: PURPLE,
    headerColor: WHITE,
    stripeFill: null,
    bodyFill: PURPLE_SOFT,
    color: INK,
    borderColor: WHITE,
    borderScale: 0.12,
    lines: 'all',
  },
];

export function findTablePreset(key: string | undefined): TablePreset {
  return TABLE_PRESETS.find((p) => p.key === key) ?? TABLE_PRESETS[0];
}

/// ค่าของตาราง (ไม่รวมกล่อง/ตำแหน่ง) ตามรูปแบบสำเร็จรูป
export function tableBody(
  rows: number,
  cols: number,
  fontSize: number,
  preset: TablePreset,
): Omit<TableElement, 'id' | 'name' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity' | 'locked' | 'hidden' | 'groupId'> {
  const r = Math.max(1, Math.min(MAX_TABLE_ROWS, Math.round(rows)));
  const c = Math.max(1, Math.min(MAX_TABLE_COLUMNS, Math.round(cols)));

  return {
    type: 'table',
    cells: Array.from({ length: r }, (_, row) =>
      Array.from({ length: c }, (): TableCell => (preset.bodyFill && !(preset.header && row === 0) ? { text: '', fill: preset.bodyFill } : { text: '' })),
    ),
    columns: Array.from({ length: c }, () => round4(1 / c)),
    rows: Array.from({ length: r }, () => round4(1 / r)),
    fontFamily: DEFAULT_FONT,
    fontSize,
    color: preset.color,
    align: 'left',
    header: preset.header,
    headerFill: preset.headerFill,
    headerColor: preset.headerColor,
    stripeFill: preset.stripeFill,
    borderColor: preset.borderColor,
    borderWidth: Math.max(1, Math.round(fontSize * preset.borderScale * 10) / 10),
    lines: preset.lines,
  };
}

// ── รับ JSON ที่บันทึกไว้ ───────────────────────────────────────────────

const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback: number, min: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : fallback);

/// เติมค่าที่ขาดและซ่อมรูปร่างของตาราง (แถวยาวไม่เท่ากัน · สัดส่วนผิด · ข้อความไม่ใช่สตริง)
export function normalizeTable(input: TableElement): TableElement {
  const raw = input as unknown as Record<string, unknown>;
  const rawRows = (Array.isArray(raw.cells) ? raw.cells : []).filter(Array.isArray) as unknown[][];
  const cols = Math.max(1, ...rawRows.map((row) => row.length));
  const cells: TableCell[][] = (rawRows.length ? rawRows : [[]]).map((row) =>
    Array.from({ length: cols }, (_, i) => {
      const cell = (row[i] ?? {}) as Record<string, unknown>;
      const out: TableCell = { text: typeof cell.text === 'string' ? cell.text : cell.text == null ? '' : String(cell.text) };
      const fill = strOrNull(cell.fill);
      const color = strOrNull(cell.color);

      if (fill) out.fill = fill;
      if (color) out.color = color;

      return out;
    }),
  );
  const align = raw.align === 'center' || raw.align === 'right' ? raw.align : 'left';
  const lines: TableLines = raw.lines === 'horizontal' || raw.lines === 'none' ? raw.lines : 'all';
  const fontSize = num(raw.fontSize, 24, 1);

  return {
    ...input,
    cells,
    columns: normalizeFractions(raw.columns, cols),
    rows: normalizeFractions(raw.rows, cells.length),
    fontFamily: str(raw.fontFamily, DEFAULT_FONT),
    fontSize,
    color: str(raw.color, INK),
    align,
    header: raw.header === true,
    headerFill: strOrNull(raw.headerFill),
    headerColor: str(raw.headerColor, str(raw.color, INK)),
    stripeFill: strOrNull(raw.stripeFill),
    borderColor: str(raw.borderColor, 'rgb(71 85 105)'),
    borderWidth: num(raw.borderWidth, 1, 0),
    lines,
    width: num(raw.width, 100, 1),
    height: num(raw.height, rowHeightFor({ fontSize }, 1) * cells.length, 1),
  };
}
