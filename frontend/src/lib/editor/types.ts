/// JSON state ของผืนผ้าใบ เวอร์ชัน 1 — สัญญาที่ CMS ใช้ render สด (docs/design-document.md)
///
/// พิกัดทุกตัวเป็นพิกเซลของหน้า (ไม่ขึ้นกับการซูม) · จุดอ้างอิงคือมุมซ้ายบนของกล่อง
/// ก่อนหมุน · หมุนรอบจุดกึ่งกลางกล่องเป็นองศาตามเข็มนาฬิกา
/// ลำดับใน `elements` คือลำดับชั้น: ตัวแรกอยู่ล่างสุด ตัวสุดท้ายอยู่บนสุด

export const DOCUMENT_VERSION = 1;

export interface BaseElement {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  /// element ที่มี groupId เดียวกันถูกเลือกและย้ายไปด้วยกัน
  groupId: string | null;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 400 | 700;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  color: string;
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'line' | 'arrow';

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  /// asset ของผู้ใช้ (null = รูปที่ฝังเป็น data URL)
  assetId: string | null;
  src: string;
  cornerRadius: number;
  flipX: boolean;
  flipY: boolean;
}

export interface SvgElement extends BaseElement {
  type: 'svg';
  /// markup ของ SVG ทั้งก้อน ใช้ `currentColor` แทนสีที่เปลี่ยนได้
  svg: string;
  color: string;
}

export type ElementType = 'text' | 'shape' | 'image' | 'svg';
export type CanvasElement = TextElement | ShapeElement | ImageElement | SvgElement;

export interface Page {
  id: string;
  /// สีพื้นหลัง · null = โปร่งใส
  background: string | null;
  elements: CanvasElement[];
}

export interface DesignDocument {
  version: typeof DOCUMENT_VERSION;
  pages: Page[];
}

export function newId(prefix = 'el'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}-${random}`;
}

export function blankPage(background: string | null = 'rgb(255 255 255)'): Page {
  return { id: newId('page'), background, elements: [] };
}

export function blankDocument(): DesignDocument {
  return { version: DOCUMENT_VERSION, pages: [blankPage()] };
}

/// รับ JSON จากหลังบ้านแล้วเติมค่าที่ขาดให้ครบ (เอกสารเก่าหรือที่ CMS เขียนเอง)
export function normalizeDocument(input: unknown): DesignDocument {
  const raw = (input ?? {}) as Partial<DesignDocument>;
  const pages = Array.isArray(raw.pages) && raw.pages.length > 0 ? raw.pages : [blankPage()];

  return {
    version: DOCUMENT_VERSION,
    pages: pages.map((page) => ({
      id: typeof page.id === 'string' ? page.id : newId('page'),
      background: page.background === undefined ? 'rgb(255 255 255)' : page.background,
      elements: Array.isArray(page.elements)
        ? page.elements.filter(isKnownElement).map(withDefaults)
        : [],
    })),
  };
}

function isKnownElement(value: unknown): value is CanvasElement {
  const type = (value as { type?: unknown } | null)?.type;

  return type === 'text' || type === 'shape' || type === 'image' || type === 'svg';
}

function withDefaults(element: CanvasElement): CanvasElement {
  return {
    ...element,
    id: element.id || newId(),
    name: element.name ?? '',
    rotation: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
    locked: element.locked ?? false,
    hidden: element.hidden ?? false,
    groupId: element.groupId ?? null,
  };
}
