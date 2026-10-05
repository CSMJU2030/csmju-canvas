import { DEFAULT_FONT } from './fonts';
import type { ChartElement, ChartKind, ChartSeries } from './types';

/// ข้อมูลและคณิตของชาร์ต (ไม่ยุ่งกับการวาด) — ใช้ร่วมกันระหว่างตัว normalize, ตัววาด, แผงแก้ไขข้อมูล และเทสต์
///
/// ตารางข้อมูลในแผงคิดเป็นกริด: แถว 0 = ชื่อชุดข้อมูล · คอลัมน์ 0 = ชื่อรายการ · ช่อง (0, 0) ว่าง
/// ช่อง (r, c) ที่ r, c ≥ 1 คือค่าของรายการ r − 1 ในชุดข้อมูล c − 1

export const CHART_KINDS: { key: ChartKind; label: string }[] = [
  { key: 'column', label: 'กราฟแท่ง' },
  { key: 'bar', label: 'กราฟแท่งแนวนอน' },
  { key: 'line', label: 'กราฟเส้น' },
  { key: 'area', label: 'กราฟพื้นที่' },
  { key: 'pie', label: 'แผนภูมิวงกลม' },
  { key: 'donut', label: 'แผนภูมิโดนัท' },
  { key: 'progress-ring', label: 'วงแหวนความคืบหน้า' },
];

export function chartKindLabel(kind: ChartKind): string {
  return CHART_KINDS.find((k) => k.key === kind)?.label ?? 'ชาร์ต';
}

/// ชาร์ตที่มีแกน (แท่ง เส้น พื้นที่) — ใช้หลายชุดข้อมูลได้
export function isAxisChart(kind: ChartKind): boolean {
  return kind === 'bar' || kind === 'column' || kind === 'line' || kind === 'area';
}

/// ชาร์ตที่สีวนตาม "รายการ" (ชิ้นวงกลม) แทนที่จะวนตามชุดข้อมูล
export function colorsFollowRows(kind: ChartKind): boolean {
  return kind === 'pie' || kind === 'donut';
}

export const MAX_CHART_ROWS = 100;
export const MAX_CHART_SERIES = 20;
const MAX_VALUE = 1e12;

/// ชุดสีสำเร็จรูป (ชุดแรกเป็นม่วง/ฟ้าน้ำทะเลแบบ Canva)
export const CHART_PALETTES: { key: string; label: string; colors: string[] }[] = [
  {
    key: 'canva',
    label: 'ม่วงฟ้าน้ำทะเล',
    colors: ['rgb(125 42 232)', 'rgb(0 196 204)', 'rgb(255 145 77)', 'rgb(255 102 196)', 'rgb(94 23 235)', 'rgb(32 201 151)', 'rgb(255 189 89)', 'rgb(56 182 255)'],
  },
  {
    key: 'ocean',
    label: 'ทะเล',
    colors: ['rgb(0 76 153)', 'rgb(14 165 233)', 'rgb(20 184 166)', 'rgb(125 211 252)', 'rgb(30 64 175)', 'rgb(94 234 212)'],
  },
  {
    key: 'sunset',
    label: 'พระอาทิตย์ตก',
    colors: ['rgb(244 63 94)', 'rgb(251 146 60)', 'rgb(250 204 21)', 'rgb(168 85 247)', 'rgb(236 72 153)', 'rgb(234 88 12)'],
  },
  {
    key: 'forest',
    label: 'ป่าไม้',
    colors: ['rgb(22 101 52)', 'rgb(74 222 128)', 'rgb(132 204 22)', 'rgb(20 184 166)', 'rgb(161 98 7)', 'rgb(190 242 100)'],
  },
  {
    key: 'mono',
    label: 'โทนเดียว',
    colors: ['rgb(30 41 59)', 'rgb(71 85 105)', 'rgb(100 116 139)', 'rgb(148 163 184)', 'rgb(203 213 225)'],
  },
];

export const DEFAULT_CHART_COLORS = CHART_PALETTES[0].colors;
export const DEFAULT_CHART_TEXT = 'rgb(51 65 85)';

export function chartColor(el: Pick<ChartElement, 'colors'>, index: number): string {
  const colors = el.colors.length > 0 ? el.colors : DEFAULT_CHART_COLORS;

  return colors[((index % colors.length) + colors.length) % colors.length];
}

/// สีพร้อมความโปร่ง 0–1 (รับ rgb(r g b) ที่ editor เขียน · ค่าอื่นคืนสีเดิม)
export function chartAlpha(color: string, alpha: number): string {
  const m = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);

  if (!m) return color;

  return `rgb(${m[1]} ${m[2]} ${m[3]} / ${Math.max(0, Math.min(1, alpha))})`;
}

// ── ตัวเลข ──────────────────────────────────────────────────────────

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/// แปลงข้อความจากเซลล์ (พิมพ์เองหรือวางจาก Excel) เป็นตัวเลข · อ่านไม่ได้ = null
///
/// รับเลขไทย ตัวคั่นหลักพัน เครื่องหมาย % ฿ $ และเครื่องหมายลบแบบยูนิโค้ด
export function parseNumber(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/[−–]/g, '-')
    .replace(/[\s,%฿$€£]/g, '');

  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null;

  const value = Number(cleaned);

  return Number.isFinite(value) ? clampValue(value) : null;
}

function clampValue(value: number): number {
  return Math.max(-MAX_VALUE, Math.min(MAX_VALUE, value));
}

function toValue(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? clampValue(raw) : 0;
  if (typeof raw === 'string') return parseNumber(raw) ?? 0;

  return 0;
}

const valueFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/// ตัวเลขบนแท่ง/จุด: คั่นหลักพัน ทศนิยมไม่เกิน 2 ตำแหน่ง
export function formatValue(value: number): string {
  return valueFormat.format(Object.is(value, -0) ? 0 : value);
}

/// ตัวเลขบนแกน: ย่อหลักล้าน/พันเมื่อค่าใหญ่ ให้แกนไม่กินที่
export function formatTick(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1e9) return `${formatValue(value / 1e9)}B`;
  if (abs >= 1e6) return `${formatValue(value / 1e6)}M`;
  if (abs >= 1e4) return `${formatValue(value / 1e3)}K`;

  return formatValue(value);
}

// ── สเกลแกน ─────────────────────────────────────────────────────────

export interface Scale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/// ปัดช่วงเป็นเลขสวย 1 · 2 · 5 × 10ⁿ (อัลกอริทึม nice numbers ของ Heckbert)
function niceNumber(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let nice: number;

  if (round) nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;

  return nice * Math.pow(10, exponent);
}

/// สเกลของแกนค่า: รวมศูนย์เสมอ (แท่งเริ่มที่ 0) · เส้นแบ่งไม่เกินราว `maxTicks` เส้นที่ค่าสวย
export function niceScale(dataMin: number, dataMax: number, maxTicks = 5): Scale {
  let min = Math.min(0, dataMin);
  let max = Math.max(0, dataMax);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }

  if (max - min < 1e-12) max = min + 1;

  const range = niceNumber(max - min, false);
  const step = niceNumber(range / Math.max(1, maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const count = Math.round((niceMax - niceMin) / step);
  const ticks = Array.from({ length: count + 1 }, (_, i) => Number((niceMin + i * step).toPrecision(12)));

  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks };
}

/// ค่าต่ำสุด/สูงสุดของทุกชุด (ชาร์ตที่มีแกน)
export function dataRange(series: ChartSeries[]): { min: number; max: number } {
  let min = 0;
  let max = 0;

  for (const s of series) {
    for (const v of s.values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  return { min, max };
}

// ── วงกลม ───────────────────────────────────────────────────────────

/// เปอร์เซ็นต์เต็มจำนวนของแต่ละชิ้นที่รวมกันได้ 100 พอดี (ปัดแบบเศษเหลือมากสุด)
/// ค่าติดลบนับเป็น 0 · รวมเป็น 0 = ทุกชิ้น 0
export function piePercentages(values: number[]): number[] {
  const positive = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = positive.reduce((a, b) => a + b, 0);

  if (total <= 0) return positive.map(() => 0);

  const exact = positive.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, rest: v - floors[i] }))
    .filter((item) => positive[item.i] > 0)
    .sort((a, b) => b.rest - a.rest || a.i - b.i);

  for (const item of order) {
    if (remaining <= 0) break;

    floors[item.i]++;
    remaining--;
  }

  return floors;
}

// ── normalize ──────────────────────────────────────────────────────

const KIND_KEYS = new Set<string>(CHART_KINDS.map((k) => k.key));

export function defaultLabel(index: number): string {
  return `รายการ ${index + 1}`;
}

export function defaultSeriesName(index: number): string {
  return `ชุดข้อมูล ${index + 1}`;
}

/// เติมค่าที่ขาดและตัดค่าที่ผิดรูป (JSON เก่า หรือที่ CMS เขียนเอง) · ค่าทุกชุดยาวเท่าจำนวนรายการ
export function normalizeChart(el: ChartElement): ChartElement {
  const raw = el as Partial<ChartElement> & Pick<ChartElement, 'type'>;
  const rawSeries = (Array.isArray(raw.series) ? raw.series : [])
    .filter((s): s is ChartSeries => typeof s === 'object' && s !== null)
    .slice(0, MAX_CHART_SERIES);
  const rawLabels = Array.isArray(raw.labels) ? raw.labels : [];
  const longest = Math.max(rawLabels.length, ...rawSeries.map((s) => (Array.isArray(s.values) ? s.values.length : 0)));
  const rows = Math.max(1, Math.min(MAX_CHART_ROWS, longest));
  const labels = Array.from({ length: rows }, (_, i) => {
    const label = rawLabels[i] as unknown;

    if (typeof label === 'string') return label;
    if (typeof label === 'number') return String(label);

    return defaultLabel(i);
  });
  const series = (rawSeries.length > 0 ? rawSeries : [{ name: defaultSeriesName(0), values: [] }]).map((s, i) => ({
    name: typeof s.name === 'string' ? s.name : defaultSeriesName(i),
    values: Array.from({ length: rows }, (_, j) => toValue(Array.isArray(s.values) ? s.values[j] : undefined)),
  }));
  const colors = (Array.isArray(raw.colors) ? raw.colors : []).filter((c): c is string => typeof c === 'string' && c.length > 0);
  const fontSize = typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize) ? raw.fontSize : 16;

  return {
    ...el,
    chart: typeof raw.chart === 'string' && KIND_KEYS.has(raw.chart) ? raw.chart : 'column',
    labels,
    series,
    colors: colors.length > 0 ? colors : [...DEFAULT_CHART_COLORS],
    showLegend: typeof raw.showLegend === 'boolean' ? raw.showLegend : true,
    showLabels: typeof raw.showLabels === 'boolean' ? raw.showLabels : false,
    showGrid: typeof raw.showGrid === 'boolean' ? raw.showGrid : true,
    fontFamily: typeof raw.fontFamily === 'string' && raw.fontFamily ? raw.fontFamily : DEFAULT_FONT,
    fontSize: Math.max(4, Math.min(400, fontSize)),
    color: typeof raw.color === 'string' && raw.color ? raw.color : DEFAULT_CHART_TEXT,
  };
}

// ── แก้ข้อมูล (แผงแก้ไขข้อมูลชาร์ต) ─────────────────────────────────

export type ChartData = Pick<ChartElement, 'labels' | 'series' | 'colors'>;

/// สีถัดไปที่ยังไม่มีในรายการ (เพิ่มชุดข้อมูลหรือชิ้นใหม่)
function nextColor(colors: string[]): string {
  return DEFAULT_CHART_COLORS.find((c) => !colors.includes(c)) ?? DEFAULT_CHART_COLORS[colors.length % DEFAULT_CHART_COLORS.length];
}

/// ให้มีสีอย่างน้อย `count` สี (ไม่ให้ชุด/ชิ้นใหม่ซ้ำสีกับของเดิมเพราะวนสี)
function ensureColors(colors: string[], count: number): string[] {
  const out = [...colors];

  while (out.length < Math.min(count, DEFAULT_CHART_COLORS.length)) out.push(nextColor(out));

  return out;
}

/// เขียนตาราง (ข้อความ 2 มิติ) ลงกริดที่ตำแหน่ง (row, col) · ขยายรายการ/ชุดข้อมูลให้พอเอง
/// ใช้ทั้งพิมพ์ทีละช่อง (ตาราง 1×1) และวางข้อมูลจาก Excel/ชีต
export function writeCells(el: ChartElement, row: number, col: number, matrix: string[][]): ChartData {
  const width = Math.max(0, ...matrix.map((r) => r.length));
  const rowsNeeded = Math.min(MAX_CHART_ROWS, Math.max(el.labels.length, row + matrix.length - 1));
  const seriesNeeded = Math.min(MAX_CHART_SERIES, Math.max(el.series.length, col + width - 1));
  const labels = Array.from({ length: rowsNeeded }, (_, i) => el.labels[i] ?? defaultLabel(i));
  const series = Array.from({ length: seriesNeeded }, (_, s) => ({
    name: el.series[s]?.name ?? defaultSeriesName(s),
    values: Array.from({ length: rowsNeeded }, (_, i) => el.series[s]?.values[i] ?? 0),
  }));

  matrix.forEach((cells, dr) => {
    const r = row + dr;

    cells.forEach((text, dc) => {
      const c = col + dc;

      if (r === 0 && c === 0) return;
      if (r > rowsNeeded || c > seriesNeeded) return;
      if (r === 0) series[c - 1].name = text.trim();
      else if (c === 0) labels[r - 1] = text.trim();
      else series[c - 1].values[r - 1] = parseNumber(text) ?? 0;
    });
  });

  return { labels, series, colors: ensureColors(el.colors, colorsFollowRows(el.chart) ? labels.length : series.length) };
}

export function addRow(el: ChartElement): ChartData {
  if (el.labels.length >= MAX_CHART_ROWS) return { labels: el.labels, series: el.series, colors: el.colors };

  const labels = [...el.labels, defaultLabel(el.labels.length)];

  return {
    labels,
    series: el.series.map((s) => ({ ...s, values: [...s.values, 0] })),
    colors: colorsFollowRows(el.chart) ? ensureColors(el.colors, labels.length) : el.colors,
  };
}

export function removeRow(el: ChartElement, index: number): ChartData {
  if (el.labels.length <= 1) return { labels: el.labels, series: el.series, colors: el.colors };

  const colors = colorsFollowRows(el.chart) && el.colors.length > 1 ? el.colors.filter((_, i) => i !== index) : el.colors;

  return {
    labels: el.labels.filter((_, i) => i !== index),
    series: el.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== index) })),
    colors,
  };
}

export function addSeries(el: ChartElement): ChartData {
  if (el.series.length >= MAX_CHART_SERIES) return { labels: el.labels, series: el.series, colors: el.colors };

  const series = [...el.series, { name: defaultSeriesName(el.series.length), values: el.labels.map(() => 0) }];

  return { labels: el.labels, series, colors: colorsFollowRows(el.chart) ? el.colors : ensureColors(el.colors, series.length) };
}

export function removeSeries(el: ChartElement, index: number): ChartData {
  if (el.series.length <= 1) return { labels: el.labels, series: el.series, colors: el.colors };

  const colors = !colorsFollowRows(el.chart) && el.colors.length > 1 ? el.colors.filter((_, i) => i !== index) : el.colors;

  return { labels: el.labels, series: el.series.filter((_, i) => i !== index), colors };
}

// ── วางข้อมูลจาก Excel / Google Sheets ───────────────────────────────

/// ข้อความที่คัดลอกจากสเปรดชีต: แถวคั่นด้วยขึ้นบรรทัด คอลัมน์คั่นด้วย Tab · ตัดแถวว่างท้ายทิ้ง
/// เซลล์ที่มีเครื่องหมายคำพูดครอบ (Excel ใส่ให้เมื่อเซลล์มีขึ้นบรรทัด) เอาคำพูดออก
export function parseTabular(text: string): string[][] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');

  while (rows.length > 0 && rows[rows.length - 1].trim() === '') rows.pop();

  return rows.map((row) =>
    row.split('\t').map((cell) => {
      const trimmed = cell.trim();

      return /^"[\s\S]*"$/.test(trimmed) ? trimmed.slice(1, -1).replace(/""/g, '"') : trimmed;
    }),
  );
}

/// ข้อความที่วางเป็นตาราง (มีหลายช่อง) หรือแค่ข้อความเดียว
export function isTabular(text: string): boolean {
  const rows = parseTabular(text);

  return rows.length > 1 || (rows[0]?.length ?? 0) > 1;
}

/// แปลงตารางทั้งชุดเป็นข้อมูลชาร์ต — เดาเองว่าแถวแรกเป็นหัวคอลัมน์ และคอลัมน์แรกเป็นชื่อรายการหรือไม่
/// (ดูจากว่าเป็นตัวเลขหรือไม่) · ตารางว่าง = null
export function tableToChart(rows: string[][]): Pick<ChartElement, 'labels' | 'series'> | null {
  const body0 = rows.filter((r) => r.some((c) => c.trim() !== ''));

  if (body0.length === 0) return null;

  const isNum = (c: string | undefined) => c !== undefined && c.trim() !== '' && parseNumber(c) !== null;
  const hasHeader = body0.length > 1 && body0[0].slice(1).some((c) => c.trim() !== '' && !isNum(c));
  const body = (hasHeader ? body0.slice(1) : body0).slice(0, MAX_CHART_ROWS);
  const hasLabels = body.some((r) => r[0] !== undefined && r[0].trim() !== '' && !isNum(r[0]));
  const offset = hasLabels ? 1 : 0;
  const width = Math.max(...body0.map((r) => r.length));
  const seriesCount = Math.max(1, Math.min(MAX_CHART_SERIES, width - offset));

  return {
    labels: body.map((r, i) => (hasLabels ? (r[0] ?? '').trim() : defaultLabel(i))),
    series: Array.from({ length: seriesCount }, (_, s) => ({
      name: (hasHeader ? body0[0][s + offset]?.trim() : '') || defaultSeriesName(s),
      values: body.map((r) => parseNumber(r[s + offset] ?? '') ?? 0),
    })),
  };
}

/// ข้อความในช่องของกริด (ค่าตัวเลขไม่คั่นหลักพัน เพื่อแก้ต่อได้ง่าย)
export function cellText(el: ChartElement, row: number, col: number): string {
  if (row === 0) return col === 0 ? '' : (el.series[col - 1]?.name ?? '');
  if (col === 0) return el.labels[row - 1] ?? '';

  const value = el.series[col - 1]?.values[row - 1];

  return value === undefined ? '' : String(value);
}
