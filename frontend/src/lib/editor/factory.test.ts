import { describe, expect, it } from 'vitest';
import { createPath, createSticky, placeCentered } from './factory';

describe('createPath', () => {
  it('ทำกล่องพอดีเส้น (เผื่อครึ่งความหนา) และเก็บพิกัดเป็นสัดส่วน 0–1', () => {
    const path = createPath([[10, 20, 110, 70]], { color: 'rgb(0 0 0)', strokeWidth: 10, brush: 'pen' })!;

    expect(path).toMatchObject({ type: 'path', x: 5, y: 15, width: 110, height: 60, strokeWidth: 10 });
    expect(path.strokes[0][0]).toBeCloseTo(5 / 110);
    expect(path.strokes[0][3]).toBeCloseTo(55 / 60);
  });

  it('ไม่มีจุด = ไม่สร้าง element', () => {
    expect(createPath([], { color: 'rgb(0 0 0)', strokeWidth: 2, brush: 'pen' })).toBeNull();
  });

  it('ย่อลายเซ็นให้ไม่กว้างเกินที่กำหนด และย่อความหนาเส้นตาม', () => {
    const path = createPath([[0, 0, 400, 100]], { color: 'rgb(0 0 0)', strokeWidth: 4, brush: 'pen' })!;
    const placed = placeCentered(path, { width: 1000, height: 1000 }, 202);

    expect(placed.width).toBeCloseTo(202);
    expect(placed.strokeWidth).toBeCloseTo(2);
    expect(placed.x).toBe(399);
  });
});

describe('createSticky', () => {
  it('โน้ตแปะคือกล่องสีกับข้อความที่อยู่กลุ่มเดียวกัน', () => {
    const [note, text] = createSticky({ width: 1000, height: 1000 }, 'blue');

    expect(note.type).toBe('shape');
    expect(text.type).toBe('text');
    expect(note.groupId).toBeTruthy();
    expect(text.groupId).toBe(note.groupId);
  });
});
