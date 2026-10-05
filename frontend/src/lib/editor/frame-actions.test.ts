import { beforeEach, describe, expect, it } from 'vitest';
import { createImage } from './factory';
import { detachCell, fillSelectedFrame, insertFrame, insertGrid, moveImageIntoCell, readImageDragData, setImageDragData } from './frame-actions';
import { currentPage, useEditor } from './store';
import { blankDocument, type FrameElement, type GridElement, type ImageElement } from './types';
import { useEditorUi } from './ui-store';

const PAGE = { width: 1000, height: 1000 };
const source = (src: string) => ({ src, assetId: null, naturalWidth: 2000, naturalHeight: 1000, name: 'ทดสอบ' });
const s = useEditor.getState;
const find = <T,>(id: string) => currentPage(s()).elements.find((el) => el.id === id) as T;

beforeEach(() => {
  s().load({ designId: 'd1', title: 'งานทดสอบ', designType: 'poster', width: 1000, height: 1000, access: 'OWNER', linkAccess: 'NONE' }, blankDocument());
  useEditorUi.getState().set({ frameCell: null, frameEdit: null });
});

describe('ใส่รูปลงกรอบ/กริดที่เลือก', () => {
  it('เลือกรูปจากแผงต่อกันเติมกริดทีละช่องว่าง แล้วช่องเต็มจึงเพิ่มเป็นรูปใหม่', () => {
    const grid = insertGrid(PAGE, 'cols-2');

    expect(fillSelectedFrame(source('/a.png'))).toBe(true);
    expect(fillSelectedFrame(source('/b.png'))).toBe(true);
    expect(fillSelectedFrame(source('/c.png'))).toBe(false);
    expect(find<GridElement>(grid.id).cells.map((c) => c?.src)).toEqual(['/a.png', '/b.png']);
  });

  it('ใส่ลงช่องที่คลิกไว้ก่อน', () => {
    const grid = insertGrid(PAGE, 'grid-2x2');

    useEditorUi.getState().set({ frameCell: { id: grid.id, cell: 2 } });
    fillSelectedFrame(source('/a.png'));
    expect(find<GridElement>(grid.id).cells.map((c) => c?.src ?? null)).toEqual([null, null, '/a.png', null]);
  });

  it('ไม่ได้เลือกกรอบ = ไม่ใส่', () => {
    insertFrame(PAGE, 'circle');
    s().select([]);
    expect(fillSelectedFrame(source('/a.png'))).toBe(false);
  });
});

describe('ย้ายรูปเข้า/ออกจากกรอบ', () => {
  it('ลากรูปเดี่ยวไปปล่อยบนกรอบ: รูปเข้าไปในกรอบ (เก็บฟิลเตอร์ไว้) รูปเดี่ยวหายไป และย้อนกลับได้ขั้นเดียว', () => {
    const frame = insertFrame(PAGE, 'heart');
    const image: ImageElement = { ...createImage(PAGE, source('/a.png')), filter: 'warm', filterIntensity: 60 };

    s().addElements([image]);
    s().beginGesture();
    moveImageIntoCell(image, frame.id, 0);
    s().endGesture();

    expect(find<FrameElement>(frame.id).image).toMatchObject({ src: '/a.png', filter: 'warm', filterIntensity: 60, zoom: 1, offsetX: 0.5 });
    expect(find(image.id)).toBeUndefined();

    s().undo();
    expect(find<FrameElement>(frame.id).image).toBeNull();
    expect(find(image.id)).toBeDefined();
  });

  it('แยกรูปออก: ได้รูปเดี่ยวทับตำแหน่งช่อง ครอปเท่าส่วนที่เห็น และช่องกลับเป็นว่าง', () => {
    const grid = insertGrid(PAGE, 'cols-2');

    useEditorUi.getState().set({ frameCell: { id: grid.id, cell: 1 } });
    fillSelectedFrame(source('/a.png'));

    const cellBefore = find<GridElement>(grid.id);
    const detached = detachCell(grid.id, 1)!;

    expect(detached).toMatchObject({ type: 'image', src: '/a.png', rotation: 0 });
    expect(detached.x).toBeCloseTo(cellBefore.x + cellBefore.width / 2 + cellBefore.gap / 2);
    expect(detached.crop!.height).toBeCloseTo(1);
    expect(detached.crop!.width).toBeLessThan(1);
    expect(find<GridElement>(grid.id).cells[1]).toBeNull();

    s().undo();
    expect(find<GridElement>(grid.id).cells[1]?.src).toBe('/a.png');
    expect(find(detached.id)).toBeUndefined();
  });
});

describe('ข้อมูลการลากรูปจากแผง', () => {
  it('เขียนแล้วอ่านกลับได้ · ข้อมูลเสียคืน null', () => {
    const store = new Map<string, string>();
    const types: string[] = [];
    const data = {
      types,
      effectAllowed: 'none',
      setData: (type: string, value: string) => {
        store.set(type, value);
        types.push(type);
      },
      getData: (type: string) => store.get(type) ?? '',
    } as unknown as DataTransfer;

    setImageDragData(data, source('/a.png'));
    expect(readImageDragData(data)).toEqual(source('/a.png'));

    store.set('application/x-csmju-image', '{bad');
    expect(readImageDragData(data)).toBeNull();
  });
});
