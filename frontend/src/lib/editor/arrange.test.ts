import { describe, expect, it } from 'vitest';
import { centerOffset, cleanSpaces, textStats, tidyUp } from './arrange';

describe('จัดวางอัตโนมัติ', () => {
  it('จัดให้เป็นระเบียบเป็นตาราง 2×2 จากมุมซ้ายบนเดิม ช่องห่างเท่ากัน', () => {
    const boxes = [
      { id: 'a', x: 100, y: 100, width: 100, height: 100 },
      { id: 'b', x: 400, y: 120, width: 100, height: 100 },
      { id: 'c', x: 130, y: 500, width: 100, height: 100 },
      { id: 'd', x: 390, y: 480, width: 100, height: 100 },
    ];
    const out = tidyUp(boxes);

    expect(out.get('a')).toEqual({ x: 100, y: 100 });
    expect(out.get('b')).toEqual({ x: 210, y: 100 });
    expect(out.get('c')).toEqual({ x: 100, y: 210 });
    expect(out.get('d')).toEqual({ x: 210, y: 210 });
    expect(tidyUp([boxes[0]]).size).toBe(0);
  });

  it('จัดกึ่งกลางหน้าจากกรอบรวม', () => {
    expect(centerOffset([{ id: 'a', x: 0, y: 0, width: 100, height: 50 }], { width: 300, height: 150 })).toEqual({ dx: 100, dy: 50 });
  });

  it('นับคำภาษาไทยและอังกฤษ · ลบช่องว่างซ้ำ', () => {
    const stats = textStats(['สวัสดีครับ hello world']);

    expect(stats.words).toBeGreaterThanOrEqual(3);
    expect(stats.chars).toBeGreaterThan(stats.charsNoSpace);
    expect(cleanSpaces('  a   b \n\n\n\n c  ')).toBe('a b\n\nc');
  });
});
