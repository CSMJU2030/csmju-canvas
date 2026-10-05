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
  /// เงา (แผงเอฟเฟกต์) · ไม่มี/null = ไม่มีเงา
  shadow?: Shadow | null;
  /// แอนิเมชันตอนพรีเซนต์ (แผงแอนิเมต) · ไม่มี/null = ไม่เคลื่อนไหว
  animation?: AnimationKind | null;
  /// ลิงก์เมื่อกดในโหมดพรีเซนต์/เว็บไซต์
  link?: string | null;
}

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  color: string;
}

export type AnimationKind = 'rise' | 'pan' | 'fade' | 'pop' | 'wipe' | 'blur' | 'drift' | 'tumble' | 'breathe' | 'bounce';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export type TextEffectKind = 'shadow' | 'lift' | 'hollow' | 'splice' | 'echo' | 'glitch' | 'neon' | 'background' | 'outline';

/// เอฟเฟกต์ข้อความแบบ Canva — ค่าที่ใช้แตกต่างกันตามชนิด (ดู docs/design-document.md)
export interface TextEffect {
  kind: TextEffectKind;
  /// 0–100
  offset: number;
  /// 0–360 องศา (ทิศของเงา/เสียงสะท้อน)
  direction: number;
  /// 0–100
  blur: number;
  /// 0–100
  intensity: number;
  color: string;
}

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
  strike?: boolean;
  /// แสดงเป็นตัวพิมพ์ใหญ่ทั้งหมด (ปุ่ม aA) — ข้อความที่เก็บไม่เปลี่ยน
  uppercase?: boolean;
  /// รายการหัวข้อย่อย: ใส่สัญลักษณ์ต่อหน้าทุกย่อหน้า
  list?: 'none' | 'bullet' | 'number';
  effect?: TextEffect | null;
  /// ข้อความโค้งเป็นวงกลม · 0 = ตรง · −100..100 (บวก = โค้งขึ้น)
  curve?: number;
}

export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'triangle-down'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'line'
  | 'arrow'
  | 'curve'
  | 'elbow';

/// รูปทรงที่เป็นเส้น (ไม่มีสีพื้น ลากจากขอบซ้ายไปขอบขวา)
export function isLineShape(shape: ShapeKind): boolean {
  return shape === 'line' || shape === 'arrow' || shape === 'curve' || shape === 'elbow';
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  /// สีหรือกราเดียนต์แบบ CSS (`linear-gradient(90deg, rgb(…) 0%, rgb(…) 100%)`) · null = ไม่มีสีพื้น
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius: number;
  strokeStyle?: StrokeStyle;
}

export type StrokeStyle = 'solid' | 'dash' | 'long-dash' | 'dot';

/// ส่วนของรูปต้นฉบับที่แสดง เป็นสัดส่วน 0–1 ของรูป
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/// ค่าปรับรูป −100..100 (0 = เดิม) · vignette และ blur 0..100
export interface ImageAdjust {
  temperature: number;
  tint: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
  sharpness: number;
  clarity: number;
  vignette: number;
  blur: number;
}

export interface Border {
  style: StrokeStyle;
  width: number;
  color: string;
}

/// แก้ไขสีเฉพาะช่วงสีที่เลือก (แผงปรับ → แก้ไขสี) · hue −100..100 = หมุนเฉดสี ±60° · ค่าอื่น −100..100
export interface ColorEdit {
  color: string;
  hue: number;
  saturation: number;
  lightness: number;
}

/// รอยยางลบพิกเซล: `points` = [x0, y0, x1, y1, …] สัดส่วน 0–1 ของรูปเต็มก่อนครอป · `size` = เส้นผ่านศูนย์กลางเป็นสัดส่วนของความกว้างรูป
export interface EraseStroke {
  points: number[];
  size: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  /// asset ของผู้ใช้ (null = รูปที่ฝังเป็น data URL)
  assetId: string | null;
  src: string;
  cornerRadius: number;
  flipX: boolean;
  flipY: boolean;
  crop?: Crop | null;
  adjust?: Partial<ImageAdjust> | null;
  /// ฟิลเตอร์สำเร็จรูป (key ใน lib/editor/image-filters.ts) และความแรง 0–100
  filter?: string | null;
  filterIntensity?: number;
  border?: Border | null;
  colorEdits?: ColorEdit[] | null;
  erase?: EraseStroke[] | null;
}

export interface SvgElement extends BaseElement {
  type: 'svg';
  /// markup ของ SVG ทั้งก้อน ใช้ `currentColor` แทนสีที่เปลี่ยนได้
  svg: string;
  color: string;
}

export type BrushKind = 'pen' | 'marker' | 'highlighter';

/// เส้นวาดมือ (เครื่องมือ "วาด" และลายเซ็นแบบเขียน)
///
/// `strokes` คือเส้นแต่ละเส้นเป็นพิกัดเรียงกัน [x0, y0, x1, y1, …] ในหน่วยสัดส่วน 0–1 ของกล่อง
/// จึงย่อขยายกล่องแล้วเส้นยืดตาม · `strokeWidth` เป็นพิกเซลของหน้า
export interface PathElement extends BaseElement {
  type: 'path';
  strokes: number[][];
  color: string;
  strokeWidth: number;
  brush: BrushKind;
}

/// วิดีโอที่ผู้ใช้อัปโหลดเอง (แผงองค์ประกอบ → วิดีโอ หรือแผงอัปโหลด)
///
/// ตอนแก้ไขและส่งออกภาพนิ่งวาด "ภาพปก" = เฟรมที่วินาที `trimStart` · ตอนพรีเซนต์และส่งออกวิดีโอเล่นจริง
/// ตั้งแต่ `trimStart` ถึง `trimEnd` (วินาทีของไฟล์ต้นฉบับ) · ภาพถูกครอปแบบ cover ให้เต็มกล่อง
export interface VideoElement extends BaseElement {
  type: 'video';
  assetId: string | null;
  src: string;
  /// ความยาวไฟล์ต้นฉบับ (วินาที) — ใช้จำกัดช่วงตัดต่อ
  duration: number;
  /// ขนาดภาพต้นฉบับ (พิกเซล) — ใช้คงสัดส่วนตอนครอปแบบ cover
  naturalWidth: number;
  naturalHeight: number;
  cornerRadius: number;
  /// ปิดเสียงของคลิป
  muted: boolean;
  /// เล่นซ้ำเมื่อถึง `trimEnd`
  loop: boolean;
  trimStart: number;
  /// null = เล่นถึงท้ายไฟล์
  trimEnd: number | null;
}

/// เสียงประกอบของหน้า (เพลงหรือเสียงบรรยายที่ผู้ใช้อัปโหลดเอง) — เล่นตอนพรีเซนต์หน้านั้นและอยู่ในไฟล์วิดีโอที่ส่งออก
export interface AudioTrack {
  id: string;
  assetId: string | null;
  src: string;
  name: string;
  /// ความยาวไฟล์ (วินาที)
  duration: number;
  /// 0–1
  volume: number;
  /// เล่นวนจนกว่าจะออกจากหน้า
  loop: boolean;
}

export type ElementType = 'text' | 'shape' | 'image' | 'svg' | 'path' | 'video';
export type CanvasElement = TextElement | ShapeElement | ImageElement | SvgElement | PathElement | VideoElement;

export interface Page {
  id: string;
  /// สีหรือกราเดียนต์แบบ CSS · null = โปร่งใส
  background: string | null;
  elements: CanvasElement[];
  /// ชื่อหน้า ("หน้า 1 - เพิ่มชื่อหน้า")
  name?: string;
  /// ซ่อนตอนพรีเซนต์และดาวน์โหลด
  hidden?: boolean;
  /// ล็อกทั้งหน้า — แก้ชิ้นงานในหน้าไม่ได้
  locked?: boolean;
  /// สมุดโน้ตของผู้พรีเซนต์ (ไม่เกิน 5000 ตัวอักษร)
  notes?: string;
  /// เวลาแสดงตอนเล่นอัตโนมัติ (วินาที)
  duration?: number;
  /// ขนาดเฉพาะหน้านี้ (หน้าต่างขนาดในงานเดียวกัน) · ไม่มี = ใช้ขนาดของงาน
  width?: number;
  height?: number;
  /// เสียงประกอบของหน้า (แถบเสียงใต้แถบภาพย่อหน้า) · ไม่มี = ไม่มีเสียง
  audio?: AudioTrack[];
}

/// ขนาดจริงของหน้า — หน้าที่ไม่ได้กำหนดเองใช้ขนาดของงาน
export function pageSizeOf(page: Pick<Page, 'width' | 'height'>, base: { width: number; height: number }): { width: number; height: number } {
  return { width: page.width ?? base.width, height: page.height ?? base.height };
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
      ...page,
      id: typeof page.id === 'string' ? page.id : newId('page'),
      background: page.background === undefined ? 'rgb(255 255 255)' : page.background,
      elements: Array.isArray(page.elements)
        ? page.elements.filter(isKnownElement).map(withDefaults)
        : [],
      ...(page.audio === undefined ? {} : { audio: normalizeAudio(page.audio) }),
    })),
  };
}

function isKnownElement(value: unknown): value is CanvasElement {
  const type = (value as { type?: unknown } | null)?.type;

  return type === 'text' || type === 'shape' || type === 'image' || type === 'svg' || type === 'path' || type === 'video';
}

/// ตัดเสียงที่ไม่มีไฟล์ทิ้ง และเติมค่าที่ขาด (เอกสารที่ CMS เขียนเอง)
function normalizeAudio(input: unknown): AudioTrack[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((t): t is AudioTrack => typeof (t as AudioTrack | null)?.src === 'string')
    .map((t) => ({
      id: typeof t.id === 'string' ? t.id : newId('audio'),
      assetId: t.assetId ?? null,
      src: t.src,
      name: t.name ?? '',
      duration: Number.isFinite(t.duration) ? t.duration : 0,
      volume: Number.isFinite(t.volume) ? Math.min(1, Math.max(0, t.volume)) : 1,
      loop: t.loop ?? false,
    }));
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
