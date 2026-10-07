import { beforeEach, describe, expect, it } from 'vitest';
import { createShape } from './factory';
import { resizeRect } from './geometry';
import {
  autoArrange,
  boardLayout,
  convertPoint,
  edgePoint,
  keepInside,
  layoutPages,
  mostVisiblePage,
  pageAt,
  pageGap,
  pageOffset,
  rectsOverlap,
  scrollLayout,
  visibleFraction,
} from './page-layout';
import { useEditor } from './store';
import { blankDocument, blankPage } from './types';

describe('การจัดวางหน้า', () => {
  it('เลื่อนดู: หน้าเรียงลงล่างตามลำดับ เว้นระยะเท่ากัน และจัดกึ่งกลางตามหน้าที่กว้างที่สุด', () => {
    const rects = scrollLayout(
      [
        { width: 1000, height: 500 },
        { width: 600, height: 800 },
      ],
      100,
    );

    expect(rects[0]).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
    expect(rects[1]).toEqual({ x: 200, y: 600, width: 600, height: 800 });
  });

  it('ระยะห่างระหว่างหน้าโตตามขนาดงานแต่ไม่น้อยกว่า 80', () => {
    expect(pageGap({ width: 100, height: 100 })).toBe(80);
    expect(pageGap({ width: 1920, height: 1080 })).toBe(230);
  });

  it('จัดเรียงอัตโนมัติ: แถวเดียวเรียงซ้ายไปขวา · ตารางขึ้นแถวใหม่ทุก √n หน้า', () => {
    const sizes = [
      { width: 100, height: 50 },
      { width: 100, height: 80 },
      { width: 100, height: 50 },
      { width: 100, height: 50 },
    ];

    expect(autoArrange(sizes, 'row', 10)).toEqual([
      { x: 0, y: 0 },
      { x: 110, y: 0 },
      { x: 220, y: 0 },
      { x: 330, y: 0 },
    ]);
    // 4 หน้า = 2 คอลัมน์ · แถวสองเริ่มใต้หน้าที่สูงที่สุดของแถวแรก
    expect(autoArrange(sizes, 'grid', 10)).toEqual([
      { x: 0, y: 0 },
      { x: 110, y: 0 },
      { x: 0, y: 90 },
      { x: 110, y: 90 },
    ]);
  });

  it('บอร์ด: ใช้ตำแหน่งที่บันทึกไว้ · หน้าใหม่ไปอยู่ทางขวาของหน้าก่อนหน้าในจุดที่ว่าง', () => {
    const size = { width: 100, height: 100 };
    const rects = boardLayout([{ boardX: 0, boardY: 0 }, {}, { boardX: 120, boardY: 0 }], [size, size, size], 20);

    expect(rects[0]).toMatchObject({ x: 0, y: 0 });
    expect(rects[2]).toMatchObject({ x: 120, y: 0 });
    // ทางขวาของหน้า 1 (x = 120) มีหน้า 3 อยู่แล้ว จึงเลื่อนไปต่อท้าย
    expect(rects[1]).toMatchObject({ x: 240, y: 0 });
    expect(rects.some((r, i) => rects.some((o, j) => i !== j && rectsOverlap(r, o)))).toBe(false);
  });

  it('ทีละหน้า: ทุกหน้าอยู่ที่จุดเริ่มต้น และใช้ขนาดเฉพาะหน้าถ้ามี', () => {
    const pages = [blankPage(), { ...blankPage(), width: 500, height: 700 }];

    expect(layoutPages(pages, { width: 1000, height: 1000 }, 'single')).toEqual([
      { x: 0, y: 0, width: 1000, height: 1000 },
      { x: 0, y: 0, width: 500, height: 700 },
    ]);
  });

  it('หาหน้าใต้เมาส์ (หน้าที่เปิดอยู่ชนะเมื่อซ้อนกัน) และหน้าที่เห็นมากที่สุด', () => {
    const rects = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 },
      { x: 300, y: 0, width: 100, height: 100 },
    ];

    expect(pageAt(rects, { x: 75, y: 75 })).toBe(1);
    expect(pageAt(rects, { x: 75, y: 75 }, 0)).toBe(0);
    expect(pageAt(rects, { x: 250, y: 50 })).toBe(-1);
    expect(mostVisiblePage(rects, { x: 280, y: 0, width: 200, height: 200 })).toBe(2);
    expect(visibleFraction(rects[0], { x: 50, y: 0, width: 100, height: 100 })).toBeCloseTo(0.5);
  });
});

describe('การแปลงพิกัดระหว่างหน้า', () => {
  it('จุดเดียวกันในพิกัดโลก: บวก offset จากหน้าต้นทางไปหน้าปลายทาง', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 0, y: 1300 };

    // จุด (100, 1400) บนหน้าแรก (ล้นลงไปทับหน้าที่สอง) = (100, 100) บนหน้าที่สอง
    expect(convertPoint({ x: 100, y: 1400 }, from, to)).toEqual({ x: 100, y: 100 });
    expect(pageOffset(from, to)).toEqual({ dx: 0, dy: -1300 });
    expect(convertPoint(convertPoint({ x: 7, y: 9 }, from, to), to, from)).toEqual({ x: 7, y: 9 });
  });

  it('จุดบนขอบหน้าสำหรับลูกศรเชื่อมหน้าบนบอร์ด', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };

    expect(edgePoint(rect, { x: 500, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(edgePoint(rect, { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
  });

  it('ชิ้นงานที่หลุดนอกหน้าปลายทางที่เล็กกว่าถูกย้ายมากลางหน้า · ที่ยังอยู่ในหน้าไม่ขยับ', () => {
    expect(keepInside({ x: 10, y: 10, width: 50, height: 50 }, { width: 100, height: 100 })).toEqual({ dx: 0, dy: 0 });
    expect(keepInside({ x: 900, y: 900, width: 50, height: 50 }, { width: 100, height: 100 })).toEqual({ dx: -875, dy: -875 });
  });
});

describe('editor store: ย้ายชิ้นงานข้ามหน้า และยกเลิกการลาก', () => {
  beforeEach(() => {
    useEditor.getState().load(
      { designId: 'd1', title: 'งานทดสอบ', designType: 'presentation', width: 1000, height: 1000, access: 'OWNER', linkAccess: 'NONE' },
      { ...blankDocument(), pages: [blankPage(), blankPage()] },
    );
  });

  it('ย้ายหลายชิ้น (รวมกลุ่ม) ไปอีกหน้าในขั้น undo เดียว คงระยะห่างระหว่างชิ้น และเปิดหน้าปลายทาง', () => {
    const s = useEditor.getState;
    const a = { ...createShape({ width: 1000, height: 1000 }, 'rect'), x: 100, y: 900, groupId: 'g1' };
    const b = { ...createShape({ width: 1000, height: 1000 }, 'rect'), x: 300, y: 950, groupId: 'g1' };

    s().addElements([a, b]);
    s().beginGesture();
    s().transferElements([a.id, b.id], 1, pageOffset({ x: 0, y: 0 }, { x: 0, y: 1200 }));
    s().endGesture();

    expect(s().pageIndex).toBe(1);
    expect(s().doc.pages[0].elements).toHaveLength(0);
    expect(s().doc.pages[1].elements.map((el) => [el.x, el.y])).toEqual([
      [100, -300],
      [300, -250],
    ]);
    expect(s().selection).toEqual([a.id, b.id]);

    s().undo();
    expect(s().doc.pages[0].elements.map((el) => el.id)).toEqual([a.id, b.id]);
    expect(s().doc.pages[1].elements).toHaveLength(0);
  });

  it('Esc ระหว่างลากคืนงานเป็นสภาพก่อนลากโดยไม่เพิ่มประวัติ', () => {
    const s = useEditor.getState;
    const shape = { ...createShape({ width: 1000, height: 1000 }, 'rect'), x: 10, y: 10 };

    s().addElements([shape]);

    const pastBefore = s().past.length;

    s().beginGesture();
    s().updateElements([shape.id], () => ({ x: 500 }));
    s().addElements([{ ...shape, id: 'copy' }]);
    s().cancelGesture();

    expect(s().doc.pages[0].elements.map((el) => [el.id, el.x])).toEqual([[shape.id, 10]]);
    expect(s().past.length).toBe(pastBefore);
    expect(s().selection).not.toContain('copy');
  });

  it('ตำแหน่งบนบอร์ดบันทึกในหน้า และล้างได้', () => {
    const s = useEditor.getState;

    s().setBoardPositions([{ x: 10.4, y: 20.6 }, null]);
    expect(s().doc.pages[0]).toMatchObject({ boardX: 10, boardY: 21 });
    expect('boardX' in s().doc.pages[1]).toBe(false);

    s().setBoardPositions([null, { x: 5, y: 5 }]);
    expect('boardX' in s().doc.pages[0]).toBe(false);
    expect(s().doc.pages[1]).toMatchObject({ boardX: 5, boardY: 5 });
  });
});

describe('ย่อขยายจากกึ่งกลาง (Alt)', () => {
  it('ตรึงจุดศูนย์กลาง ขนาดเป็นสองเท่าของระยะถึงเมาส์ และล็อกสัดส่วนได้', () => {
    const start = { x: 100, y: 100, width: 100, height: 50, rotation: 0 };

    expect(resizeRect(start, 'se', { x: 250, y: 175 }, { keepAspect: false, minSize: 4, fromCenter: true })).toEqual({ x: 50, y: 75, width: 200, height: 100 });
    expect(resizeRect(start, 'e', { x: 250, y: 0 }, { keepAspect: false, minSize: 4, fromCenter: true })).toEqual({ x: 50, y: 100, width: 200, height: 50 });

    const kept = resizeRect(start, 'se', { x: 250, y: 130 }, { keepAspect: true, minSize: 4, fromCenter: true });

    expect(kept.width / kept.height).toBeCloseTo(2);
    expect(kept.x + kept.width / 2).toBeCloseTo(150);
  });
});
