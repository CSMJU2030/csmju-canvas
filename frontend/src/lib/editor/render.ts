import { cssFamily, ensureFont, isFontReady } from './fonts';
import type { CanvasElement, ImageElement, Page, ShapeElement, SvgElement, TextElement } from './types';

/// วาดหน้าลง canvas 2D — ใช้ทั้งบนจอ (editor) ภาพย่อ และการส่งออก PNG/JPEG
///
/// ฟังก์ชันชุดนี้ไม่รู้เรื่องการซูม: ผู้เรียกตั้ง transform ของ context ไว้ก่อน
/// แล้วทุกอย่างวาดในพิกัดของหน้า

// ── แคชรูป ──────────────────────────────────────────────────────────

const images = new Map<string, HTMLImageElement>();
let onImageReady: (() => void) | null = null;

/// ให้ editor วาดใหม่เมื่อรูปที่ยังโหลดไม่เสร็จพร้อมแล้ว
export function setImageReadyListener(listener: (() => void) | null) {
  onImageReady = listener;
}

export function getImage(src: string): HTMLImageElement | null {
  const cached = images.get(src);

  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;

  const img = new Image();

  img.decoding = 'async';
  img.onload = () => onImageReady?.();
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
  }

  await Promise.all(jobs);
}

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

/// ตัดคำภาษาไทยด้วย Intl.Segmenter (ภาษาไทยไม่มีช่องว่างระหว่างคำ)
function words(text: string): string[] {
  if (!segmenter) return text.split(/(\s+)/);

  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/// แบ่งข้อความเป็นบรรทัดตามความกว้างกล่อง
export function layoutText(el: TextElement, ctx: CanvasRenderingContext2D | null = measurer()): string[] {
  if (!ctx) return el.text.split('\n');

  ctx.font = fontString(el);
  setLetterSpacing(ctx, el.letterSpacing);

  const lines: string[] = [];

  for (const paragraph of el.text.split('\n')) {
    let line = '';

    for (const word of words(paragraph)) {
      const candidate = line + word;

      if (line && ctx.measureText(candidate).width > el.width) {
        lines.push(line.trimEnd());
        line = word.trimStart();

        // คำเดียวยาวเกินกล่อง — หั่นเป็นตัวอักษร
        while (ctx.measureText(line).width > el.width && line.length > 1) {
          let cut = line.length - 1;

          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > el.width) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        line = candidate;
      }
    }

    lines.push(line);
  }

  return lines;
}

/// ความสูงที่ข้อความต้องใช้จริง — editor ปรับความสูงกล่องตามนี้หลังพิมพ์หรือเปลี่ยนขนาด
export function measureTextHeight(el: TextElement): number {
  return Math.max(1, layoutText(el).length) * el.fontSize * el.lineHeight;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  }
}

const pendingFonts = new Set<string>();

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  // ฟอนต์ยังไม่พร้อม — สั่งโหลดครั้งเดียว แล้ววาดใหม่ทั้งหน้าเมื่อโหลดเสร็จ
  const key = `${el.fontFamily}:${el.fontWeight}`;

  if (!pendingFonts.has(key) && !isFontReady(el.fontFamily, el.fontWeight)) {
    pendingFonts.add(key);
    void ensureFont(el.fontFamily, el.fontWeight).then(() => {
      pendingFonts.delete(key);
      onImageReady?.();
    });
  }

  const lines = layoutText(el, ctx);
  const lineHeight = el.fontSize * el.lineHeight;

  ctx.font = fontString(el);
  setLetterSpacing(ctx, el.letterSpacing);
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = el.align;

  const x = el.align === 'left' ? el.x : el.align === 'center' ? el.x + el.width / 2 : el.x + el.width;

  lines.forEach((line, index) => {
    const y = el.y + lineHeight * index + lineHeight / 2;

    ctx.fillText(line, x, y);

    if (el.underline && line) {
      const width = ctx.measureText(line).width;
      const left = el.align === 'left' ? x : el.align === 'center' ? x - width / 2 : x - width;

      ctx.fillRect(left, y + el.fontSize * 0.42, width, Math.max(1, el.fontSize / 15));
    }
  });
}

// ── รูปทรง ──────────────────────────────────────────────────────────

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
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
  }
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  shapePath(ctx, el);

  const isLine = el.shape === 'line' || el.shape === 'arrow';

  if (el.fill && !isLine) {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }

  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

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

function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement) {
  const img = getImage(el.src);

  ctx.save();

  if (el.cornerRadius > 0) {
    roundedRect(ctx, el.x, el.y, el.width, el.height, el.cornerRadius);
    ctx.clip();
  }

  if (!img) {
    // ระหว่างรอโหลด วาดกล่องเทาจาง ๆ แทน
    ctx.fillStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.restore();
    return;
  }

  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  ctx.drawImage(img, -el.width / 2, -el.height / 2, el.width, el.height);
  ctx.restore();
}

function drawSvg(ctx: CanvasRenderingContext2D, el: SvgElement) {
  const img = getImage(svgDataUrl(el));

  if (img) ctx.drawImage(img, el.x, el.y, el.width, el.height);
}

export function drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  if (el.hidden || el.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = el.opacity;

  if (el.rotation) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
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
  }

  ctx.restore();
}

export function drawPage(
  ctx: CanvasRenderingContext2D,
  page: Page,
  size: { width: number; height: number },
  options: { transparent?: boolean; skipIds?: ReadonlySet<string> } = {},
) {
  if (page.background && !options.transparent) {
    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  for (const el of page.elements) {
    if (options.skipIds?.has(el.id)) continue;
    drawElement(ctx, el);
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
