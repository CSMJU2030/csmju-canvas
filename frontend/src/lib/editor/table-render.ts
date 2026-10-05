import { cssFamily } from './fonts';
import { center, rotatePoint, type Point, type Rect } from './geometry';
import { layoutLines, requestFont } from './render';
import {
  TABLE_LINE_HEIGHT,
  cellAtPoint,
  cellColor,
  cellFill,
  cellPadding,
  cellRectOf,
  cellWeight,
  fitTable,
  tableLayout,
  tableSize,
  type CellRef,
  type LineCounter,
  type TableLayout,
} from './table';
import { useTableUi } from './table-ui';
import type { TableElement, TextElement } from './types';

/// วาดตารางลง canvas 2D และส่งออกเป็น SVG — ใช้ตัวตัดคำภาษาไทยชุดเดียวกับกล่องข้อความ (render.ts)

/// ข้อความในช่องในรูปที่ layoutLines รับ (ตัดคำตามความกว้างช่องหักระยะห่างขอบ)
function cellText(el: TableElement, text: string, width: number, weight: 400 | 700): TextElement {
  return {
    text,
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    fontWeight: weight,
    italic: false,
    letterSpacing: 0,
    width,
  } as TextElement;
}

/// ตัวนับบรรทัดของตารางนี้ · ไม่ส่ง ctx = ใช้ canvas วัดขนาดของ render.ts
export function lineCounter(el: TableElement, ctx?: CanvasRenderingContext2D): LineCounter {
  return (text, width, weight) => layoutLines(cellText(el, text, width, weight), ctx).length;
}

/// น้ำหนักฟอนต์ที่ตารางใช้ (หัวตารางเป็นตัวหนา) — ให้ preload ก่อนส่งออก
export function tableFonts(el: TableElement): (400 | 700)[] {
  return el.header ? [400, 700] : [400];
}

/// ให้กล่องสูงพอดีข้อความ (store เรียกทุกครั้งที่แก้ตาราง)
export function fitTableBox(el: TableElement): TableElement {
  return fitTable(el, lineCounter(el));
}

export function measureTable(el: TableElement): TableLayout {
  return tableLayout(el, lineCounter(el));
}

/// ช่องที่อยู่ใต้จุดบนหน้า
export function tableCellAt(el: TableElement, p: Point): CellRef | null {
  return cellAtPoint(el, measureTable(el), p);
}

/// กล่องของช่องและความสูงของข้อความในช่อง (ตัวแก้ข้อความใช้จัดตำแหน่งให้ตรงกับที่วาด)
export function tableCellBox(el: TableElement, cell: CellRef): { rect: Rect; textHeight: number } | null {
  const layout = measureTable(el);
  const rect = cellRectOf(layout, cell.row, cell.col);

  if (!rect) return null;

  const text = el.cells[cell.row][cell.col].text;
  const lines = text ? lineCounter(el)(text, Math.max(1, rect.width - cellPadding(el) * 2), cellWeight(el, cell.row)) : 1;

  return { rect, textHeight: Math.max(1, lines) * el.fontSize * TABLE_LINE_HEIGHT };
}

/// มุมทั้งสี่ของช่องบนหน้า (หมุนตามตาราง) — ใช้วาดกรอบช่องที่เลือก
export function tableCellCorners(el: TableElement, cell: CellRef): Point[] | null {
  const rect = cellRectOf(measureTable(el), cell.row, cell.col);

  if (!rect) return null;

  const c = center(el);

  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((p) => (el.rotation ? rotatePoint(p, c, el.rotation) : p));
}

/// ช่องที่กำลังพิมพ์อยู่ในหน้าแก้ไข — ไม่วาดข้อความของช่องนั้น (ช่องพิมพ์ทับอยู่แล้ว)
function editingCell(el: TableElement): CellRef | null {
  const { cell, editing } = useTableUi.getState();

  return editing && cell && cell.id === el.id ? cell : null;
}

/// เส้นของตารางเป็นรายการส่วนของเส้น [x1, y1, x2, y2]
function gridSegments(el: TableElement, layout: TableLayout): number[][] {
  if (el.borderWidth <= 0 || el.lines === 'none') return [];

  const right = el.x + el.width;
  const bottom = el.y + layout.height;
  const segments: number[][] = [];

  for (const row of layout.rows) segments.push([el.x, row.y, right, row.y]);
  segments.push([el.x, bottom, right, bottom]);

  if (el.lines === 'all') {
    for (const col of layout.cols) segments.push([col.x, el.y, col.x, bottom]);
    segments.push([right, el.y, right, bottom]);
  }

  return segments;
}

export function drawTable(ctx: CanvasRenderingContext2D, el: TableElement) {
  for (const weight of tableFonts(el)) requestFont(el.fontFamily, weight);

  const layout = tableLayout(el, lineCounter(el, ctx));
  const { rows, cols } = tableSize(el);
  const pad = cellPadding(el);
  const lineHeight = el.fontSize * TABLE_LINE_HEIGHT;
  const hidden = editingCell(el);

  // สีพื้นช่อง — ขยายเกินครึ่งพิกเซลเพื่อไม่ให้เห็นรอยต่อระหว่างช่องที่สีเดียวกัน
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fill = cellFill(el, r, c);

      if (!fill) continue;

      const { x, width } = layout.cols[c];
      const { y, height } = layout.rows[r];

      ctx.fillStyle = fill;
      ctx.fillRect(x, y, width + (c < cols - 1 ? 0.5 : 0), height + (r < rows - 1 ? 0.5 : 0));
    }
  }

  const segments = gridSegments(el, layout);

  if (segments.length) {
    ctx.strokeStyle = el.borderColor;
    ctx.lineWidth = el.borderWidth;
    ctx.lineCap = 'square';
    ctx.setLineDash([]);
    ctx.beginPath();

    for (const [x1, y1, x2, y2] of segments) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }

    ctx.stroke();
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = el.align;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const text = el.cells[r][c].text;

      if (!text || (hidden && hidden.row === r && hidden.col === c)) continue;

      const { x, width } = layout.cols[c];
      const { y, height } = layout.rows[r];
      const lines = layoutLines(cellText(el, text, Math.max(1, width - pad * 2), cellWeight(el, r)), ctx);
      const top = y + (height - lines.length * lineHeight) / 2;
      const anchor = el.align === 'left' ? x + pad : el.align === 'center' ? x + width / 2 : x + width - pad;

      ctx.fillStyle = cellColor(el, r, c);
      lines.forEach((line, i) => {
        if (line.text) ctx.fillText(line.text, anchor, top + lineHeight * i + lineHeight / 2);
      });
    }
  }
}

// ── SVG ─────────────────────────────────────────────────────────────

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => Math.round(v * 100) / 100;

/// ตารางเป็นเวกเตอร์: สี่เหลี่ยมสีพื้น · เส้นตาราง · ข้อความแยกบรรทัดตามที่ตัดคำบนจอ
export function tableSvg(el: TableElement): string {
  const layout = measureTable(el);
  const { rows, cols } = tableSize(el);
  const pad = cellPadding(el);
  const lineHeight = el.fontSize * TABLE_LINE_HEIGHT;
  const anchor = el.align === 'left' ? 'start' : el.align === 'center' ? 'middle' : 'end';
  const parts: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fill = cellFill(el, r, c);

      if (fill) {
        parts.push(`<rect x="${n(layout.cols[c].x)}" y="${n(layout.rows[r].y)}" width="${n(layout.cols[c].width)}" height="${n(layout.rows[r].height)}" fill="${esc(fill)}"/>`);
      }
    }
  }

  const segments = gridSegments(el, layout);

  if (segments.length) {
    const d = segments.map(([x1, y1, x2, y2]) => `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`).join('');

    parts.push(`<path d="${d}" fill="none" stroke="${esc(el.borderColor)}" stroke-width="${n(el.borderWidth)}" stroke-linecap="square"/>`);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const text = el.cells[r][c].text;

      if (!text) continue;

      const { x, width } = layout.cols[c];
      const { y, height } = layout.rows[r];
      const weight = cellWeight(el, r);
      const lines = layoutLines(cellText(el, text, Math.max(1, width - pad * 2), weight));
      const top = y + (height - lines.length * lineHeight) / 2;
      const ax = el.align === 'left' ? x + pad : el.align === 'center' ? x + width / 2 : x + width - pad;
      const tspans = lines.map((line, i) => `<tspan x="${n(ax)}" y="${n(top + lineHeight * i + lineHeight / 2)}">${esc(line.text)}</tspan>`).join('');
      const style = `font-family:${esc(cssFamily(el.fontFamily))};font-size:${n(el.fontSize)}px;font-weight:${weight};`;

      parts.push(`<text text-anchor="${anchor}" dominant-baseline="central" fill="${esc(cellColor(el, r, c))}" style="${style}" xml:space="preserve">${tspans}</text>`);
    }
  }

  return parts.join('');
}
