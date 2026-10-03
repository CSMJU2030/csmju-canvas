import { DEFAULT_FONT } from './fonts';
import type { ImageElement, ShapeElement, ShapeKind, SvgElement, TextElement } from './types';
import { newId } from './types';

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
    groupId: null,
  };
}

export type TextPreset = 'heading' | 'subheading' | 'body';

const TEXT_PRESETS: Record<TextPreset, { label: string; scale: number; weight: 400 | 700; text: string }> = {
  heading: { label: 'หัวเรื่อง', scale: 0.07, weight: 700, text: 'เพิ่มหัวเรื่อง' },
  subheading: { label: 'หัวข้อย่อย', scale: 0.045, weight: 700, text: 'เพิ่มหัวข้อย่อย' },
  body: { label: 'ข้อความ', scale: 0.028, weight: 400, text: 'เพิ่มข้อความเนื้อหา' },
};

export function textPresetLabel(preset: TextPreset) {
  return TEXT_PRESETS[preset].label;
}

export function createText(page: PageSize, preset: TextPreset): TextElement {
  const spec = TEXT_PRESETS[preset];
  const short = Math.min(page.width, page.height);
  const fontSize = Math.max(12, Math.round(short * spec.scale));
  const width = Math.round(page.width * 0.6);

  return {
    ...base(page, width, fontSize * 1.4, spec.label),
    type: 'text',
    text: spec.text,
    fontFamily: DEFAULT_FONT,
    fontSize,
    fontWeight: spec.weight,
    italic: false,
    underline: false,
    align: 'center',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: 'rgb(15 23 42)',
  };
}

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'สี่เหลี่ยม',
  ellipse: 'วงรี',
  triangle: 'สามเหลี่ยม',
  star: 'ดาว',
  line: 'เส้นตรง',
  arrow: 'ลูกศร',
};

export function shapeName(kind: ShapeKind) {
  return SHAPE_NAMES[kind];
}

export function createShape(page: PageSize, shape: ShapeKind): ShapeElement {
  const size = Math.round(Math.min(page.width, page.height) * 0.3);
  const isLine = shape === 'line' || shape === 'arrow';

  return {
    ...base(page, size, isLine ? Math.max(8, Math.round(size * 0.05)) : size, SHAPE_NAMES[shape]),
    type: 'shape',
    shape,
    fill: isLine ? null : 'rgb(0 76 153)',
    stroke: isLine ? 'rgb(15 23 42)' : null,
    strokeWidth: isLine ? Math.max(2, Math.round(size * 0.02)) : 0,
    cornerRadius: 0,
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

/// ชื่อที่แสดงในแผงเลเยอร์ (ข้อความใช้เนื้อหาต้น ๆ)
export function layerLabel(el: { type: string; name: string; text?: string }): string {
  if (el.type === 'text' && el.text) return el.text.split('\n')[0].slice(0, 40) || 'ข้อความ';

  return el.name || 'ชิ้นงาน';
}
