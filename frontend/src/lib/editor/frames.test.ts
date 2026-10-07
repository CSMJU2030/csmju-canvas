import { describe, expect, it } from 'vitest';
import { createFrame, createGrid } from './factory';
import {
  FRAME_SHAPES,
  GRID_LAYOUTS,
  cellAt,
  cellCorners,
  coverRect,
  frameArea,
  frameDecor,
  frameMaskPath,
  gridCellRects,
  panOffset,
  relayoutCells,
  visibleCrop,
} from './frames';
import { normalizeDocument, type FrameImage, type GridElement } from './types';

const image = (src: string, extra: Partial<FrameImage> = {}): FrameImage => ({
  src,
  assetId: null,
  naturalWidth: 2000,
  naturalHeight: 1000,
  zoom: 1,
  offsetX: 0.5,
  offsetY: 0.5,
  ...extra,
});

describe('coverRect', () => {
  const area = { x: 100, y: 50, width: 200, height: 200 };

  it('รูปแนวนอนในช่องจัตุรัส: สูงเต็มช่อง กว้างล้นสองข้างเท่ากัน', () => {
    expect(coverRect(area, 2000, 1000)).toEqual({ x: 0, y: 50, width: 400, height: 200 });
  });

  it('offset 0 / 1 ชิดขอบซ้าย/ขวาของรูป', () => {
    expect(coverRect(area, 2000, 1000, 1, 0, 0.5).x).toBe(100);
    expect(coverRect(area, 2000, 1000, 1, 1, 0.5).x).toBe(-100);
  });

  it('ซูม 2 เท่าขยายรอบจุดเดิม และจำกัดซูมไว้ 1–5', () => {
    expect(coverRect(area, 2000, 1000, 2)).toEqual({ x: -200, y: -50, width: 800, height: 400 });
    expect(coverRect(area, 2000, 1000, 0.2).width).toBe(400);
    expect(coverRect(area, 2000, 1000, 99).width).toBe(2000);
  });
});

describe('panOffset', () => {
  const area = { x: 0, y: 0, width: 200, height: 200 };
  const natural = { width: 2000, height: 1000 };

  it('ลากไปขวาเท่าครึ่งส่วนที่ล้น = ชิดซ้ายของรูป · แกนที่ไม่ล้นไม่ขยับ', () => {
    expect(panOffset(area, image('a'), natural, 100, 50)).toEqual({ offsetX: 0, offsetY: 0.5 });
    expect(panOffset(area, image('a'), natural, -100, 0)).toEqual({ offsetX: 1, offsetY: 0.5 });
  });

  it('ลากเกินขอบรูปไม่ได้ (ไม่เห็นพื้นหลังโผล่)', () => {
    expect(panOffset(area, image('a'), natural, 5000, 0).offsetX).toBe(0);
    expect(panOffset(area, image('a'), natural, -5000, 0).offsetX).toBe(1);
  });

  it('ซูมแล้วเลื่อนแนวตั้งได้ด้วย', () => {
    const next = panOffset(area, image('a', { zoom: 2 }), natural, 0, 100);

    // ซูม 2 เท่า: รูปสูง 400 ล้น 200 → ลากลง 100 = offset ลดลงครึ่ง
    expect(next.offsetY).toBeCloseTo(0);
  });
});

describe('visibleCrop', () => {
  it('ส่วนที่เห็นของรูปแนวนอนที่อยู่กลางช่องจัตุรัส', () => {
    expect(visibleCrop({ x: 0, y: 0, width: 200, height: 200 }, { width: 2000, height: 1000 }, image('a'))).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it('รูปที่พลิกแนวนอนเห็นฝั่งตรงข้ามของรูปต้นฉบับ', () => {
    const crop = visibleCrop({ x: 0, y: 0, width: 200, height: 200 }, { width: 2000, height: 1000 }, image('a', { offsetX: 0, flipX: true }));

    expect(crop.x).toBeCloseTo(0.5);
    expect(crop.width).toBeCloseTo(0.5);
  });
});

describe('gridCellRects', () => {
  const box = { x: 10, y: 20, width: 400, height: 300 };

  it('2 คอลัมน์ ระยะห่าง 10: ขอบนอกชิดกล่อง ช่องห่างกัน 10', () => {
    const [a, b] = gridCellRects({ ...box, layout: 'cols-2', gap: 10 });

    expect(a).toEqual({ x: 10, y: 20, width: 195, height: 300 });
    expect(b).toEqual({ x: 215, y: 20, width: 195, height: 300 });
  });

  it('ทุกเค้าโครง: จำนวนช่องตรง ช่องอยู่ในกล่อง และไม่มีระยะห่างช่องรวมกันเต็มกล่องพอดี', () => {
    for (const layout of GRID_LAYOUTS) {
      const cells = gridCellRects({ ...box, layout: layout.key, gap: 0 });
      const area = cells.reduce((sum, c) => sum + c.width * c.height, 0);

      expect(cells).toHaveLength(layout.cells.length);
      expect(area).toBeCloseTo(box.width * box.height, 3);

      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(box.x - 1e-9);
        expect(c.y).toBeGreaterThanOrEqual(box.y - 1e-9);
        expect(c.x + c.width).toBeLessThanOrEqual(box.x + box.width + 1e-9);
        expect(c.y + c.height).toBeLessThanOrEqual(box.y + box.height + 1e-9);
      }
    }
  });

  it('1 ใหญ่ + 3 เล็ก: ช่องใหญ่อยู่บน กว้างเต็ม', () => {
    const [big, ...small] = gridCellRects({ ...box, layout: 'big-3', gap: 0 });

    expect(big).toEqual({ x: 10, y: 20, width: 400, height: 180 });
    expect(small).toHaveLength(3);
    expect(small[0].width).toBeCloseTo(400 / 3);
  });
});

describe('cellAt / cellCorners', () => {
  const grid = { ...createGrid({ width: 1000, height: 1000 }, 'cols-2'), x: 0, y: 0, width: 200, height: 100, gap: 10 } as GridElement;

  it('หาช่องใต้จุด · ร่องระยะห่าง = ไม่โดนช่อง', () => {
    expect(cellAt(grid, { x: 20, y: 50 })).toBe(0);
    expect(cellAt(grid, { x: 180, y: 50 })).toBe(1);
    expect(cellAt(grid, { x: 100, y: 50 })).toBe(-1);
    expect(cellAt(grid, { x: 300, y: 50 })).toBe(-1);
  });

  it('กริดหมุน 180°: ช่องซ้ายย้ายไปอยู่ขวา', () => {
    const turned = { ...grid, rotation: 180 };

    expect(cellAt(turned, { x: 180, y: 50 })).toBe(0);
    expect(cellCorners(turned, 0)[0].x).toBeCloseTo(200);
  });
});

describe('รูปทรงของกรอบ', () => {
  it('ทุกรูปทรงได้ path ที่ใช้ได้ (ไม่มี NaN) และพื้นที่รูปอยู่ในกล่อง', () => {
    const box = { x: 5, y: 5, width: 300, height: 200 };

    for (const { key } of FRAME_SHAPES) {
      const area = frameArea(key, box);
      const d = frameMaskPath(key, area);
      const decor = frameDecor(key, box);

      expect(d).toMatch(/^M[\d.-]/);
      expect(d.endsWith('Z')).toBe(true);
      expect(d).not.toContain('NaN');
      expect([...decor.back, ...decor.front].every((l) => !l.d.includes('NaN'))).toBe(true);
      expect(area.x).toBeGreaterThanOrEqual(box.x);
      expect(area.x + area.width).toBeLessThanOrEqual(box.x + box.width + 1e-9);
      expect(area.y + area.height).toBeLessThanOrEqual(box.y + box.height + 1e-9);
    }
  });

  it('createFrame ใช้สัดส่วนของรูปทรง และเริ่มว่าง', () => {
    const phone = createFrame({ width: 1000, height: 1000 }, 'phone');

    expect(phone).toMatchObject({ type: 'frame', shape: 'phone', image: null });
    expect(phone.width / phone.height).toBeCloseTo(0.5, 1);
  });
});

describe('normalizeDocument กับกรอบและกริด', () => {
  it('เติมค่าที่ขาด · รูปทรงที่ไม่รู้จัก = สี่เหลี่ยม · รูปที่ไม่มี src = ช่องว่าง · จำกัดซูม/offset', () => {
    const doc = normalizeDocument({
      version: 1,
      pages: [
        {
          id: 'p1',
          background: null,
          elements: [
            { id: 'f1', type: 'frame', shape: 'hexagram', x: 0, y: 0, width: 100, height: 100, image: { src: '/a.png', zoom: 9, offsetX: -1 } },
            { id: 'f2', type: 'frame', shape: 'heart', x: 0, y: 0, width: 100, height: 100, image: { zoom: 2 } },
          ],
        },
      ],
    });
    const [f1, f2] = doc.pages[0].elements;

    expect(f1).toMatchObject({ type: 'frame', shape: 'square', rotation: 0, opacity: 1, locked: false });
    expect(f1.type === 'frame' && f1.image).toMatchObject({ src: '/a.png', assetId: null, zoom: 5, offsetX: 0, offsetY: 0.5, naturalWidth: 1000 });
    expect(f2.type === 'frame' && f2.image).toBeNull();
  });

  it('กริด: ช่องเท่าจำนวนของเค้าโครงเสมอ (เติม null / ตัดส่วนเกิน) · เค้าโครงที่ไม่รู้จัก = 2×2', () => {
    const doc = normalizeDocument({
      version: 1,
      pages: [
        {
          id: 'p1',
          background: null,
          elements: [
            { id: 'g1', type: 'grid', layout: 'cols-3', x: 0, y: 0, width: 300, height: 100, cells: [image('/a.png')] },
            { id: 'g2', type: 'grid', layout: 'mosaic-9', x: 0, y: 0, width: 300, height: 100, gap: -4, cells: [null, null, null, null, null, image('/b.png')] },
          ],
        },
      ],
    });
    const [g1, g2] = doc.pages[0].elements as GridElement[];

    expect(g1.cells).toHaveLength(3);
    expect(g1.cells[0]?.src).toBe('/a.png');
    expect(g1.cells[1]).toBeNull();
    expect(g1).toMatchObject({ gap: 0, cornerRadius: 0 });
    expect(g2.layout).toBe('grid-2x2');
    expect(g2.cells).toEqual([null, null, null, null]);
    expect(g2.gap).toBe(0);
  });

  it('เปลี่ยนเค้าโครงแล้วรูปเดิมเลื่อนไปตามลำดับช่อง', () => {
    const cells = [image('/a.png'), null, image('/b.png'), image('/c.png')];

    expect(relayoutCells(cells, 'cols-2').map((c) => c?.src ?? null)).toEqual(['/a.png', '/b.png']);
    expect(relayoutCells(cells, 'collage-6').map((c) => c?.src ?? null)).toEqual(['/a.png', '/b.png', '/c.png', null, null, null]);
  });
});
