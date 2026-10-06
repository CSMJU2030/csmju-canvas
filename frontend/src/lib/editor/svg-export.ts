import { chartSvg } from './chart';
import { assetFontUrl, assetIdOfFont, cssFamily, fontFaceName } from './fonts';
import { isGradient, parseGradient } from './paint';
import { HIGHLIGHTER_ALPHA, dashFor, drawElement, layoutLines, preloadPage, svgDataUrl } from './render';
import { tableSvg } from './table-render';
import { isLineShape, type CanvasElement, type FrameElement, type GridElement, type ImageElement, type Page, type PathElement, type ShapeElement, type TextElement, type VideoElement } from './types';

/// ส่งออกหน้าเป็น SVG (เวกเตอร์) — ข้อความ รูปทรง เส้นวาด และไอคอนยังเป็นเวกเตอร์ แก้ต่อในโปรแกรมอื่นได้
///
/// รูปภาพฝังเป็น PNG ในไฟล์ (รวมการครอป ปรับสี และขอบมนแล้ว) · ฟอนต์อ้างชื่อฟอนต์ไว้
/// เครื่องที่เปิดไฟล์ต้องมีฟอนต์นั้นจึงจะเห็นเหมือนกัน (ฟอนต์อยู่ใน /fonts ของระบบ ดาวน์โหลดได้ฟรี สัญญาอนุญาต OFL/Apache 2.0)
/// ยกเว้นฟอนต์ที่ผู้ใช้อัปโหลดเอง ("asset:<uuid>") ซึ่งฝังเป็น @font-face ในไฟล์ (เครื่องอื่นไม่มีฟอนต์นี้แน่นอน) ·
/// โหลดไฟล์ฟอนต์ไม่ได้ → ข้ามไป ข้อความแสดงด้วยฟอนต์สำรอง

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => Math.round(v * 100) / 100;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

  return btoa(binary);
}

/// ฟอนต์ที่อัปโหลดเองที่หน้านี้ใช้ (ข้อความ ตาราง ชาร์ต)
export function assetFontsOf(page: Page): string[] {
  const ids = new Set<string>();

  for (const el of page.elements) {
    if ((el.type === 'text' || el.type === 'table' || el.type === 'chart') && assetIdOfFont(el.fontFamily)) ids.add(el.fontFamily);
  }

  return [...ids];
}

async function embeddedFontFaces(page: Page): Promise<string[]> {
  const faces = await Promise.all(
    assetFontsOf(page).map(async (id) => {
      try {
        const response = await fetch(assetFontUrl(assetIdOfFont(id)!), { credentials: 'same-origin' });

        if (!response.ok) return '';

        const type = response.headers.get('content-type')?.split(';')[0] || 'font/ttf';
        const data = bytesToBase64(new Uint8Array(await response.arrayBuffer()));

        return `@font-face{font-family:"${fontFaceName(id)}";src:url(data:${type};base64,${data})}`;
      } catch {
        return '';
      }
    }),
  );

  return faces.filter(Boolean);
}

export async function pageToSvg(page: Page, size: { width: number; height: number }): Promise<string> {
  await preloadPage(page);

  const faces = await embeddedFontFaces(page);
  const defs: string[] = faces.length ? [`<style>${faces.join('')}</style>`] : [];
  const body: string[] = [];
  let uid = 0;
  const id = (prefix: string) => `${prefix}${++uid}`;

  const paint = (value: string): string => {
    if (!isGradient(value)) return esc(value);

    const g = parseGradient(value);

    if (!g) return 'none';

    const gid = id('g');
    const stops = g.stops.map((s) => `<stop offset="${n(s.at * 100)}%" stop-color="${esc(s.color)}"/>`).join('');

    if (g.type === 'radial') {
      defs.push(`<radialGradient id="${gid}" cx="50%" cy="50%" r="70%">${stops}</radialGradient>`);
    } else {
      const rad = ((g.angle - 90) * Math.PI) / 180;
      const x = Math.cos(rad) / 2;
      const y = Math.sin(rad) / 2;

      defs.push(`<linearGradient id="${gid}" x1="${n(0.5 - x)}" y1="${n(0.5 - y)}" x2="${n(0.5 + x)}" y2="${n(0.5 + y)}">${stops}</linearGradient>`);
    }


    return `url(#${gid})`;
  };

  const shadowFilter = (s: { x: number; y: number; blur: number; color: string }) => {
    const fid = id('f');

    defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${n(s.x)}" dy="${n(s.y)}" stdDeviation="${n(s.blur / 2)}" flood-color="${esc(s.color)}"/></filter>`);

    return ` filter="url(#${fid})"`;
  };

  if (page.background) body.push(`<rect width="${size.width}" height="${size.height}" fill="${paint(page.background)}"/>`);

  for (const el of page.elements) {
    if (el.hidden || el.opacity <= 0) continue;

    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const attrs = [
      el.rotation ? `transform="rotate(${n(el.rotation)} ${n(cx)} ${n(cy)})"` : '',
      el.opacity < 1 ? `opacity="${n(el.opacity)}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const shadow = el.shadow && el.type !== 'text' && el.type !== 'table' ? shadowFilter(el.shadow) : '';

    body.push(`<g ${attrs}${shadow}>${await elementSvg(el, paint, shadowFilter)}</g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
}

async function elementSvg(
  el: CanvasElement,
  paint: (value: string) => string,
  shadowFilter: (s: { x: number; y: number; blur: number; color: string }) => string,
): Promise<string> {
  switch (el.type) {
    case 'text':
      return textSvg(el, shadowFilter);
    case 'shape':
      return shapeSvg(el, paint);
    case 'path':
      return pathSvg(el);
    case 'svg':
      return `<image x="${n(el.x)}" y="${n(el.y)}" width="${n(el.width)}" height="${n(el.height)}" href="${esc(svgDataUrl(el))}"/>`;
    case 'image':
    case 'frame':
    case 'grid':
    case 'video':
      // วิดีโอใน SVG เป็นภาพปก (SVG เล่นวิดีโอไม่ได้)
      return imageSvg(el);
    case 'table':
      return tableSvg(el);
    case 'chart':
      return chartSvg(el);
  }
}

function textSvg(el: TextElement, shadowFilter: (s: { x: number; y: number; blur: number; color: string }) => string): string {
  const lines = layoutLines(el);
  const lineHeight = el.fontSize * el.lineHeight;
  const align = el.align === 'justify' ? 'left' : el.align;
  const anchor = align === 'left' ? 'start' : align === 'center' ? 'middle' : 'end';
  const x = align === 'left' ? el.x : align === 'center' ? el.x + el.width / 2 : el.x + el.width;
  const decoration = [el.underline && 'underline', el.strike && 'line-through'].filter(Boolean).join(' ');
  const effect = el.effect;
  const hollow = effect?.kind === 'hollow';
  const fill = hollow ? 'none' : esc(el.color);
  const stroke = hollow
    ? ` stroke="${esc(el.color)}" stroke-width="${n(Math.max(1, (effect!.intensity * el.fontSize) / 1250))}"`
    : effect?.kind === 'outline'
      ? ` stroke="${esc(effect.color)}" stroke-width="${n(Math.max(1, (effect.intensity * el.fontSize) / 830))}" paint-order="stroke"`
      : '';
  const filter =
    effect?.kind === 'shadow'
      ? shadowFilter({
          x: (Math.cos(((effect.direction - 90) * Math.PI) / 180) * effect.offset * el.fontSize) / 200,
          y: (Math.sin(((effect.direction - 90) * Math.PI) / 180) * effect.offset * el.fontSize) / 200,
          blur: (effect.blur * el.fontSize) / 166,
          color: effect.color,
        })
      : effect?.kind === 'lift'
        ? shadowFilter({ x: 0, y: el.fontSize * 0.08, blur: el.fontSize * 0.25, color: 'rgb(0 0 0 / 0.3)' })
        : effect?.kind === 'neon'
          ? shadowFilter({ x: 0, y: 0, blur: el.fontSize * 0.4, color: el.color })
          : '';
  const style = `font-family:${esc(cssFamily(el.fontFamily))};font-size:${n(el.fontSize)}px;font-weight:${el.fontWeight};${el.italic ? 'font-style:italic;' : ''}${el.letterSpacing ? `letter-spacing:${n(el.letterSpacing)}px;` : ''}${decoration ? `text-decoration:${decoration};` : ''}`;
  const tspans = lines
    .map((line, i) => `<tspan x="${n(x)}" y="${n(el.y + lineHeight * i + lineHeight / 2)}">${esc(line.text)}</tspan>`)
    .join('');

  return `<text text-anchor="${anchor}" dominant-baseline="central" fill="${fill}"${stroke}${filter} style="${style}" xml:space="preserve">${tspans}</text>`;
}

function shapeSvg(el: ShapeElement, paint: (value: string) => string): string {
  const { x, y, width: w, height: h } = el;
  const line = isLineShape(el.shape);
  const fill = el.fill && !line ? paint(el.fill) : 'none';
  const dash = dashFor(el.strokeStyle, el.strokeWidth);
  const stroke = el.stroke && el.strokeWidth > 0
    ? ` stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dash.length ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : ''}`
    : '';
  const attrs = `fill="${fill}"${stroke}`;
  const poly = (points: [number, number][]) => `<polygon points="${points.map(([px, py]) => `${n(px)},${n(py)}`).join(' ')}" ${attrs}/>`;
  const regular = (sides: number) => {
    const start = -Math.PI / 2 + (sides === 8 || sides === 6 ? Math.PI / sides : 0);

    return poly(Array.from({ length: sides }, (_, i) => {
      const a = start + (i * 2 * Math.PI) / sides;

      return [x + w / 2 + (Math.cos(a) * w) / 2, y + h / 2 + (Math.sin(a) * h) / 2] as [number, number];
    }));
  };

  switch (el.shape) {
    case 'rect':
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(Math.min(el.cornerRadius, w / 2, h / 2))}" ${attrs}/>`;
    case 'ellipse':
      return `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${attrs}/>`;
    case 'triangle':
      return poly([[x + w / 2, y], [x + w, y + h], [x, y + h]]);
    case 'triangle-down':
      return poly([[x, y], [x + w, y], [x + w / 2, y + h]]);
    case 'diamond':
      return poly([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]);
    case 'pentagon':
      return regular(5);
    case 'hexagon':
      return regular(6);
    case 'octagon':
      return regular(8);
    case 'star':
      return poly(Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? 1 : 0.42;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;

        return [x + w / 2 + (Math.cos(a) * w * r) / 2, y + h / 2 + (Math.sin(a) * h * r) / 2] as [number, number];
      }));
    case 'line':
      return `<path d="M${n(x)} ${n(y + h / 2)}H${n(x + w)}" ${attrs}/>`;
    case 'arrow': {
      const size = Math.max(8, el.strokeWidth * 3);
      const tx = x + w;
      const ty = y + h / 2;

      return `<path d="M${n(x)} ${n(ty)}H${n(tx)}M${n(tx - size)} ${n(ty - size * 0.6)}L${n(tx)} ${n(ty)}L${n(tx - size)} ${n(ty + size * 0.6)}" ${attrs}/>`;
    }
    case 'curve':
      return `<path d="M${n(x)} ${n(y + h)}Q${n(x + w / 2)} ${n(y - h)} ${n(x + w)} ${n(y + h)}" ${attrs}/>`;
    case 'elbow':
      return `<path d="M${n(x)} ${n(y)}H${n(x + w / 2)}V${n(y + h)}H${n(x + w)}" ${attrs}/>`;
  }
}

function pathSvg(el: PathElement): string {
  const d = el.strokes
    .map((stroke) => {
      const pts: string[] = [];

      for (let i = 0; i < stroke.length; i += 2) pts.push(`${n(el.x + stroke[i] * el.width)} ${n(el.y + stroke[i + 1] * el.height)}`);

      return pts.length === 1 ? `M${pts[0]}l0.01 0` : `M${pts.join('L')}`;
    })
    .join('');

  return `<path d="${d}" fill="none" stroke="${esc(el.color)}" stroke-width="${n(el.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${el.brush === 'highlighter' ? ` stroke-opacity="${HIGHLIGHTER_ALPHA}"` : ''}/>`;
}

/// รูปภาพ กรอบ กริด และวิดีโอ (ภาพปก): วาดด้วยตัววาดเดียวกับหน้าจอ (ครอป ปรับสี ขอบมน เส้นขอบ หน้ากากของกรอบ) แล้วฝังเป็น PNG
function imageSvg(el: ImageElement | FrameElement | GridElement | VideoElement): string {
  const scale = Math.min(2, 4096 / Math.max(el.width, el.height));
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(el.width * scale));
  canvas.height = Math.max(1, Math.round(el.height * scale));

  const ctx = canvas.getContext('2d')!;

  ctx.scale(scale, scale);
  ctx.translate(-el.x, -el.y);
  drawElement(ctx, { ...el, rotation: 0, opacity: 1, shadow: null });

  let href = '';

  try {
    href = canvas.toDataURL('image/png');
  } catch {
    // รูปข้ามโดเมนอ่านไม่ได้ — ข้ามรูปนี้
    return '';
  }


  return `<image x="${n(el.x)}" y="${n(el.y)}" width="${n(el.width)}" height="${n(el.height)}" href="${href}"/>`;
}
