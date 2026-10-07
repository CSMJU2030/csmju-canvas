import { describe, expect, it } from 'vitest';
import { snapRect } from './snapping';

const page = { x: 0, y: 0, width: 1000, height: 800 };

describe('snapRect', () => {
  it('ดูดกล่องเข้ากึ่งกลางหน้าเมื่ออยู่ในระยะ', () => {
    const result = snapRect({ x: 446, y: 100, width: 100, height: 50 }, [], page, 6);

    // กึ่งกลางกล่อง 496 → กึ่งกลางหน้า 500
    expect(result.dx).toBe(4);
    expect(result.guides.some((g) => g.axis === 'x' && g.at === 500)).toBe(true);
  });

  it('ไม่ดูดเมื่อไกลเกินระยะ', () => {
    const result = snapRect({ x: 300, y: 300, width: 100, height: 50 }, [], page, 6);

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([]);
  });

  it('ดูดขอบซ้ายเข้ากับขอบขวาของ element อื่น', () => {
    const other = { x: 100, y: 100, width: 200, height: 100 };
    const result = snapRect({ x: 303, y: 400, width: 50, height: 50 }, [other], page, 6);

    expect(result.dx).toBe(-3);
  });
});
