import { createFrame, createGrid } from './factory';
import { cellArea, cellImages, toLocal, visibleCrop } from './frames';
import { getImage } from './render';
import { currentPage, useEditor } from './store';
import { newId, type FrameElement, type FrameImage, type FrameShape, type GridElement, type GridLayout, type ImageElement, type ImageOrigin } from './types';
import { useEditorUi } from './ui-store';

/// คำสั่งของกรอบและกริดที่แตะ store (ใส่รูป แทนที่ ลบ แยกรูปออก ลากวาง)
///
/// แยกจาก frames.ts ที่เป็นคณิตศาสตร์ล้วน เพื่อให้ส่วนนั้นทดสอบได้โดยไม่ต้องมี store

interface PageSize {
  width: number;
  height: number;
}

/// รูปที่จะใส่ (จากแผงอัปโหลด คลังภาพ หรือการลากวาง)
export interface ImageSource {
  src: string;
  assetId: string | null;
  naturalWidth: number;
  naturalHeight: number;
  name: string;
  /// แหล่งที่มาของภาพที่นำเข้าจากเว็บอื่น (ติดไปกับชิ้นรูปเมื่อใส่เป็นรูปเดี่ยว)
  origin?: ImageOrigin | null;
}

export type FrameLike = FrameElement | GridElement;

export function isFrameLike(el: { type: string } | null | undefined): el is FrameLike {
  return el?.type === 'frame' || el?.type === 'grid';
}

// ── เพิ่มกรอบ/กริดลงหน้า (ให้แผงองค์ประกอบเรียก) ─────────────────────────

export function insertFrame(page: PageSize, shape: FrameShape): FrameElement {
  const el = createFrame(page, shape);

  useEditor.getState().addElements([el]);
  useEditorUi.getState().set({ frameCell: { id: el.id, cell: 0 } });

  return el;
}

export function insertGrid(page: PageSize, layout: GridLayout): GridElement {
  const el = createGrid(page, layout);

  useEditor.getState().addElements([el]);
  useEditorUi.getState().set({ frameCell: { id: el.id, cell: 0 } });

  return el;
}

// ── รูปในช่อง ────────────────────────────────────────────────────────

export function frameImageFrom(source: ImageSource): FrameImage {
  return {
    src: source.src,
    assetId: source.assetId,
    naturalWidth: Math.max(1, Math.round(source.naturalWidth)),
    naturalHeight: Math.max(1, Math.round(source.naturalHeight)),
    zoom: 1,
    offsetX: 0.5,
    offsetY: 0.5,
    name: source.name,
  };
}

/// รูปเดี่ยวบนหน้า → รูปในกรอบ (เก็บการปรับแสงสี ฟิลเตอร์ การพลิก และรอยยางลบไว้ · การครอปไม่ใช้เพราะกรอบเลื่อนรูปเองได้)
export function frameImageFromElement(el: ImageElement): FrameImage {
  const img = getImage(el.src);
  const crop = el.crop ?? { x: 0, y: 0, width: 1, height: 1 };

  return {
    ...frameImageFrom({
      src: el.src,
      assetId: el.assetId,
      naturalWidth: img?.naturalWidth || el.width / Math.max(0.01, crop.width),
      naturalHeight: img?.naturalHeight || el.height / Math.max(0.01, crop.height),
      name: el.name,
    }),
    flipX: el.flipX,
    flipY: el.flipY,
    adjust: el.adjust ?? null,
    filter: el.filter ?? null,
    filterIntensity: el.filterIntensity,
    colorEdits: el.colorEdits ?? null,
    levels: el.levels ?? null,
    curves: el.curves ?? null,
    effects: el.effects ?? null,
    erase: el.erase ?? null,
  };
}

/// โหลดรูปเพื่ออ่านขนาดจริงก่อนใส่ลงช่อง
export function loadImageSource(src: string, assetId: string | null, name: string): Promise<ImageSource> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve({ src, assetId, name, naturalWidth: img.naturalWidth || 400, naturalHeight: img.naturalHeight || 400 });
    img.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้'));
    img.src = src;
  });
}

export function patchCell(id: string, cell: number, update: (image: FrameImage | null) => FrameImage | null) {
  useEditor.getState().updateElements([id], (el) => {
    if (el.type === 'frame') return cell === 0 ? { image: update(el.image) } : {};

    if (el.type === 'grid' && cell >= 0 && cell < el.cells.length) {
      const cells = [...el.cells];

      cells[cell] = update(cells[cell] ?? null);

      return { cells };
    }

    return {};
  });
}

/// แก้ค่าของรูปในช่อง (ปรับสี ฟิลเตอร์ ซูม เลื่อน พลิก) — ช่องว่างไม่เปลี่ยน
export function patchCellImage(id: string, cell: number, values: Partial<FrameImage>) {
  patchCell(id, cell, (image) => (image ? { ...image, ...values } : image));
}

/// ใส่รูปลงช่อง (แทนรูปเดิมถ้ามี) แล้วเลือกช่องนั้น
export function fillCell(id: string, cell: number, source: ImageSource) {
  patchCell(id, cell, () => frameImageFrom(source));
  useEditor.getState().select([id]);
  useEditorUi.getState().set({ frameCell: { id, cell } });
}

export function clearCell(id: string, cell: number) {
  patchCell(id, cell, () => null);
}

/// ช่องว่างที่ "ใส่รูป" จะลง: กรอบ/กริดที่เลือกอยู่ชิ้นเดียว · ช่องที่คลิกไว้ถ้ายังว่าง ไม่งั้นช่องว่างช่องแรก
/// (เลือกรูปจากแผงต่อกันหลายรูปจึงเติมกริดได้ครบทีละช่อง) · null = ไม่มีช่องว่างให้ใส่
export function selectedCellTarget(): { el: FrameLike; cell: number } | null {
  const state = useEditor.getState();

  if (state.selection.length !== 1) return null;

  const el = currentPage(state).elements.find((e) => e.id === state.selection[0]);

  if (!isFrameLike(el) || el.locked) return null;

  const picked = useEditorUi.getState().frameCell;
  const images = cellImages(el);

  if (picked?.id === el.id && picked.cell >= 0 && picked.cell < images.length && !images[picked.cell]) return { el, cell: picked.cell };

  const empty = images.findIndex((image) => !image);

  return empty >= 0 ? { el, cell: empty } : null;
}

/// เลือกรูปจากแผงขณะที่กรอบ/กริดที่มีช่องว่างถูกเลือกอยู่ = ใส่รูปลงช่องนั้น · คืน false ถ้าไม่ได้ใส่ (ให้ผู้เรียกเพิ่มเป็นรูปใหม่ตามปกติ)
export function fillSelectedFrame(source: ImageSource): boolean {
  const target = selectedCellTarget();

  if (!target) return false;

  fillCell(target.el.id, target.cell, source);

  return true;
}

/// "แยกรูปออก": รูปในช่องกลายเป็นรูปเดี่ยววางทับตำแหน่งเดิม (ครอปเท่าส่วนที่เห็น) แล้วช่องกลับเป็นช่องว่าง
export function detachCell(id: string, cell: number): ImageElement | null {
  const state = useEditor.getState();
  const el = currentPage(state).elements.find((e) => e.id === id);

  if (!isFrameLike(el)) return null;

  const image = cellImages(el)[cell];
  const area = cellArea(el, cell);

  if (!image || !area) return null;

  const img = getImage(image.src);
  const natural = { width: img?.naturalWidth || image.naturalWidth, height: img?.naturalHeight || image.naturalHeight };
  const crop = visibleCrop(area, natural, image);
  const full = crop.width > 0.999 && crop.height > 0.999;
  const center = toLocal({ ...el, rotation: -el.rotation }, { x: area.x + area.width / 2, y: area.y + area.height / 2 });
  const detached: ImageElement = {
    id: newId(),
    name: image.name || 'รูปภาพ',
    x: center.x - area.width / 2,
    y: center.y - area.height / 2,
    width: area.width,
    height: area.height,
    rotation: el.rotation,
    opacity: el.opacity,
    locked: false,
    hidden: false,
    groupId: null,
    type: 'image',
    assetId: image.assetId,
    src: image.src,
    cornerRadius: el.type === 'grid' ? el.cornerRadius : 0,
    flipX: Boolean(image.flipX),
    flipY: Boolean(image.flipY),
    crop: full ? null : crop,
    adjust: image.adjust ?? null,
    filter: image.filter ?? null,
    filterIntensity: image.filterIntensity,
    colorEdits: image.colorEdits ?? null,
    levels: image.levels ?? null,
    curves: image.curves ?? null,
    effects: image.effects ?? null,
    erase: image.erase ?? null,
  };

  state.beginGesture();
  clearCell(id, cell);
  useEditor.getState().addElements([detached]);
  useEditor.getState().endGesture();
  useEditorUi.getState().set({ frameEdit: null });

  return detached;
}

/// ลากรูปเดี่ยวที่อยู่บนหน้าไปปล่อยบนกรอบ/ช่อง = ย้ายรูปเข้าไปในช่อง (รูปเดี่ยวหายไป)
/// เรียกระหว่าง gesture ของการลาก จึงย้อนกลับได้ในขั้นเดียว
export function moveImageIntoCell(image: ImageElement, targetId: string, cell: number) {
  patchCell(targetId, cell, () => frameImageFromElement(image));
  useEditor.getState().removeElements([image.id]);
  useEditor.getState().select([targetId]);
  useEditorUi.getState().set({ frameCell: { id: targetId, cell } });
}

// ── ลากรูปจากแผงมาวางบนผืนผ้าใบ (HTML5 drag and drop) ──────────────────

export const IMAGE_DRAG_TYPE = 'application/x-csmju-image';

export function setImageDragData(data: DataTransfer, source: ImageSource) {
  data.setData(IMAGE_DRAG_TYPE, JSON.stringify(source));
  data.effectAllowed = 'copy';
}

export function hasImageDrag(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.types).includes(IMAGE_DRAG_TYPE));
}

export function readImageDragData(data: DataTransfer): ImageSource | null {
  try {
    const raw = JSON.parse(data.getData(IMAGE_DRAG_TYPE)) as Partial<ImageSource>;

    if (typeof raw.src !== 'string' || !raw.src) return null;

    return {
      src: raw.src,
      assetId: typeof raw.assetId === 'string' ? raw.assetId : null,
      naturalWidth: typeof raw.naturalWidth === 'number' && raw.naturalWidth > 0 ? raw.naturalWidth : 400,
      naturalHeight: typeof raw.naturalHeight === 'number' && raw.naturalHeight > 0 ? raw.naturalHeight : 400,
      name: typeof raw.name === 'string' ? raw.name : 'รูปภาพ',
      ...(validOrigin(raw.origin) ? { origin: validOrigin(raw.origin) } : {}),
    };
  } catch {
    return null;
  }
}

const ORIGIN_SITES = new Set(['unsplash', 'pexels', 'pixabay', 'openverse', 'wikimedia', 'nasa', 'pinterest', 'google', 'other']);

/// แหล่งที่มาที่ติดมากับข้อมูลการลาก — รับเฉพาะรูปแบบที่ถูกต้อง
function validOrigin(value: unknown): ImageOrigin | null {
  if (!value || typeof value !== 'object') return null;

  const { site, url } = value as { site?: unknown; url?: unknown };

  if (typeof site !== 'string' || !ORIGIN_SITES.has(site)) return null;

  return { site: site as ImageOrigin['site'], url: typeof url === 'string' && /^https?:\/\//i.test(url) ? url.slice(0, 500) : null };
}
