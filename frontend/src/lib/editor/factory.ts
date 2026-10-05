import { DEFAULT_CHART_COLORS, DEFAULT_CHART_TEXT, chartKindLabel, defaultLabel, defaultSeriesName, isAxisChart } from './chart-data';
import { DEFAULT_FONT } from './fonts';
import { findTablePreset, rowHeightFor, tableBody, type TablePresetKey } from './table';
import type { BrushKind, CanvasElement, ChartElement, ChartKind, ImageElement, PathElement, ShapeElement, ShapeKind, SvgElement, TableElement, TextElement } from './types';
import { isLineShape, newId } from './types';

/// สร้าง element ใหม่วางกลางหน้า · ขนาดตั้งต้นคิดตามสัดส่วนของหน้า
/// เพื่อให้หน้าเล็ก (นามบัตร) และหน้าใหญ่ (โปสเตอร์) ได้ขนาดที่ใช้งานได้ทั้งคู่

interface PageSize {
  width: number;
  height: number;
}

function base(page: PageSize, width: number, height: number, name: string) {
  return {
    id: newId(),
    name,
    x: Math.round((page.width - width) / 2),
    y: Math.round((page.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null as string | null,
  };
}

export type TextPreset = 'heading' | 'subheading' | 'body';

const TEXT_PRESETS: Record<TextPreset, { label: string; scale: number; weight: 400 | 700; text: string }> = {
  heading: { label: 'หัวเรื่อง', scale: 0.07, weight: 700, text: 'เพิ่มหัวเรื่อง' },
  subheading: { label: 'หัวข้อย่อย', scale: 0.045, weight: 700, text: 'เพิ่มหัวข้อย่อย' },
  body: { label: 'ข้อความ', scale: 0.028, weight: 400, text: 'เพิ่มข้อความในส่วนเนื้อหาเล็กน้อย' },
};

export function textPresetLabel(preset: TextPreset) {
  return TEXT_PRESETS[preset].label;
}

export function textPresetText(preset: TextPreset) {
  return TEXT_PRESETS[preset].text;
}

export function createText(
  page: PageSize,
  preset: TextPreset,
  options: { text?: string; fontFamily?: string; color?: string; fontWeight?: 400 | 700 } = {},
): TextElement {
  const spec = TEXT_PRESETS[preset];
  const short = Math.min(page.width, page.height);
  const fontSize = Math.max(12, Math.round(short * spec.scale));
  const width = Math.round(page.width * 0.6);

  return {
    ...base(page, width, fontSize * 1.4, spec.label),
    type: 'text',
    text: options.text ?? spec.text,
    fontFamily: options.fontFamily ?? DEFAULT_FONT,
    fontSize,
    fontWeight: options.fontWeight ?? spec.weight,
    italic: false,
    underline: false,
    align: 'center',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: options.color ?? 'rgb(15 23 42)',
  };
}

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'สี่เหลี่ยม',
  ellipse: 'วงรี',
  triangle: 'สามเหลี่ยม',
  'triangle-down': 'สามเหลี่ยมกลับหัว',
  diamond: 'สี่เหลี่ยมขนมเปียกปูน',
  pentagon: 'ห้าเหลี่ยม',
  hexagon: 'หกเหลี่ยม',
  octagon: 'แปดเหลี่ยม',
  star: 'ดาว',
  line: 'เส้นตรง',
  arrow: 'ลูกศร',
  curve: 'เส้นโค้ง',
  elbow: 'เส้นหักศอก',
};

export function shapeName(kind: ShapeKind) {
  return SHAPE_NAMES[kind];
}

export function createShape(page: PageSize, shape: ShapeKind, options: { rounded?: boolean } = {}): ShapeElement {
  const size = Math.round(Math.min(page.width, page.height) * 0.3);
  const isLine = isLineShape(shape);
  // เส้นตรง/ลูกศรบางเท่าความหนาเส้น · เส้นโค้งและหักศอกต้องมีความสูงให้เห็นรูปเส้น
  const height =
    shape === 'curve' || shape === 'elbow' ? Math.round(size * 0.4) : isLine ? Math.max(8, Math.round(size * 0.05)) : size;

  return {
    ...base(page, isLine ? Math.round(size * 1.6) : size, height, options.rounded ? 'สี่เหลี่ยมมุมโค้ง' : SHAPE_NAMES[shape]),
    type: 'shape',
    shape,
    fill: isLine ? null : 'rgb(0 76 153)',
    stroke: isLine ? 'rgb(15 23 42)' : null,
    strokeWidth: isLine ? Math.max(2, Math.round(size * 0.02)) : 0,
    cornerRadius: options.rounded ? Math.round(size * 0.15) : 0,
  };
}

/// สีของโน้ตแปะ (แบบ Canva) — พื้นอ่อนให้ตัวอักษรเข้มอ่านง่าย
export const STICKY_COLORS: { key: string; label: string; fill: string; swatch: string }[] = [
  { key: 'yellow', label: 'เหลือง', fill: 'rgb(254 243 160)', swatch: 'rgb(253 204 0)' },
  { key: 'orange', label: 'ส้ม', fill: 'rgb(255 214 165)', swatch: 'rgb(255 166 64)' },
  { key: 'pink', label: 'ชมพู', fill: 'rgb(255 191 200)', swatch: 'rgb(255 92 122)' },
  { key: 'blue', label: 'ฟ้า', fill: 'rgb(128 192 255)', swatch: 'rgb(84 160 255)' },
  { key: 'green', label: 'เขียว', fill: 'rgb(178 236 180)', swatch: 'rgb(62 196 98)' },
  { key: 'purple', label: 'ม่วง', fill: 'rgb(218 196 255)', swatch: 'rgb(178 110 255)' },
];

/// โน้ตแปะ = กล่องสี + ข้อความ จัดกลุ่มไว้ด้วยกัน (ดับเบิลคลิกที่ข้อความเพื่อพิมพ์)
export function createSticky(page: PageSize, colorKey: string): CanvasElement[] {
  const color = STICKY_COLORS.find((c) => c.key === colorKey) ?? STICKY_COLORS[0];
  const size = Math.round(Math.min(page.width, page.height) * 0.28);
  const groupId = newId('group');
  const pad = Math.round(size * 0.07);
  const fontSize = Math.max(10, Math.round(size * 0.08));
  const note: ShapeElement = {
    ...base(page, size, size, `โน้ต${color.label}`),
    groupId,
    type: 'shape',
    shape: 'rect',
    fill: color.fill,
    stroke: null,
    strokeWidth: 0,
    cornerRadius: Math.round(size * 0.02),
  };
  const text: TextElement = {
    ...base(page, size - pad * 2, fontSize * 1.4, 'ข้อความโน้ต'),
    x: note.x + pad,
    y: note.y + pad,
    groupId,
    type: 'text',
    text: 'เพิ่มข้อความ',
    fontFamily: DEFAULT_FONT,
    fontSize,
    fontWeight: 400,
    italic: false,
    underline: false,
    align: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: 'rgb(30 41 59)',
  };

  return [note, text];
}

/// เส้นวาดมือจากพิกัดหน้า → element ที่กล่องพอดีเส้น (เผื่อขอบครึ่งความหนา)
export function createPath(
  strokes: number[][],
  style: { color: string; strokeWidth: number; brush: BrushKind; name?: string },
): PathElement | null {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i += 2) {
      xs.push(stroke[i]);
      ys.push(stroke[i + 1]);
    }
  }

  if (xs.length === 0) return null;

  const pad = style.strokeWidth / 2;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const width = Math.max(1, Math.max(...xs) + pad - x);
  const height = Math.max(1, Math.max(...ys) + pad - y);
  const round = (v: number) => Math.round(v * 10000) / 10000;

  return {
    id: newId(),
    name: style.name ?? (style.brush === 'highlighter' ? 'ไฮไลท์' : 'ภาพวาด'),
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    type: 'path',
    strokes: strokes.map((stroke) => stroke.map((v, i) => round(i % 2 === 0 ? (v - x) / width : (v - y) / height))),
    color: style.color,
    strokeWidth: style.strokeWidth,
    brush: style.brush,
  };
}

/// ย้าย element ไปกลางหน้า (ลายเซ็นที่สร้างจากแผ่นวาดขนาดอื่น) และย่อให้กว้างไม่เกินที่กำหนด
export function placeCentered<T extends CanvasElement>(el: T, page: PageSize, maxWidth: number): T {
  const scale = el.width > maxWidth ? maxWidth / el.width : 1;
  const width = el.width * scale;
  const height = el.height * scale;

  return {
    ...el,
    width,
    height,
    x: Math.round((page.width - width) / 2),
    y: Math.round((page.height - height) / 2),
    ...(el.type === 'path' ? { strokeWidth: el.strokeWidth * scale } : {}),
  };
}

/// รูปขนาดพอดีหน้า (ไม่เกิน 60% ของด้านสั้น) โดยคงสัดส่วนเดิม
export function createImage(
  page: PageSize,
  source: { src: string; assetId: string | null; naturalWidth: number; naturalHeight: number; name: string },
): ImageElement {
  const max = Math.min(page.width, page.height) * 0.6;
  const ratio = source.naturalWidth / Math.max(1, source.naturalHeight);
  const width = ratio >= 1 ? max : max * ratio;
  const height = ratio >= 1 ? max / ratio : max;

  return {
    ...base(page, Math.round(width), Math.round(height), source.name),
    type: 'image',
    assetId: source.assetId,
    src: source.src,
    cornerRadius: 0,
    flipX: false,
    flipY: false,
  };
}

export function createSvg(page: PageSize, svg: string, name: string): SvgElement {
  const size = Math.round(Math.min(page.width, page.height) * 0.2);

  return {
    ...base(page, size, size, name),
    type: 'svg',
    svg,
    color: 'rgb(0 76 153)',
  };
}

/// ตารางว่างตามรูปแบบสำเร็จรูป · กว้าง 70% ของหน้า ตัวอักษรตามด้านสั้นของหน้า
/// ความสูงเริ่มที่แถวละหนึ่งบรรทัด (store ขยายให้พอดีข้อความทุกครั้งที่แก้)
export function createTable(page: PageSize, rows: number, cols: number, preset?: TablePresetKey): TableElement {
  const spec = findTablePreset(preset);
  const fontSize = Math.max(10, Math.round(Math.min(page.width, page.height) * 0.024));
  const body = tableBody(rows, cols, fontSize, spec);
  const width = Math.round(page.width * 0.7);
  const height = Math.round(rowHeightFor({ fontSize }, 1) * body.cells.length);

  return { ...base(page, width, height, 'ตาราง'), ...body };
}

/// ชาร์ตใหม่พร้อมค่าตัวอย่างที่ผู้ใช้พิมพ์ทับได้ทันที (ชื่อ "รายการ 1…" บอกชัดว่าเป็นค่าที่ต้องแก้)
///
/// แท่ง/เส้น/พื้นที่ได้ 2 ชุดข้อมูล × 4 รายการ · วงกลม/โดนัทได้ 1 ชุด × 4 ชิ้น · วงแหวนความคืบหน้าได้ค่าเดียว
export function createChart(page: PageSize, kind: ChartKind): ChartElement {
  const short = Math.min(page.width, page.height);
  const axis = isAxisChart(kind);
  const width = Math.round(short * (kind === 'progress-ring' ? 0.4 : 0.62));
  const height = kind === 'progress-ring' ? width : Math.round(width * (axis ? 0.72 : 0.92));
  const fontSize = Math.max(12, Math.round(short * 0.022));
  const labels = kind === 'progress-ring' ? ['ความคืบหน้า'] : [0, 1, 2, 3].map(defaultLabel);
  const series =
    kind === 'progress-ring'
      ? [{ name: defaultSeriesName(0), values: [70] }]
      : axis
        ? [
            { name: defaultSeriesName(0), values: [12, 19, 9, 15] },
            { name: defaultSeriesName(1), values: [8, 11, 14, 10] },
          ]
        : [{ name: defaultSeriesName(0), values: [40, 25, 20, 15] }];

  return {
    ...base(page, width, height, chartKindLabel(kind)),
    type: 'chart',
    chart: kind,
    labels,
    series,
    colors: [...DEFAULT_CHART_COLORS],
    showLegend: kind !== 'progress-ring',
    showLabels: !axis,
    showGrid: true,
    fontFamily: DEFAULT_FONT,
    fontSize,
    color: DEFAULT_CHART_TEXT,
  };
}

// ── เซ็ตฟอนต์ (แผงข้อความ) ─────────────────────────────────────────

export interface FontSetLine {
  text: string;
  font: string;
  /// ขนาดเทียบกับด้านสั้นของหน้า
  scale: number;
  weight: 400 | 700;
  color: string;
  italic?: boolean;
  letterSpacing?: number;
}

export interface FontSet {
  key: string;
  label: string;
  lines: FontSetLine[];
}

/// ชุดตัวอักษรที่ทีมจัดไว้จากฟอนต์ OFL ในเครื่อง — กดแล้วได้ข้อความหลายบรรทัดจัดกลุ่มไว้ แก้ข้อความได้ทันที
export const FONT_SETS: FontSet[] = [
  {
    key: 'menu',
    label: 'เมนูอาหาร',
    lines: [
      { text: 'เย็นฉ่ำ\nหอมละมุน\n&รสเลิศ', font: 'Kanit', scale: 0.075, weight: 700, color: 'rgb(15 23 42)' },
      { text: 'เมนูใหม่ประจำสัปดาห์', font: 'Sarabun', scale: 0.022, weight: 400, color: 'rgb(51 65 85)' },
    ],
  },
  {
    key: 'quote',
    label: 'คำคม',
    lines: [
      { text: 'จงทำทุกสิ่งในวันนี้\nให้ตัวเองในอนาคต\nขอบคุณตัวเอง', font: 'Charmonman', scale: 0.05, weight: 700, color: 'rgb(15 23 42)' },
      { text: 'บันทึกเล็ก ๆ ถึงตัวเรา', font: 'Sarabun', scale: 0.018, weight: 400, color: 'rgb(71 85 105)', italic: true },
    ],
  },
  {
    key: 'article',
    label: 'บทความ',
    lines: [
      { text: 'ศิลปะแห่งการถนอมอาหาร', font: 'Pridi', scale: 0.045, weight: 700, color: 'rgb(15 23 42)' },
      {
        text: 'ภูมิปัญญาที่ส่งต่อกันมาหลายชั่วอายุคน เพื่อเก็บรสชาติของฤดูกาลไว้ได้นานขึ้น',
        font: 'Sarabun',
        scale: 0.02,
        weight: 400,
        color: 'rgb(51 65 85)',
      },
    ],
  },
  {
    key: 'sale',
    label: 'ลดราคา',
    lines: [
      { text: 'ลดพิเศษ', font: 'Prompt', scale: 0.04, weight: 700, color: 'rgb(15 23 42)' },
      { text: '50%', font: 'Prompt', scale: 0.1, weight: 700, color: 'rgb(220 38 38)' },
      { text: 'เฉพาะวันนี้เท่านั้น', font: 'Noto Sans Thai', scale: 0.018, weight: 400, color: 'rgb(71 85 105)' },
    ],
  },
  {
    key: 'thanks',
    label: 'ขอบคุณ',
    lines: [{ text: 'ขอบคุณ', font: 'Sriracha', scale: 0.1, weight: 400, color: 'rgb(219 39 119)' }],
  },
  {
    key: 'announce',
    label: 'ประกาศ',
    lines: [
      { text: 'ประกาศรับสมัคร', font: 'Mitr', scale: 0.055, weight: 700, color: 'rgb(0 76 153)' },
      { text: 'นักศึกษาช่วยงานกิจกรรมคณะ', font: 'Sarabun', scale: 0.024, weight: 400, color: 'rgb(15 23 42)' },
    ],
  },
  {
    key: 'seminar',
    label: 'สัมมนา',
    lines: [
      { text: 'งานสัมมนาวิชาการ', font: 'Chakra Petch', scale: 0.05, weight: 700, color: 'rgb(15 23 42)', letterSpacing: 1 },
      { text: 'วิทยาการคอมพิวเตอร์ 2569', font: 'IBM Plex Sans Thai', scale: 0.022, weight: 400, color: 'rgb(13 148 136)' },
    ],
  },
  {
    key: 'birthday',
    label: 'วันเกิด',
    lines: [
      { text: 'สุขสันต์', font: 'Itim', scale: 0.045, weight: 400, color: 'rgb(124 58 237)' },
      { text: 'วันเกิด', font: 'Kanit', scale: 0.08, weight: 700, color: 'rgb(15 23 42)' },
    ],
  },
  {
    key: 'certificate',
    label: 'ทางการ',
    lines: [
      { text: 'เกียรติบัตร', font: 'Noto Sans Thai Looped', scale: 0.06, weight: 700, color: 'rgb(146 64 14)' },
      { text: 'มอบให้ไว้เพื่อแสดงว่า', font: 'Noto Sans Thai Looped', scale: 0.022, weight: 400, color: 'rgb(68 64 60)' },
    ],
  },
  {
    key: 'party',
    label: 'ปาร์ตี้',
    lines: [{ text: 'ปาร์ตี้\nสิ้นปี!', font: 'Mitr', scale: 0.085, weight: 700, color: 'rgb(13 148 136)' }],
  },
];

/// สร้างข้อความของเซ็ตฟอนต์ เรียงลงมาจัดกึ่งกลาง แล้วจัดกลุ่ม
export function createFontSet(page: PageSize, set: FontSet, measure: (el: TextElement) => number): TextElement[] {
  const short = Math.min(page.width, page.height);
  const groupId = set.lines.length > 1 ? newId('group') : null;
  const width = Math.round(page.width * 0.6);
  const gap = Math.round(short * 0.01);
  const items = set.lines.map((line) => {
    const fontSize = Math.max(10, Math.round(short * line.scale));
    const el: TextElement = {
      ...base(page, width, fontSize * 1.3, set.label),
      groupId,
      type: 'text',
      text: line.text,
      fontFamily: line.font,
      fontSize,
      fontWeight: line.weight,
      italic: line.italic ?? false,
      underline: false,
      align: 'center',
      lineHeight: 1.3,
      letterSpacing: line.letterSpacing ?? 0,
      color: line.color,
    };

    return { ...el, height: measure(el) };
  });
  const total = items.reduce((sum, el) => sum + el.height, 0) + gap * (items.length - 1);
  let y = Math.round((page.height - total) / 2);

  return items.map((el) => {
    const placed = { ...el, y };

    y += el.height + gap;

    return placed;
  });
}

/// ชื่อที่แสดงในแผงเลเยอร์ (ข้อความใช้เนื้อหาต้น ๆ)
export function layerLabel(el: { type: string; name: string; text?: string }): string {
  if (el.type === 'text' && el.text) return el.text.split('\n')[0].slice(0, 40) || 'ข้อความ';

  return el.name || (el.type === 'path' ? 'ภาพวาด' : el.type === 'table' ? 'ตาราง' : el.type === 'chart' ? 'ชาร์ต' : 'ชิ้นงาน');
}
