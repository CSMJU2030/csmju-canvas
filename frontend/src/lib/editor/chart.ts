import { chartAlpha, chartColor, dataRange, formatTick, formatValue, isAxisChart, niceScale, piePercentages } from './chart-data';
import { cssFamily } from './fonts';
import type { ChartElement } from './types';

/// วาดชาร์ต — จัดวางครั้งเดียวเป็น "ฉาก" ของรูปพื้นฐาน (สี่เหลี่ยม เส้น ชิ้นวงกลม ข้อความ)
/// แล้วให้ตัววาดสองแบบใช้ร่วมกัน: canvas 2D (หน้าจอ PNG JPEG PDF) และ SVG (ส่งออกเวกเตอร์)
/// ภาพทั้งสองแบบจึงตรงกันเสมอ
///
/// พิกัดทุกตัวเป็นพิกัดหน้า · การหมุนและความโปร่งใสผู้เรียก (drawElement / pageToSvg) ตั้งไว้แล้ว

export type ChartPrim =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: 'poly'; points: number[]; fill: string | null; stroke: string | null; width: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string | null; stroke: string | null; width: number }
  /// ชิ้นวงกลม (inner > 0 = ชิ้นโดนัท) · มุมเป็นเรเดียน 0 = ทิศขวา ตามเข็มนาฬิกา
  | { kind: 'sector'; cx: number; cy: number; r: number; inner: number; start: number; end: number; fill: string }
  /// เส้นโค้งปลายมน (วงแหวนความคืบหน้า)
  | { kind: 'arc'; cx: number; cy: number; r: number; start: number; end: number; stroke: string; width: number }
  | { kind: 'text'; x: number; y: number; text: string; align: 'left' | 'center' | 'right'; size: number; weight: 400 | 700; color: string };

/// วัดความกว้างข้อความ (px) ตามขนาดและน้ำหนัก
export type Measure = (text: string, size: number, weight: 400 | 700) => number;

const TAU = Math.PI * 2;
const WHITE = 'rgb(255 255 255)';

const graphemes =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;

/// ตัดข้อความให้พอดีความกว้าง ต่อท้ายด้วย … (ตัดทีละกลุ่มอักษร ไม่ทิ้งสระ/วรรณยุกต์ไทยลอย)
function fitText(text: string, max: number, size: number, weight: 400 | 700, measure: Measure): string {
  if (max <= 0) return '';
  if (measure(text, size, weight) <= max) return text;

  const parts = graphemes ? Array.from(graphemes.segment(text), (s) => s.segment) : Array.from(text);

  while (parts.length > 0 && measure(`${parts.join('')}…`, size, weight) > max) parts.pop();

  return parts.length > 0 ? `${parts.join('')}…` : '';
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/// คำอธิบายสี (legend) ใต้ชาร์ต: จุดสี + ชื่อ เรียงกึ่งกลาง ขึ้นบรรทัดใหม่เมื่อเต็ม
function legend(
  items: { label: string; color: string }[],
  box: Box,
  size: number,
  textColor: string,
  measure: Measure,
): { prims: ChartPrim[]; height: number } {
  const dot = size * 0.36;
  const gap = size * 0.4;
  const spacing = size * 1.1;
  const lineHeight = size * 1.6;
  const maxItem = box.w;
  const sized = items.map((item) => {
    const text = fitText(item.label, Math.max(0, maxItem - dot * 2 - gap), size, 400, measure);

    return { ...item, text, width: dot * 2 + gap + measure(text, size, 400) };
  });
  const lines: (typeof sized)[] = [];
  let current: typeof sized = [];
  let used = 0;

  for (const item of sized) {
    const need = (current.length > 0 ? spacing : 0) + item.width;

    if (current.length > 0 && used + need > box.w) {
      lines.push(current);
      current = [];
      used = 0;
    }

    used += (current.length > 0 ? spacing : 0) + item.width;
    current.push(item);
  }

  if (current.length > 0) lines.push(current);

  const height = lines.length * lineHeight;
  const prims: ChartPrim[] = [];

  lines.forEach((line, li) => {
    const total = line.reduce((sum, item, i) => sum + item.width + (i > 0 ? spacing : 0), 0);
    let x = box.x + (box.w - total) / 2;
    const y = box.y + box.h - height + li * lineHeight + lineHeight / 2;

    for (const item of line) {
      prims.push({ kind: 'circle', cx: x + dot, cy: y, r: dot, fill: item.color, stroke: null, width: 0 });
      prims.push({ kind: 'text', x: x + dot * 2 + gap, y, text: item.text, align: 'left', size, weight: 400, color: textColor });
      x += item.width + spacing;
    }
  });

  return { prims, height };
}

/// จัดวางชาร์ตเป็นรูปพื้นฐาน · `grow` 0–1 = แท่ง/เส้น/ชิ้นงอกขึ้นตอนแอนิเมชันเข้า (1 = เต็ม)
export function chartScene(el: ChartElement, measure: Measure, grow = 1): ChartPrim[] {
  const g = Math.max(0, Math.min(1, grow));
  const ease = 1 - Math.pow(1 - g, 3);

  if (el.width < 4 || el.height < 4) return [];
  if (el.chart === 'progress-ring') return progressScene(el, ease);
  if (el.chart === 'pie' || el.chart === 'donut') return pieScene(el, measure, ease, g >= 1);
  if (isAxisChart(el.chart)) return axisScene(el, measure, ease, g >= 1);

  return [];
}

function axisScene(el: ChartElement, measure: Measure, ease: number, done: boolean): ChartPrim[] {
  const fs = el.fontSize;
  const small = fs * 0.85;
  const pad = fs * 0.4;
  const prims: ChartPrim[] = [];
  const box: Box = { x: el.x + pad, y: el.y + pad, w: el.width - pad * 2, h: el.height - pad * 2 };
  const horizontal = el.chart === 'bar';
  const multi = el.series.length > 1;
  const lg = el.showLegend
    ? legend(el.series.map((s, i) => ({ label: s.name, color: chartColor(el, i) })), box, fs, el.color, measure)
    : { prims: [], height: 0 };
  const legendGap = lg.height > 0 ? fs * 0.5 : 0;
  const { min, max } = dataRange(el.series);
  const scale = niceScale(min, max, horizontal ? Math.max(2, Math.min(6, Math.floor(box.w / (fs * 5)))) : Math.max(2, Math.min(6, Math.floor(box.h / (fs * 2.5)))));
  const tickTexts = scale.ticks.map(formatTick);
  const gridColor = chartAlpha(el.color, 0.16);
  const axisColor = chartAlpha(el.color, 0.45);
  const lineW = Math.max(1, fs * 0.06);
  const n = el.labels.length;

  prims.push(...lg.prims);

  if (horizontal) {
    const catW = Math.min(Math.max(0, ...el.labels.map((l) => measure(l, fs, 400))) + fs * 0.6, box.w * 0.35);
    const longest = Math.max(0, ...el.series.flatMap((s) => s.values.map((v) => measure(formatValue(v), small, 400))));
    const left = box.x + catW + (min < 0 && el.showLabels ? longest + fs * 0.3 : 0);
    const right = box.x + box.w - (el.showLabels ? longest + fs * 0.4 : fs * 0.4);
    const top = box.y;
    const bottom = box.y + box.h - lg.height - legendGap - (el.showGrid ? fs * 1.5 : 0);

    if (right - left < 4 || bottom - top < 4) return prims;

    const xOf = (v: number) => left + ((v - scale.min) / (scale.max - scale.min)) * (right - left);
    const band = (bottom - top) / n;

    if (el.showGrid) {
      scale.ticks.forEach((t, i) => {
        prims.push({ kind: 'line', x1: xOf(t), y1: top, x2: xOf(t), y2: bottom, stroke: gridColor, width: lineW });
        prims.push({ kind: 'text', x: xOf(t), y: bottom + fs * 0.8, text: tickTexts[i], align: 'center', size: small, weight: 400, color: el.color });
      });
    }

    const groupH = band * (multi ? 0.75 : 0.62);
    const barH = groupH / el.series.length;

    el.labels.forEach((label, i) => {
      const cy = top + band * (i + 0.5);

      prims.push({ kind: 'text', x: left - fs * 0.3 - (min < 0 && el.showLabels ? longest + fs * 0.3 : 0), y: cy, text: fitText(label, catW - fs * 0.6, fs, 400, measure), align: 'right', size: fs, weight: 400, color: el.color });

      el.series.forEach((s, si) => {
        const v = s.values[i] ?? 0;
        const y = cy - groupH / 2 + si * barH;
        const x0 = xOf(0);
        const x1 = xOf(v * ease);

        prims.push({ kind: 'rect', x: Math.min(x0, x1), y: y + barH * 0.06, w: Math.abs(x1 - x0), h: barH * 0.88, fill: chartColor(el, si) });

        if (el.showLabels && done) {
          prims.push({ kind: 'text', x: v >= 0 ? x1 + fs * 0.3 : x1 - fs * 0.3, y: y + barH / 2, text: formatValue(v), align: v >= 0 ? 'left' : 'right', size: small, weight: 400, color: el.color });
        }
      });
    });

    prims.push({ kind: 'line', x1: xOf(0), y1: top, x2: xOf(0), y2: bottom, stroke: axisColor, width: lineW });

    return prims;
  }

  const axisW = el.showGrid ? Math.max(0, ...tickTexts.map((t) => measure(t, small, 400))) + fs * 0.5 : 0;
  const left = box.x + axisW;
  const right = box.x + box.w;
  const top = box.y + (el.showLabels ? fs * 1.1 : small * 0.6);
  const bottom = box.y + box.h - lg.height - legendGap - fs * 1.6;

  if (right - left < 4 || bottom - top < 4) return prims;

  const yOf = (v: number) => bottom - ((v - scale.min) / (scale.max - scale.min)) * (bottom - top);
  const band = (right - left) / n;

  if (el.showGrid) {
    scale.ticks.forEach((t, i) => {
      prims.push({ kind: 'line', x1: left, y1: yOf(t), x2: right, y2: yOf(t), stroke: gridColor, width: lineW });
      prims.push({ kind: 'text', x: left - fs * 0.35, y: yOf(t), text: tickTexts[i], align: 'right', size: small, weight: 400, color: el.color });
    });
  }

  el.labels.forEach((label, i) => {
    prims.push({ kind: 'text', x: left + band * (i + 0.5), y: bottom + fs * 0.85, text: fitText(label, band * 0.96, fs, 400, measure), align: 'center', size: fs, weight: 400, color: el.color });
  });

  const y0 = yOf(0);

  if (el.chart === 'column') {
    const groupW = band * (multi ? 0.78 : 0.6);
    const barW = groupW / el.series.length;

    el.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const x = left + band * i + (band - groupW) / 2 + si * barW;
        const y1 = yOf(v * ease);

        prims.push({ kind: 'rect', x: x + barW * 0.06, y: Math.min(y0, y1), w: barW * 0.88, h: Math.abs(y1 - y0), fill: chartColor(el, si) });

        if (el.showLabels && done) {
          prims.push({ kind: 'text', x: x + barW / 2, y: v >= 0 ? y1 - small * 0.7 : y1 + small * 0.7, text: formatValue(v), align: 'center', size: small, weight: 400, color: el.color });
        }
      });
    });
  } else {
    const stroke = Math.max(2, fs * 0.16);

    el.series.forEach((s, si) => {
      const color = chartColor(el, si);
      const points = s.values.flatMap((v, i) => [left + band * (i + 0.5), yOf(v * ease)]);

      if (el.chart === 'area' && points.length >= 4) {
        prims.push({ kind: 'poly', points: [...points, points[points.length - 2], y0, points[0], y0], fill: chartAlpha(color, 0.32), stroke: null, width: 0 });
      }

      if (points.length >= 4) prims.push({ kind: 'poly', points, fill: null, stroke: color, width: stroke });

      s.values.forEach((v, i) => {
        prims.push({ kind: 'circle', cx: points[i * 2], cy: points[i * 2 + 1], r: stroke * 1.4, fill: color, stroke: null, width: 0 });

        if (el.showLabels && done) {
          prims.push({ kind: 'text', x: points[i * 2], y: v >= 0 ? points[i * 2 + 1] - small * 0.9 : points[i * 2 + 1] + small * 0.9, text: formatValue(v), align: 'center', size: small, weight: 400, color: el.color });
        }
      });
    });
  }

  prims.push({ kind: 'line', x1: left, y1: y0, x2: right, y2: y0, stroke: axisColor, width: lineW });

  return prims;
}

function pieScene(el: ChartElement, measure: Measure, ease: number, done: boolean): ChartPrim[] {
  const fs = el.fontSize;
  const pad = fs * 0.4;
  const box: Box = { x: el.x + pad, y: el.y + pad, w: el.width - pad * 2, h: el.height - pad * 2 };
  const values = (el.series[0]?.values ?? []).map((v) => (v > 0 ? v : 0));
  const lg = el.showLegend
    ? legend(el.labels.map((label, i) => ({ label, color: chartColor(el, i) })), box, fs, el.color, measure)
    : { prims: [], height: 0 };
  const areaH = box.h - lg.height - (lg.height > 0 ? fs * 0.6 : 0);
  const r = Math.max(0, Math.min(box.w, areaH) / 2);
  const cx = box.x + box.w / 2;
  const cy = box.y + areaH / 2;
  const inner = el.chart === 'donut' ? r * 0.58 : 0;
  const total = values.reduce((a, b) => a + b, 0);
  const prims: ChartPrim[] = [...lg.prims];

  if (r < 2) return prims;

  if (total <= 0) {
    // ไม่มีค่าที่เป็นบวก — วาดวงจาง ๆ ให้เห็นว่าชาร์ตอยู่ตรงนี้
    prims.push({ kind: 'sector', cx, cy, r, inner, start: -Math.PI / 2, end: -Math.PI / 2 + TAU, fill: chartAlpha(el.color, 0.15) });
    return prims;
  }

  const percents = piePercentages(values);
  let angle = -Math.PI / 2;

  values.forEach((v, i) => {
    const sweep = (v / total) * TAU * ease;

    if (sweep <= 0) return;

    prims.push({ kind: 'sector', cx, cy, r, inner, start: angle, end: angle + sweep, fill: chartColor(el, i) });

    // เปอร์เซ็นต์บนชิ้นที่ใหญ่พอให้ตัวเลขไม่ล้น
    if (el.showLabels && done && sweep > 0.28) {
      const mid = angle + sweep / 2;
      const rr = inner > 0 ? (r + inner) / 2 : r * 0.64;
      const size = Math.min(fs, (inner > 0 ? r - inner : r) * 0.42);

      prims.push({ kind: 'text', x: cx + Math.cos(mid) * rr, y: cy + Math.sin(mid) * rr, text: `${percents[i]}%`, align: 'center', size, weight: 700, color: WHITE });
    }

    angle += sweep;
  });

  return prims;
}

function progressScene(el: ChartElement, ease: number): ChartPrim[] {
  const fs = el.fontSize;
  const value = Math.max(0, Math.min(100, el.series[0]?.values[0] ?? 0));
  const color = chartColor(el, 0);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const outer = Math.min(el.width, el.height) / 2 - fs * 0.2;
  const thickness = Math.max(2, outer * 0.2);
  const r = outer - thickness / 2;
  const prims: ChartPrim[] = [];

  if (r < 2) return prims;

  prims.push({ kind: 'circle', cx, cy, r, fill: null, stroke: chartAlpha(color, 0.18), width: thickness });

  const sweep = (value / 100) * TAU * ease;

  if (sweep > 0) prims.push({ kind: 'arc', cx, cy, r, start: -Math.PI / 2, end: -Math.PI / 2 + sweep, stroke: color, width: thickness });

  const label = el.labels[0] ?? '';
  const withLabel = el.showLegend && label.trim() !== '';
  const big = Math.max(fs, (r - thickness / 2) * 0.55);

  if (el.showLabels) {
    prims.push({ kind: 'text', x: cx, y: withLabel ? cy - big * 0.25 : cy, text: `${formatValue(Math.round(value * ease * 10) / 10)}%`, align: 'center', size: big, weight: 700, color: el.color });
  }

  if (withLabel) {
    prims.push({ kind: 'text', x: cx, y: el.showLabels ? cy + big * 0.55 : cy, text: label, align: 'center', size: fs, weight: 400, color: el.color });
  }

  return prims;
}

// ── canvas 2D ──────────────────────────────────────────────────────

let measureCtx: CanvasRenderingContext2D | null | undefined;

/// ตัววัดข้อความด้วย canvas จริง (ฟอนต์ของชาร์ต) · ไม่มี DOM (เทสต์/เซิร์ฟเวอร์) ใช้ค่าประมาณ
export function canvasMeasure(fontFamily: string, ctx?: CanvasRenderingContext2D | null): Measure {
  if (ctx === undefined) {
    if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    ctx = measureCtx;
  }

  const c = ctx;

  if (!c) return (text, size) => text.length * size * 0.55;

  return (text, size, weight) => {
    c.font = `${weight} ${size}px ${cssFamily(fontFamily)}`;

    return c.measureText(text).width;
  };
}

export function drawChart(ctx: CanvasRenderingContext2D, el: ChartElement, progress?: number) {
  const prims = chartScene(el, canvasMeasure(el.fontFamily), progress ?? 1);
  const family = cssFamily(el.fontFamily);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const p of prims) {
    switch (p.kind) {
      case 'rect':
        ctx.fillStyle = p.fill;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        break;
      case 'line':
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        break;
      case 'poly':
        ctx.beginPath();
        for (let i = 0; i < p.points.length; i += 2) {
          if (i === 0) ctx.moveTo(p.points[i], p.points[i + 1]);
          else ctx.lineTo(p.points[i], p.points[i + 1]);
        }
        if (p.fill) {
          ctx.closePath();
          ctx.fillStyle = p.fill;
          ctx.fill();
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.width;
          ctx.stroke();
        }
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, 0, TAU);
        if (p.fill) {
          ctx.fillStyle = p.fill;
          ctx.fill();
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.width;
          ctx.stroke();
        }
        break;
      case 'sector':
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, p.start, p.end);
        if (p.inner > 0) ctx.arc(p.cx, p.cy, p.inner, p.end, p.start, true);
        else ctx.lineTo(p.cx, p.cy);
        ctx.closePath();
        ctx.fillStyle = p.fill;
        ctx.fill();
        break;
      case 'arc':
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, p.start, p.end);
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.width;
        ctx.stroke();
        break;
      case 'text':
        ctx.font = `${p.weight} ${p.size}px ${family}`;
        ctx.textAlign = p.align;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        break;
    }
  }
}

// ── SVG ────────────────────────────────────────────────────────────

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => Math.round(v * 100) / 100;

function point(cx: number, cy: number, r: number, angle: number): string {
  return `${n(cx + Math.cos(angle) * r)} ${n(cy + Math.sin(angle) * r)}`;
}

/// เส้นโค้งตามวง (ถ้ากินเต็มวงแบ่งเป็นสองครึ่ง เพราะ arc ของ SVG วาดวงเต็มจุดเดียวไม่ได้)
function arcPath(cx: number, cy: number, r: number, start: number, end: number, reverse = false): string {
  const sweep = Math.abs(end - start);

  if (sweep >= TAU - 1e-6) {
    return `A${n(r)} ${n(r)} 0 1 1 ${point(cx, cy, r, start + Math.PI)}A${n(r)} ${n(r)} 0 1 1 ${point(cx, cy, r, start)}`;
  }

  return `A${n(r)} ${n(r)} 0 ${sweep > Math.PI ? 1 : 0} ${reverse ? 0 : 1} ${point(cx, cy, r, end)}`;
}

function sectorPath(p: Extract<ChartPrim, { kind: 'sector' }>): string {
  const outer = `M${point(p.cx, p.cy, p.r, p.start)}${arcPath(p.cx, p.cy, p.r, p.start, p.end)}`;

  if (p.inner > 0) {
    if (p.end - p.start >= TAU - 1e-6) {
      // วงแหวนเต็ม: วงนอก + วงใน (เจาะรูด้วย evenodd)
      return `${outer}ZM${point(p.cx, p.cy, p.inner, p.start)}${arcPath(p.cx, p.cy, p.inner, p.start, p.end)}Z`;
    }

    return `${outer}L${point(p.cx, p.cy, p.inner, p.end)}${arcPath(p.cx, p.cy, p.inner, p.end, p.start, true)}Z`;
  }

  return p.end - p.start >= TAU - 1e-6 ? `${outer}Z` : `${outer}L${n(p.cx)} ${n(p.cy)}Z`;
}

/// ชาร์ตเป็น SVG เวกเตอร์ล้วน (ข้อความยังเป็นข้อความ) — ใช้ใน pageToSvg
export function chartSvg(el: ChartElement, measure: Measure = canvasMeasure(el.fontFamily)): string {
  const family = esc(cssFamily(el.fontFamily));

  return chartScene(el, measure)
    .map((p) => {
      switch (p.kind) {
        case 'rect':
          return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${esc(p.fill)}"/>`;
        case 'line':
          return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${esc(p.stroke)}" stroke-width="${n(p.width)}" stroke-linecap="round"/>`;
        case 'poly': {
          const pts = [];

          for (let i = 0; i < p.points.length; i += 2) pts.push(`${n(p.points[i])},${n(p.points[i + 1])}`);

          const tag = p.fill ? 'polygon' : 'polyline';
          const stroke = p.stroke ? ` stroke="${esc(p.stroke)}" stroke-width="${n(p.width)}" stroke-linecap="round" stroke-linejoin="round"` : '';

          return `<${tag} points="${pts.join(' ')}" fill="${p.fill ? esc(p.fill) : 'none'}"${stroke}/>`;
        }
        case 'circle': {
          const stroke = p.stroke ? ` stroke="${esc(p.stroke)}" stroke-width="${n(p.width)}"` : '';

          return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${p.fill ? esc(p.fill) : 'none'}"${stroke}/>`;
        }
        case 'sector':
          return `<path d="${sectorPath(p)}" fill="${esc(p.fill)}" fill-rule="evenodd"/>`;
        case 'arc':
          return `<path d="M${point(p.cx, p.cy, p.r, p.start)}${arcPath(p.cx, p.cy, p.r, p.start, p.end)}" fill="none" stroke="${esc(p.stroke)}" stroke-width="${n(p.width)}" stroke-linecap="round"/>`;
        case 'text': {
          const anchor = p.align === 'left' ? 'start' : p.align === 'center' ? 'middle' : 'end';

          return `<text x="${n(p.x)}" y="${n(p.y)}" text-anchor="${anchor}" dominant-baseline="central" fill="${esc(p.color)}" style="font-family:${family};font-size:${n(p.size)}px;font-weight:${p.weight}">${esc(p.text)}</text>`;
        }
      }
    })
    .join('');
}
