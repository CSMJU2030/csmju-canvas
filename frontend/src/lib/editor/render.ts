import { drawChart } from './chart';
import { DEFAULT_FONT, cssFamily, ensureFont, isFontReady } from './fonts';
import {
  PLACEHOLDER_FILL, PLACEHOLDER_HINT, PLACEHOLDER_ICON, PLACEHOLDER_INK, cellArea, cellImages, coverRect, frameArea, frameDecor, frameMaskPath, gridCellRects,
  roundRectPath, type Box,
} from './frames';
import { applyAdjust, applyColorEdits, effectiveAdjust, findFilter, isNeutral } from './image-filters';
import { coverRect as videoCoverCrop, trimRange } from './media';
import { canvasPaint } from './paint';
import { drawTable, tableFonts } from './table-render';
import {
  isLineShape,
  pageSizeOf,
  type CanvasElement,
  type FrameElement,
  type FrameImage,
  type GridElement,
  type ImageElement,
  type Page,
  type PathElement,
  type ShapeElement,
  type EraseStroke,
  type StrokeStyle,
  type SvgElement,
  type TextElement,
  type VideoElement,
} from './types';

/// วาดหน้าลง canvas 2D — ใช้ทั้งบนจอ (editor) ภาพย่อ พรีเซนต์ และการส่งออก PNG/JPEG/PDF
///
/// ฟังก์ชันชุดนี้ไม่รู้เรื่องการซูม: ผู้เรียกตั้ง transform ของ context ไว้ก่อน
/// แล้วทุกอย่างวาดในพิกัดของหน้า

// ── แคชรูป ──────────────────────────────────────────────────────────

const images = new Map<string, HTMLImageElement>();
const imageListeners = new Set<() => void>();

/// แจ้งทุกผืนที่วาดอยู่ (หน้าแก้ไข พรีเซนต์) ให้วาดใหม่เมื่อรูป/ฟอนต์ที่ยังโหลดไม่เสร็จพร้อมแล้ว
function onImageReady() {
  for (const listener of imageListeners) listener();
}

export function subscribeImageReady(listener: () => void): () => void {
  imageListeners.add(listener);

  return () => imageListeners.delete(listener);
}

export function getImage(src: string): HTMLImageElement | null {
  const cached = images.get(src);

  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;

  const img = new Image();

  img.decoding = 'async';
  img.onload = () => onImageReady();
  img.src = src;
  images.set(src, img);

  return null;
}

/// รอจนรูปทุกรูปในหน้าโหลดเสร็จ (ก่อนส่งออก) — รูปที่โหลดไม่ได้ข้ามไป
export async function preloadPage(page: Page): Promise<void> {
  const jobs: Promise<unknown>[] = [];

  for (const el of page.elements) {
    if (el.type === 'image' || el.type === 'svg') {
      const src = el.type === 'image' ? el.src : svgDataUrl(el);

      getImage(src);

      const img = images.get(src)!;

      if (!img.complete) {
        jobs.push(new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }));
      }
    }

    if (el.type === 'text') jobs.push(ensureFont(el.fontFamily, el.fontWeight));
    if (el.type === 'table') for (const weight of tableFonts(el)) jobs.push(ensureFont(el.fontFamily, weight));
    if (el.type === 'chart') jobs.push(ensureFont(el.fontFamily, 400), ensureFont(el.fontFamily, 700));

    if (el.type === 'frame' || el.type === 'grid') {
      for (const image of cellImages(el)) {
        if (!image) continue;
        getImage(image.src);

        const img = images.get(image.src)!;

        if (!img.complete) {
          jobs.push(new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }));
        }
      }
    }
    if (el.type === 'video') jobs.push(loadPoster(el.src, trimRange(el).start));
  }

  await Promise.all(jobs);
}

// ── ภาพปกวิดีโอ ─────────────────────────────────────────────────────

/// ภาพปก = เฟรมของวิดีโอที่วินาทีเริ่มของช่วงตัดต่อ วาดเก็บลงผืนนอกจอครั้งเดียวต่อ (ไฟล์, วินาที)
/// เพื่อไม่ต้องเปิดตัวเล่นวิดีโอค้างไว้ทุกครั้งที่วาดหน้า
const posters = new Map<string, Promise<HTMLCanvasElement | null>>();
const posterReady = new Map<string, HTMLCanvasElement | null>();
const POSTER_MAX = 1280;

function posterKey(src: string, time: number) {
  return `${src}#t=${time.toFixed(2)}`;
}

function loadPoster(src: string, time: number): Promise<HTMLCanvasElement | null> {
  const key = posterKey(src, time);
  const existing = posters.get(key);

  if (existing) return existing;
  if (typeof document === 'undefined') return Promise.resolve(null);

  const job = new Promise<HTMLCanvasElement | null>((resolve) => {
    const video = document.createElement('video');
    const finish = (canvas: HTMLCanvasElement | null) => {
      video.removeAttribute('src');
      video.load();
      posterReady.set(key, canvas);
      resolve(canvas);
      onImageReady();
    };

    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const target = Number.isFinite(video.duration) ? Math.min(time, Math.max(0, video.duration - 0.05)) : time;

      // บางเบราว์เซอร์ไม่ยิง seeked ถ้าเวลาเท่าเดิม — ขยับเล็กน้อยให้มีเฟรมจริงเสมอ
      video.currentTime = Math.max(0.001, target);
    };
    video.onseeked = () => {
      const scale = Math.min(1, POSTER_MAX / Math.max(1, video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');

      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

      try {
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    video.src = src;
  });

  posters.set(key, job);

  return job;
}

/// ภาพปกที่พร้อมวาด · undefined = กำลังโหลด · null = เปิดไฟล์ไม่ได้
export function getVideoPoster(el: Pick<VideoElement, 'src' | 'duration' | 'trimStart' | 'trimEnd'>): HTMLCanvasElement | null | undefined {
  const time = trimRange(el).start;
  const key = posterKey(el.src, time);

  if (posterReady.has(key)) return posterReady.get(key);

  void loadPoster(el.src, time);

  return undefined;
}

/// แหล่งเฟรมสดของวิดีโอ (ตอนพรีเซนต์/ส่งออกวิดีโอ) · คืน null = ใช้ภาพปก
export type VideoFrameSource = (el: VideoElement) => HTMLVideoElement | null;

export function svgDataUrl(el: Pick<SvgElement, 'svg' | 'color'>): string {
  const colored = el.svg.replace(/currentColor/g, el.color);

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
}

// ── ข้อความ ─────────────────────────────────────────────────────────

let measureCtx: CanvasRenderingContext2D | null = null;

function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;

  measureCtx = document.createElement('canvas').getContext('2d');

  return measureCtx;
}

export function fontString(el: Pick<TextElement, 'italic' | 'fontWeight' | 'fontSize' | 'fontFamily'>): string {
  return `${el.italic ? 'italic ' : ''}${el.fontWeight} ${el.fontSize}px ${cssFamily(el.fontFamily)}`;
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('th', { granularity: 'word' })
    : null;
const graphemes =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('th', { granularity: 'grapheme' })
    : null;

/// ตัดคำภาษาไทยด้วย Intl.Segmenter (ภาษาไทยไม่มีช่องว่างระหว่างคำ)
function words(text: string): string[] {
  if (!segmenter) return text.split(/(\s+)/);

  return Array.from(segmenter.segment(text), (s) => s.segment);
}

function clusters(text: string): string[] {
  if (!graphemes) return Array.from(text);

  return Array.from(graphemes.segment(text), (s) => s.segment);
}

/// ข้อความที่แสดงจริง: ตัวพิมพ์ใหญ่ (aA) และสัญลักษณ์รายการ
export function displayParagraphs(el: TextElement): string[] {
  const text = el.uppercase ? el.text.toUpperCase() : el.text;
  const paragraphs = text.split('\n');

  if (!el.list || el.list === 'none') return paragraphs;

  return paragraphs.map((p, i) => (el.list === 'bullet' ? `• ${p}` : `${i + 1}. ${p}`));
}

interface Line {
  text: string;
  /// บรรทัดสุดท้ายของย่อหน้า (จัดเต็มแนวไม่ยืดบรรทัดนี้)
  last: boolean;
}

/// แบ่งข้อความเป็นบรรทัดตามความกว้างกล่อง
export function layoutLines(el: TextElement, ctx: CanvasRenderingContext2D | null = measurer()): Line[] {
  const paragraphs = displayParagraphs(el);

  if (!ctx) return paragraphs.map((text) => ({ text, last: true }));

  ctx.font = fontString(el);
  setLetterSpacing(ctx, el.letterSpacing);

  const lines: Line[] = [];

  for (const paragraph of paragraphs) {
    let line = '';

    for (const word of words(paragraph)) {
      const candidate = line + word;

      if (line && ctx.measureText(candidate).width > el.width) {
        lines.push({ text: line.trimEnd(), last: false });
        line = word.trimStart();

        // คำเดียวยาวเกินกล่อง — หั่นเป็นตัวอักษร
        while (ctx.measureText(line).width > el.width && line.length > 1) {
          let cut = line.length - 1;

          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > el.width) cut--;
          lines.push({ text: line.slice(0, cut), last: false });
          line = line.slice(cut);
        }
      } else {
        line = candidate;
      }
    }

    lines.push({ text: line, last: true });
  }

  return lines;
}

export function layoutText(el: TextElement, ctx: CanvasRenderingContext2D | null = measurer()): string[] {
  return layoutLines(el, ctx).map((l) => l.text);
}

/// รูปโค้งของข้อความโค้ง: รัศมีและมุมที่กินไป (เรเดียน)
function arcOf(el: TextElement, ctx: CanvasRenderingContext2D | null) {
  const curve = Math.max(-100, Math.min(100, el.curve ?? 0));
  const text = displayParagraphs(el).join(' ');
  let width = text.length * el.fontSize * 0.6;

  if (ctx) {
    ctx.font = fontString(el);
    setLetterSpacing(ctx, el.letterSpacing);
    width = ctx.measureText(text).width;
  }

  const theta = Math.max(0.05, (Math.abs(curve) / 100) * Math.PI * 1.9);
  const radius = Math.max(el.fontSize, width / theta);

  return { text, theta, radius, sign: curve >= 0 ? 1 : -1, width };
}

/// ความสูงที่ข้อความต้องใช้จริง — editor ปรับความสูงกล่องตามนี้หลังพิมพ์หรือเปลี่ยนขนาด
export function measureTextHeight(el: TextElement): number {
  const lineHeight = el.fontSize * el.lineHeight;

  if (el.curve) {
    const { theta, radius } = arcOf(el, measurer());

    return lineHeight + radius * (1 - Math.cos(Math.min(theta, Math.PI * 1.98) / 2));
  }

  return Math.max(1, layoutLines(el).length) * lineHeight;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  }
}

const pendingFonts = new Set<string>();

interface TextPass {
  dx?: number;
  dy?: number;
  fill?: string | null;
  stroke?: string | null;
  lineWidth?: number;
  shadow?: { x: number; y: number; blur: number; color: string } | null;
  decorations?: boolean;
}

/// สีพร้อมความโปร่ง 0–1 (รับ rgb(r g b) ที่ editor เขียน)
export function withAlpha(color: string, alpha: number): string {
  const m = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);

  if (!m) return color;

  return `rgb(${m[1]} ${m[2]} ${m[3]} / ${Math.max(0, Math.min(1, alpha))})`;
}

/// ฟอนต์ยังไม่พร้อม — สั่งโหลดครั้งเดียว แล้ววาดใหม่ทั้งหน้าเมื่อโหลดเสร็จ
export function requestFont(family: string, weight: 400 | 700) {
  const key = `${family}:${weight}`;

  if (!pendingFonts.has(key) && !isFontReady(family, weight)) {
    pendingFonts.add(key);
    void ensureFont(family, weight).then(() => {
      pendingFonts.delete(key);
      onImageReady();
    });
  }
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  requestFont(el.fontFamily, el.fontWeight);

  ctx.font = fontString(el);
  setLetterSpacing(ctx, el.letterSpacing);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const lines = el.curve ? [] : layoutLines(el, ctx);
  const lineHeight = el.fontSize * el.lineHeight;
  const arc = el.curve ? arcOf(el, ctx) : null;

  const pass = (p: TextPass) => {
    ctx.save();

    if (p.shadow) {
      ctx.shadowOffsetX = p.shadow.x;
      ctx.shadowOffsetY = p.shadow.y;
      ctx.shadowBlur = p.shadow.blur;
      ctx.shadowColor = p.shadow.color;
    }

    if (p.fill) ctx.fillStyle = p.fill;
    if (p.stroke) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.lineWidth ?? 1;
    }

    const dx = p.dx ?? 0;
    const dy = p.dy ?? 0;

    if (arc) {
      drawArcText(ctx, el, arc, lineHeight, dx, dy, p);
    } else {
      lines.forEach((line, index) => drawLine(ctx, el, line, el.y + lineHeight * index + lineHeight / 2 + dy, dx, p));
    }

    ctx.restore();
  };

  const effect = el.effect;
  const unit = el.fontSize / 100;

  if (!effect) {
    pass({ fill: el.color, decorations: true });
    return;
  }

  const rad = ((effect.direction - 90) * Math.PI) / 180;
  const ox = Math.cos(rad) * effect.offset * unit * 0.5;
  const oy = Math.sin(rad) * effect.offset * unit * 0.5;

  switch (effect.kind) {
    case 'shadow':
      pass({
        fill: el.color,
        decorations: true,
        shadow: { x: ox, y: oy, blur: effect.blur * unit * 0.6, color: withAlpha(effect.color, effect.intensity / 100) },
      });
      break;
    case 'lift':
      pass({
        fill: el.color,
        decorations: true,
        shadow: { x: 0, y: el.fontSize * 0.08, blur: el.fontSize * 0.25, color: `rgb(0 0 0 / ${0.15 + effect.intensity / 200})` },
      });
      break;
    case 'hollow':
      pass({ stroke: el.color, lineWidth: Math.max(1, effect.intensity * unit * 0.08) });
      break;
    case 'outline':
      pass({ stroke: effect.color, lineWidth: Math.max(1, effect.intensity * unit * 0.12) });
      pass({ fill: el.color, decorations: true });
      break;
    case 'splice':
      pass({ fill: effect.color, dx: ox, dy: oy });
      pass({ stroke: el.color, lineWidth: Math.max(1, effect.intensity * unit * 0.08) });
      break;
    case 'echo':
      pass({ fill: withAlpha(effect.color, 0.25), dx: ox * 2, dy: oy * 2 });
      pass({ fill: withAlpha(effect.color, 0.5), dx: ox, dy: oy });
      pass({ fill: el.color, decorations: true });
      break;
    case 'glitch':
      pass({ fill: 'rgb(0 255 255)', dx: -Math.abs(ox) - effect.offset * unit * 0.1, dy: oy });
      pass({ fill: effect.color, dx: Math.abs(ox) + effect.offset * unit * 0.1, dy: -oy });
      pass({ fill: el.color, decorations: true });
      break;
    case 'neon': {
      const glow = el.color;
      const strength = 0.3 + effect.intensity / 100;

      pass({ fill: glow, shadow: { x: 0, y: 0, blur: el.fontSize * 0.5 * strength, color: glow } });
      pass({ fill: glow, shadow: { x: 0, y: 0, blur: el.fontSize * 0.2 * strength, color: glow } });
      pass({ fill: withAlpha('rgb(255 255 255)', 0.35 + strength * 0.3), decorations: true });
      break;
    }
    case 'background':
      drawTextBackground(ctx, el, lines, lineHeight, effect);
      pass({ fill: el.color, decorations: true });
      break;
  }
}

/// เอฟเฟกต์ "พื้นหลัง": กล่องสีหลังแต่ละบรรทัด · intensity = ความโค้งมน · offset = ระยะขยาย · blur = ความโปร่งใส
function drawTextBackground(ctx: CanvasRenderingContext2D, el: TextElement, lines: Line[], lineHeight: number, effect: NonNullable<TextElement['effect']>) {
  const pad = (effect.offset / 100) * el.fontSize * 0.5;

  ctx.save();
  ctx.fillStyle = withAlpha(effect.color, 1 - effect.blur / 100);

  lines.forEach((line, index) => {
    if (!line.text.trim()) return;

    const width = Math.min(el.width, ctx.measureText(line.text).width);
    const left = el.align === 'center' ? el.x + (el.width - width) / 2 : el.align === 'right' ? el.x + el.width - width : el.x;
    const top = el.y + lineHeight * index;
    const r = (effect.intensity / 100) * (lineHeight / 2 + pad);

    ctx.beginPath();
    ctx.roundRect(left - pad, top - pad / 2, width + pad * 2, lineHeight + pad, r);
    ctx.fill();
  });

  ctx.restore();
}

function drawLine(ctx: CanvasRenderingContext2D, el: TextElement, line: Line, y: number, dx: number, p: TextPass) {
  if (!line.text) return;

  const justify = el.align === 'justify' && !line.last;
  const draw = (text: string, x: number) => {
    if (p.fill) ctx.fillText(text, x + dx, y);
    if (p.stroke) ctx.strokeText(text, x + dx, y);
  };
  let left: number;
  let width: number;

  if (justify) {
    const parts = words(line.text);
    const widths = parts.map((part) => ctx.measureText(part).width);
    const natural = widths.reduce((a, b) => a + b, 0);
    const gap = parts.length > 1 ? (el.width - natural) / (parts.length - 1) : 0;
    let x = el.x;

    ctx.textAlign = 'left';
    parts.forEach((part, i) => {
      draw(part, x);
      x += widths[i] + gap;
    });
    left = el.x;
    width = el.width;
  } else {
    const align = el.align === 'justify' ? 'left' : el.align;
    const anchor = align === 'left' ? el.x : align === 'center' ? el.x + el.width / 2 : el.x + el.width;

    ctx.textAlign = align;
    draw(line.text, anchor);
    width = ctx.measureText(line.text).width;
    left = align === 'left' ? anchor : align === 'center' ? anchor - width / 2 : anchor - width;
  }

  if (p.decorations && p.fill) {
    const thickness = Math.max(1, el.fontSize / 15);

    if (el.underline) ctx.fillRect(left + dx, y + el.fontSize * 0.42, width, thickness);
    if (el.strike) ctx.fillRect(left + dx, y - thickness / 2, width, thickness);
  }
}

/// ข้อความโค้ง: วางทีละกลุ่มอักษร (รักษาสระ/วรรณยุกต์ไทยไว้กับพยัญชนะ) ตามเส้นรอบวง
function drawArcText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  arc: ReturnType<typeof arcOf>,
  lineHeight: number,
  dx: number,
  dy: number,
  p: TextPass,
) {
  const parts = clusters(arc.text);
  const widths = parts.map((part) => ctx.measureText(part).width);
  const cx = el.x + el.width / 2 + dx;
  let phi = -arc.width / arc.radius / 2;

  ctx.textAlign = 'center';

  const cy =
    arc.sign > 0 ? el.y + lineHeight / 2 + arc.radius + dy : el.y + el.height - lineHeight / 2 - arc.radius + dy;

  parts.forEach((part, i) => {
    const mid = phi + widths[i] / arc.radius / 2;
    const x = cx + arc.radius * Math.sin(mid);
    const y = arc.sign > 0 ? cy - arc.radius * Math.cos(mid) : cy + arc.radius * Math.cos(mid);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(arc.sign > 0 ? mid : -mid);
    if (p.fill) ctx.fillText(part, 0, 0);
    if (p.stroke) ctx.strokeText(part, 0, 0);
    ctx.restore();
    phi += widths[i] / arc.radius;
  });
}

// ── รูปทรง ──────────────────────────────────────────────────────────

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

export function dashFor(style: StrokeStyle | undefined, width: number): number[] {
  switch (style) {
    case 'dash':
      return [width * 2, width * 1.5];
    case 'long-dash':
      return [width * 5, width * 2.5];
    case 'dot':
      return [0.01, width * 2];
    default:
      return [];
  }
}

function shapePath(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  const { x, y, width: w, height: h } = el;

  switch (el.shape) {
    case 'rect':
      roundedRect(ctx, x, y, w, h, el.cornerRadius);
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case 'triangle-down':
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w / 2, y + h);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    case 'pentagon':
    case 'hexagon':
    case 'octagon':
      polygon(ctx, el, el.shape === 'pentagon' ? 5 : el.shape === 'hexagon' ? 6 : 8);
      break;
    case 'star': {
      ctx.beginPath();
      const cx = x + w / 2;
      const cy = y + h / 2;

      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? 1 : 0.42;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(angle) * (w / 2) * radius;
        const py = cy + Math.sin(angle) * (h / 2) * radius;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.closePath();
      break;
    }
    case 'line':
    case 'arrow':
      ctx.beginPath();
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
      break;
    case 'curve':
      // โค้งจากมุมล่างซ้ายขึ้นไปแตะขอบบนแล้วลงมุมล่างขวา
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.quadraticCurveTo(x + w / 2, y - h, x + w, y + h);
      break;
    case 'elbow': {
      // เส้นหักศอก: ขอบบนซ้าย → กลาง → ลงล่าง → ขอบล่างขวา (มุมโค้งเล็กน้อย)
      const r = Math.min(w / 4, h / 2, Math.max(4, el.strokeWidth * 4));

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arcTo(x + w / 2, y, x + w / 2, y + h, r);
      ctx.arcTo(x + w / 2, y + h, x + w, y + h, r);
      ctx.lineTo(x + w, y + h);
      break;
    }
  }
}

/// รูปหลายเหลี่ยมด้านเท่า ยอดแรกอยู่บนสุด (แปดเหลี่ยมหมุนครึ่งช่องให้ขอบบนแบน)
function polygon(ctx: CanvasRenderingContext2D, el: ShapeElement, sides: number) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const start = -Math.PI / 2 + (sides === 8 || sides === 6 ? Math.PI / sides : 0);

  ctx.beginPath();

  for (let i = 0; i < sides; i++) {
    const angle = start + (i * 2 * Math.PI) / sides;
    const px = cx + Math.cos(angle) * (el.width / 2);
    const py = cy + Math.sin(angle) * (el.height / 2);

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  shapePath(ctx, el);

  const isLine = isLineShape(el.shape);

  if (el.fill && !isLine) {
    ctx.fillStyle = canvasPaint(ctx, el.fill, el);
    ctx.fill();
    // เส้นขอบไม่ต้องมีเงาซ้ำ
    ctx.shadowColor = 'transparent';
  }

  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashFor(el.strokeStyle, el.strokeWidth));
    ctx.stroke();
    ctx.setLineDash([]);

    if (el.shape === 'arrow') {
      const size = Math.max(8, el.strokeWidth * 3);
      const tipX = el.x + el.width;
      const tipY = el.y + el.height / 2;

      ctx.beginPath();
      ctx.moveTo(tipX - size, tipY - size * 0.6);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tipX - size, tipY + size * 0.6);
      ctx.stroke();
    }
  }
}

/// ความทึบของปากกาไฮไลท์ — โปร่งให้เห็นสิ่งที่อยู่ข้างใต้
export const HIGHLIGHTER_ALPHA = 0.45;

/// วาดเส้นหนึ่งเส้นจากพิกัดหน้า [x0, y0, x1, y1, …] ให้โค้งเรียบด้วยจุดกึ่งกลาง (quadratic)
export function strokeFreehand(ctx: CanvasRenderingContext2D, points: number[]) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);

  if (points.length <= 4) {
    // จุดเดียว (แตะ) วาดเป็นจุดกลม
    ctx.lineTo(points[points.length - 2] + 0.01, points[points.length - 1]);
  } else {
    for (let i = 2; i < points.length - 2; i += 2) {
      const mx = (points[i] + points[i + 2]) / 2;
      const my = (points[i + 1] + points[i + 3]) / 2;

      ctx.quadraticCurveTo(points[i], points[i + 1], mx, my);
    }

    ctx.lineTo(points[points.length - 2], points[points.length - 1]);
  }

  ctx.stroke();
}

export function brushStyle(ctx: CanvasRenderingContext2D, brush: PathElement['brush'], color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (brush === 'highlighter') ctx.globalAlpha *= HIGHLIGHTER_ALPHA;
}

function drawPath(ctx: CanvasRenderingContext2D, el: PathElement) {
  brushStyle(ctx, el.brush, el.color, el.strokeWidth);

  for (const stroke of el.strokes) {
    const points = stroke.map((v, i) => (i % 2 === 0 ? el.x + v * el.width : el.y + v * el.height));

    strokeFreehand(ctx, points);
  }
}

// ── รูปภาพ ──────────────────────────────────────────────────────────

/// รูปที่ผ่านการปรับแสงสี/ฟิลเตอร์แล้ว — ประมวลผลครั้งเดียวต่อชุดค่า แล้วเก็บไว้ใช้ซ้ำ
const processed = new Map<string, HTMLCanvasElement>();
const PROCESS_LIMIT = 1600;

/// ค่าของรูปที่ตัวประมวลผลพิกเซลใช้ — รูปเดี่ยว (ImageElement) และรูปในกรอบ/กริด (FrameImage)
type ProcessSpec = Pick<ImageElement, 'src' | 'crop' | 'adjust' | 'filter' | 'filterIntensity' | 'colorEdits' | 'erase'>;

function sourceRect(el: ProcessSpec, img: HTMLImageElement) {
  const crop = el.crop ?? { x: 0, y: 0, width: 1, height: 1 };

  return {
    sx: crop.x * img.naturalWidth,
    sy: crop.y * img.naturalHeight,
    sw: Math.max(1, crop.width * img.naturalWidth),
    sh: Math.max(1, crop.height * img.naturalHeight),
  };
}

/// ลายนิ้วมือของรอยลบทั้งหมด (ใช้เป็นคีย์แคช) — เปลี่ยนเมื่อจุดหรือขนาดใดเปลี่ยน
function eraseHash(strokes: EraseStroke[]): string {
  let h = 2166136261;

  for (const stroke of strokes) {
    for (const v of [stroke.size, ...stroke.points]) {
      h ^= Math.round(v * 100000);
      h = Math.imul(h, 16777619);
    }

    h ^= 0x9e37;
  }

  return `${strokes.length}:${(h >>> 0).toString(36)}`;
}

function processedImage(el: ProcessSpec, img: HTMLImageElement): { source: CanvasImageSource; sx: number; sy: number; sw: number; sh: number } {
  const rect = sourceRect(el, img);
  const filter = findFilter(el.filter);
  const intensity = el.filterIntensity ?? 100;
  const adjust = effectiveAdjust(el.adjust, filter, intensity);
  const pixelWork = { ...adjust, blur: 0 };
  const colorEdits = (el.colorEdits ?? []).filter((e) => e.hue || e.saturation || e.lightness);
  const erase = el.erase ?? [];
  const pixels = !isNeutral(pixelWork, filter) || colorEdits.length > 0;

  if ((!pixels && erase.length === 0) || typeof document === 'undefined') return { source: img, ...rect };

  const key = `${el.src}|${JSON.stringify(el.crop ?? null)}|${JSON.stringify(pixelWork)}|${el.filter ?? ''}|${intensity}|${JSON.stringify(colorEdits)}|${eraseHash(erase)}`;
  let canvas = processed.get(key);

  if (!canvas) {
    const scale = Math.min(1, PROCESS_LIMIT / Math.max(rect.sw, rect.sh));

    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.sw * scale));
    canvas.height = Math.max(1, Math.round(rect.sh * scale));

    const c = canvas.getContext('2d', { willReadFrequently: true })!;

    c.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);

    if (pixels) {
      try {
        const data = c.getImageData(0, 0, canvas.width, canvas.height);

        if (!isNeutral(pixelWork, filter)) applyAdjust(data, pixelWork, filter, intensity);
        if (colorEdits.length) applyColorEdits(data, colorEdits);
        c.putImageData(data, 0, 0);
      } catch {
        // อ่านพิกเซลไม่ได้ (รูปข้ามโดเมน) — แสดงรูปเดิม
      }
    }

    if (erase.length) {
      // พิกัดรอยลบอิงรูปเต็ม → แปลงเป็นพิกัดของผืนที่ครอปและย่อแล้ว
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.setTransform(scale, 0, 0, scale, -rect.sx * scale, -rect.sy * scale);

      for (const stroke of erase) {
        const pts = stroke.points;

        c.lineWidth = Math.max(1, stroke.size * img.naturalWidth);
        c.beginPath();
        c.moveTo(pts[0] * img.naturalWidth, pts[1] * img.naturalHeight);
        // จุดเดียว = วงกลม (ลากเส้นยาวศูนย์ให้ปลายมนวาดออกมา)
        if (pts.length === 2) c.lineTo(pts[0] * img.naturalWidth + 0.01, pts[1] * img.naturalHeight);
        for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] * img.naturalWidth, pts[i + 1] * img.naturalHeight);
        c.stroke();
      }

      c.restore();
    }

    if (processed.size > 24) processed.delete(processed.keys().next().value!);
    processed.set(key, canvas);
  }

  return { source: canvas, sx: 0, sy: 0, sw: canvas.width, sh: canvas.height };
}

function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement) {
  const img = getImage(el.src);

  if (!img) {
    // ระหว่างรอโหลด วาดกล่องเทาจาง ๆ แทน
    ctx.fillStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.fillRect(el.x, el.y, el.width, el.height);
    return;
  }

  const { source, sx, sy, sw, sh } = processedImage(el, img);
  const blur = el.adjust?.blur ?? 0;

  // เงาของรูปต้องตามรูปร่างของรูป: ถ้ามีขอบมนต้องวาดรูปที่ตัดขอบแล้วลงผืนแยกก่อน
  if (el.shadow && el.cornerRadius > 0 && typeof document !== 'undefined') {
    const off = document.createElement('canvas');
    const scale = Math.min(2, Math.max(1, sw / el.width));

    off.width = Math.max(1, Math.round(el.width * scale));
    off.height = Math.max(1, Math.round(el.height * scale));

    const o = off.getContext('2d')!;

    o.scale(scale, scale);
    roundedRect(o, 0, 0, el.width, el.height, el.cornerRadius);
    o.clip();
    paintImage(o, source, sx, sy, sw, sh, { ...el, x: 0, y: 0 }, blur);
    ctx.drawImage(off, el.x, el.y, el.width, el.height);
  } else {
    ctx.save();

    if (el.cornerRadius > 0) {
      roundedRect(ctx, el.x, el.y, el.width, el.height, el.cornerRadius);
      ctx.clip();
    }

    paintImage(ctx, source, sx, sy, sw, sh, el, blur);
    ctx.restore();
  }

  ctx.shadowColor = 'transparent';

  if (el.border && el.border.width > 0) {
    const w = el.border.width;

    roundedRect(ctx, el.x + w / 2, el.y + w / 2, el.width - w, el.height - w, Math.max(0, el.cornerRadius - w / 2));
    ctx.strokeStyle = el.border.color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.setLineDash(dashFor(el.border.style, w));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function paintImage(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  el: Pick<ImageElement, 'x' | 'y' | 'width' | 'height' | 'flipX' | 'flipY'>,
  blur: number,
) {
  ctx.save();
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  if (blur > 0) ctx.filter = `blur(${(blur / 100) * Math.min(el.width, el.height) * 0.05}px)`;
  ctx.drawImage(source, sx, sy, sw, sh, -el.width / 2, -el.height / 2, el.width, el.height);
  ctx.restore();
}

// ── กรอบและกริด ─────────────────────────────────────────────────────

/// วาดรูปของกรอบ/ช่องลงในพื้นที่ `area` ตัดตามหน้ากาก `mask` (รูปเต็มช่อง ซูม เลื่อน พลิก ปรับสี)
function drawFrameImage(ctx: CanvasRenderingContext2D, image: FrameImage, area: Box, mask: Path2D) {
  const img = getImage(image.src);

  ctx.save();
  ctx.clip(mask);

  if (!img) {
    // ระหว่างรอโหลด
    ctx.fillStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.fill(mask);
    ctx.restore();
    return;
  }

  const { source, sx, sy, sw, sh } = processedImage({ ...image, crop: null }, img);
  const dest = coverRect(area, img.naturalWidth, img.naturalHeight, image.zoom, image.offsetX, image.offsetY);
  const blur = image.adjust?.blur ?? 0;

  ctx.translate(dest.x + dest.width / 2, dest.y + dest.height / 2);
  ctx.scale(image.flipX ? -1 : 1, image.flipY ? -1 : 1);
  if (blur > 0) ctx.filter = `blur(${(blur / 100) * Math.min(area.width, area.height) * 0.05}px)`;
  ctx.drawImage(source, sx, sy, sw, sh, -dest.width / 2, -dest.height / 2, dest.width, dest.height);
  ctx.restore();
}

/// ช่องว่าง: พื้นเทา + ไอคอนรูปภาพ + คำแนะนำ (ถ้าช่องใหญ่พอ)
function drawPlaceholder(ctx: CanvasRenderingContext2D, area: Box, mask: Path2D) {
  ctx.save();
  ctx.fillStyle = PLACEHOLDER_FILL;
  ctx.fill(mask);
  ctx.clip(mask);

  const short = Math.min(area.width, area.height);
  const icon = Math.min(64, short * 0.28);
  const hint = area.width >= 110 && area.height >= 90;
  const fontSize = Math.max(10, Math.min(24, short * 0.075));
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2 - (hint ? fontSize * 0.9 : 0);

  ctx.save();
  ctx.translate(cx - icon / 2, cy - icon / 2);
  ctx.scale(icon / 24, icon / 24);
  ctx.strokeStyle = PLACEHOLDER_INK;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(PLACEHOLDER_ICON));
  ctx.restore();

  if (hint) {
    ctx.fillStyle = PLACEHOLDER_INK;
    ctx.font = `400 ${fontSize}px ${cssFamily(DEFAULT_FONT)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PLACEHOLDER_HINT, cx, cy + icon / 2 + fontSize, area.width * 0.9);
  }

  ctx.restore();
}

function fillCell(ctx: CanvasRenderingContext2D, image: FrameImage | null, area: Box, mask: Path2D) {
  if (image) drawFrameImage(ctx, image, area, mask);
  else drawPlaceholder(ctx, area, mask);
}

function drawDecor(ctx: CanvasRenderingContext2D, layers: ReturnType<typeof frameDecor>['back']) {
  for (const layer of layers) {
    const path = new Path2D(layer.d);

    ctx.fillStyle = layer.fill;
    ctx.fill(path);
    ctx.shadowColor = 'transparent';

    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = 1;
      ctx.stroke(path);
    }
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, el: FrameElement) {
  const area = frameArea(el.shape, el);
  const mask = new Path2D(frameMaskPath(el.shape, area));
  const decor = frameDecor(el.shape, el);

  if (decor.back.length > 0) {
    drawDecor(ctx, decor.back);
  } else if (el.shadow) {
    // เงาต้องตามรูปทรงของกรอบ: วาดพื้นทึบที่มีเงาก่อน แล้วค่อยวาดรูปที่ตัดขอบทับ
    ctx.fillStyle = 'rgb(255 255 255)';
    ctx.fill(mask);
  }

  ctx.shadowColor = 'transparent';
  fillCell(ctx, el.image, area, mask);
  drawDecor(ctx, decor.front);
}

function drawGrid(ctx: CanvasRenderingContext2D, el: GridElement) {
  const cells = gridCellRects(el).map((area) => ({ area, mask: new Path2D(roundRectPath(area, el.cornerRadius)) }));

  if (el.shadow) {
    ctx.fillStyle = 'rgb(255 255 255)';
    for (const c of cells) ctx.fill(c.mask);
  }

  ctx.shadowColor = 'transparent';
  cells.forEach((c, i) => fillCell(ctx, el.cells[i] ?? null, c.area, c.mask));
}

/// โหมดจัดตำแหน่งรูปในกรอบ: แสดงส่วนที่ล้นกรอบแบบจาง ๆ แล้ววาดกรอบทับ (ให้เห็นว่ากำลังเลื่อนส่วนไหนของรูป)
export function drawFrameEditGhost(ctx: CanvasRenderingContext2D, el: FrameElement | GridElement, index: number) {
  const image = cellImages(el)[index];
  const area = cellArea(el, index);
  const img = image ? getImage(image.src) : null;

  if (!image || !area || !img) return;

  const dest = coverRect(area, img.naturalWidth, img.naturalHeight, image.zoom, image.offsetX, image.offsetY);

  ctx.save();

  if (el.rotation) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.globalAlpha = 0.4;
  ctx.translate(dest.x + dest.width / 2, dest.y + dest.height / 2);
  ctx.scale(image.flipX ? -1 : 1, image.flipY ? -1 : 1);
  ctx.drawImage(img, -dest.width / 2, -dest.height / 2, dest.width, dest.height);
  ctx.restore();

  drawElement(ctx, { ...el, opacity: 1, shadow: null });
}

function drawVideo(ctx: CanvasRenderingContext2D, el: VideoElement, live: HTMLVideoElement | null) {
  const source: HTMLVideoElement | HTMLCanvasElement | null | undefined = live ?? getVideoPoster(el);

  if (!source) {
    // ระหว่างรอโหลด/เปิดไม่ได้: กล่องเข้มพร้อมสัญลักษณ์เล่น ให้รู้ว่าเป็นวิดีโอ
    ctx.save();
    roundedRect(ctx, el.x, el.y, el.width, el.height, el.cornerRadius);
    ctx.fillStyle = source === null ? 'rgba(100, 116, 139, 0.35)' : 'rgba(15, 23, 42, 0.55)';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    const r = Math.min(el.width, el.height) * 0.12;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx - r * 0.6, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  const width = source instanceof HTMLCanvasElement ? source.width : source.videoWidth;
  const height = source instanceof HTMLCanvasElement ? source.height : source.videoHeight;
  const { sx, sy, sw, sh } = videoCoverCrop({ width, height }, el);

  ctx.save();

  if (el.cornerRadius > 0) {
    // เงาต้องตามขอบมน: เติมรูปร่างก่อน (มีเงา) แล้วค่อยวาดภาพทับโดยไม่มีเงา
    roundedRect(ctx, el.x, el.y, el.width, el.height, el.cornerRadius);
    if (el.shadow) {
      ctx.fillStyle = 'rgb(0 0 0)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
    }
    ctx.clip();
  }

  ctx.drawImage(source, sx, sy, sw, sh, el.x, el.y, el.width, el.height);
  ctx.restore();
}

function drawSvg(ctx: CanvasRenderingContext2D, el: SvgElement) {
  const img = getImage(svgDataUrl(el));

  if (img) ctx.drawImage(img, el.x, el.y, el.width, el.height);
}

// ── ชาร์ต ───────────────────────────────────────────────────────────

/// ฟอนต์ของชาร์ต — สั่งโหลดครั้งเดียว แล้ววาดใหม่ทั้งหน้าเมื่อพร้อม (แบบเดียวกับข้อความ)
function watchFont(family: string, weight: 400 | 700) {
  const key = `${family}:${weight}`;

  if (pendingFonts.has(key) || isFontReady(family, weight)) return;

  pendingFonts.add(key);
  void ensureFont(family, weight).then(() => {
    pendingFonts.delete(key);
    onImageReady();
  });
}

// ── element และหน้า ─────────────────────────────────────────────────

export function drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement, progress?: number, videoFrame?: VideoFrameSource) {
  if (el.hidden || el.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = el.opacity;

  if (progress !== undefined && el.animation) applyAnimation(ctx, el, progress);

  if (el.rotation) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (el.shadow && el.type !== 'text' && el.type !== 'table') {
    ctx.shadowOffsetX = el.shadow.x;
    ctx.shadowOffsetY = el.shadow.y;
    ctx.shadowBlur = el.shadow.blur;
    ctx.shadowColor = el.shadow.color;
  }

  switch (el.type) {
    case 'text':
      drawText(ctx, el);
      break;
    case 'shape':
      drawShape(ctx, el);
      break;
    case 'image':
      drawImage(ctx, el);
      break;
    case 'svg':
      drawSvg(ctx, el);
      break;
    case 'path':
      drawPath(ctx, el);
      break;
    case 'table':
      drawTable(ctx, el);
      break;
    case 'chart':
      watchFont(el.fontFamily, 400);
      watchFont(el.fontFamily, 700);
      // แท่ง/เส้น/ชิ้นงอกขึ้นเฉพาะตอนเล่นแอนิเมชันเข้า
      drawChart(ctx, el, el.animation ? progress : undefined);
      break;
    case 'frame':
      drawFrame(ctx, el);
      break;
    case 'grid':
      drawGrid(ctx, el);
      break;
    case 'video':
      drawVideo(ctx, el, videoFrame?.(el) ?? null);
      break;
  }

  ctx.restore();
}

/// แอนิเมชันตอนเข้า (พรีเซนต์ และตัวอย่างในแผงแอนิเมต) — ปรับ transform/ความทึบตามความคืบหน้า 0–1
function applyAnimation(ctx: CanvasRenderingContext2D, el: CanvasElement, t: number) {
  const p = Math.max(0, Math.min(1, t));
  const ease = 1 - Math.pow(1 - p, 3);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;

  switch (el.animation) {
    case 'rise':
      ctx.globalAlpha *= ease;
      ctx.translate(0, (1 - ease) * el.height * 0.5);
      break;
    case 'pan':
      ctx.globalAlpha *= ease;
      ctx.translate(-(1 - ease) * el.width * 0.4, 0);
      break;
    case 'fade':
      ctx.globalAlpha *= ease;
      break;
    case 'pop': {
      const s = p < 0.7 ? (p / 0.7) * 1.1 : 1.1 - ((p - 0.7) / 0.3) * 0.1;

      ctx.globalAlpha *= Math.min(1, p * 2);
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.01, s), Math.max(0.01, s));
      ctx.translate(-cx, -cy);
      break;
    }
    case 'wipe':
      ctx.beginPath();
      ctx.rect(el.x - el.width, el.y - el.height, el.width * (1 + 2 * ease), el.height * 3);
      ctx.clip();
      break;
    case 'blur':
      ctx.globalAlpha *= ease;
      ctx.filter = `blur(${(1 - ease) * 12}px)`;
      break;
    case 'drift':
      ctx.globalAlpha *= ease;
      ctx.translate((1 - ease) * el.width * 0.15, (1 - ease) * el.height * 0.15);
      break;
    case 'tumble':
      ctx.globalAlpha *= ease;
      ctx.translate(cx, cy);
      ctx.rotate((1 - ease) * -0.6);
      ctx.translate(-cx, -cy);
      break;
    case 'breathe': {
      const s = 0.85 + 0.15 * ease;

      ctx.globalAlpha *= ease;
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      break;
    }
    case 'bounce': {
      const b = Math.abs(Math.sin(p * Math.PI * 2.5)) * (1 - p);

      ctx.globalAlpha *= Math.min(1, p * 3);
      ctx.translate(0, -b * el.height * 0.4);
      break;
    }
  }
}

export function drawPage(
  ctx: CanvasRenderingContext2D,
  page: Page,
  size: { width: number; height: number },
  options: {
    transparent?: boolean;
    skipIds?: ReadonlySet<string>;
    progress?: (el: CanvasElement) => number | undefined;
    /// เฟรมสดของวิดีโอ (พรีเซนต์/ส่งออกวิดีโอ) — ไม่ใส่ = วาดภาพปก
    videoFrame?: VideoFrameSource;
  } = {},
) {
  if (page.background && !options.transparent) {
    ctx.fillStyle = canvasPaint(ctx, page.background, { x: 0, y: 0, ...size });
    ctx.fillRect(0, 0, size.width, size.height);
  }

  for (const el of page.elements) {
    if (options.skipIds?.has(el.id)) continue;

    drawElement(ctx, el, options.progress?.(el), options.videoFrame);
  }
}

/// วาดหน้าทั้งหน้าลง canvas ใหม่ตามสเกลที่ขอ — ใช้กับการส่งออกและภาพย่อ
export async function renderPageToCanvas(
  page: Page,
  size: { width: number; height: number },
  scale: number,
  options: { transparent?: boolean; background?: string } = {},
): Promise<HTMLCanvasElement> {
  await preloadPage(page);

  // หน้าที่มีขนาดของตัวเองวาดตามขนาดนั้นเสมอ
  size = pageSizeOf(page, size);

  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(size.width * scale));
  canvas.height = Math.max(1, Math.round(size.height * scale));

  const ctx = canvas.getContext('2d')!;

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.scale(scale, scale);
  drawPage(ctx, page, size, { transparent: options.transparent });

  return canvas;
}
