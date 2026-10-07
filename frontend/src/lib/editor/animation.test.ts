import { describe, expect, it } from 'vitest';
import {
  ENTRY_MS, EXIT_MS, STAGGER_MS, entryLength, exitLength, finalMotion, pageLoops, pageMotion, pathFromStroke, pathPreset, pointOnPath,
  previewLength, previewMotion, settleLength, transitionLength, typewriterText,
} from './animation';
import { createShape, createText } from './factory';
import { blankPage, type CanvasElement, type Page } from './types';

const SIZE = { width: 1000, height: 600 };

function pageOf(...elements: CanvasElement[]): Page {
  return { ...blankPage(), elements };
}

describe('ลำดับเวลาของแอนิเมชัน', () => {
  it('ชิ้นที่มีแอนิเมชันเข้าเล่นต่อกันทีละชิ้น · ความเร็ว 2 เท่าใช้เวลาครึ่งเดียว', () => {
    const a = { ...createShape(SIZE, 'rect'), animation: 'fade' as const };
    const b = { ...createShape(SIZE, 'ellipse'), animation: 'rise' as const, animationSpeed: 2 };
    const still = createShape(SIZE, 'rect');
    const page = pageOf(a, still, b);
    const at = (t: number) => pageMotion(page, t);

    expect(at(0)(a)?.entry).toBe(0);
    expect(at(ENTRY_MS)(a)?.entry).toBe(1);
    expect(at(STAGGER_MS)(b)?.entry).toBe(0);
    expect(at(STAGGER_MS + ENTRY_MS / 2)(b)?.entry).toBe(1);
    expect(at(100)(still)).toBeUndefined();
    expect(entryLength(page)).toBe(ENTRY_MS);
  });

  it('แอนิเมชันเน้นเริ่มหลังเข้าจบ · แอนิเมชันออกย้อนลำดับ (บนสุดออกก่อน)', () => {
    const a = { ...createShape(SIZE, 'rect'), animation: 'fade' as const, animationLoop: 'pulse' as const, animationExit: 'fade' as const };
    const b = { ...createShape(SIZE, 'rect'), animationExit: 'sink' as const };
    const page = pageOf(a, b);

    expect(pageMotion(page, ENTRY_MS - 1)(a)?.loop).toBeUndefined();
    expect(pageMotion(page, ENTRY_MS + 300)(a)?.loop).toBe(300);
    expect(pageLoops(page)).toBe(true);

    const leaving = pageMotion(page, 5000 + STAGGER_MS, 5000);

    expect(leaving(b)?.exit).toBeCloseTo(STAGGER_MS / EXIT_MS);
    expect(leaving(a)?.exit).toBe(0);
    expect(exitLength(page)).toBe(STAGGER_MS + EXIT_MS);
    expect(finalMotion(page)(a)?.exit).toBe(1);
  });

  it('เส้นทางแบบไม่วนเดินจนถึงปลายแล้วหยุด · แบบวนเดินไป-กลับ', () => {
    const once = { ...createShape(SIZE, 'rect'), motionPath: { points: [0, 0, 100, 0], duration: 1000, loop: false } };
    const loop = { ...once, id: 'loop', motionPath: { ...once.motionPath, loop: true } };
    const page = pageOf(once, loop);

    expect(pageMotion(page, 500)(once)?.path).toBe(0.5);
    expect(pageMotion(page, 3000)(once)?.path).toBe(1);
    expect(pageMotion(page, 1500)(loop)?.path).toBeCloseTo(0.5);
    expect(settleLength(page)).toBe(1000);
  });

  it('ตัวอย่างในหน้าแก้ไขเล่นครบ เข้า → เส้นทาง → ออก แล้วจบ', () => {
    const el = { ...createShape(SIZE, 'rect'), animation: 'pop' as const, animationExit: 'fade' as const, motionPath: { points: [0, 0, 50, 0], duration: 1000, loop: false } };
    const total = previewLength([el]);

    expect(total).toBe(ENTRY_MS + 1000 + EXIT_MS + 200);
    expect(previewMotion(el, ENTRY_MS + 500)?.path).toBe(0.5);
    expect(previewMotion(el, total)?.exit).toBe(1);
  });
});

describe('เส้นทางเคลื่อนที่', () => {
  it('เส้นทางสำเร็จรูปเริ่มที่ 0,0 และเส้นตรงไปตามทิศที่กำหนด', () => {
    for (const kind of ['line', 'arc', 'circle', 'zigzag', 'wave', 'loop'] as const) {
      const pts = pathPreset(kind, 200, 0);

      expect(pts.slice(0, 2)).toEqual([0, 0]);
      expect(pts.length % 2).toBe(0);
    }

    const down = pathPreset('line', 100, 90);

    expect(down[down.length - 2]).toBeCloseTo(0);
    expect(down[down.length - 1]).toBeCloseTo(100);
  });

  it('จุดบนเส้นทางคิดตามความยาวจริง', () => {
    // ช่วงแรกยาว 100 ช่วงสองยาว 300 → ครึ่งทาง (200) อยู่ในช่วงสอง
    expect(pointOnPath([0, 0, 100, 0, 100, 300], 0.5)).toEqual([100, 100]);
    expect(pointOnPath([0, 0, 100, 0], 1)).toEqual([100, 0]);
  });

  it('เส้นที่วาดเองกลายเป็นเส้นทางเริ่มจากปลายที่อยู่ใกล้ชิ้นงาน', () => {
    const el = { x: 0, y: 0, width: 20, height: 20 };
    // วาดจากไกลเข้ามาหาชิ้นงาน → กลับทิศให้เริ่มที่ชิ้นงาน
    const pts = pathFromStroke([300, 10, 200, 10, 12, 10], el);

    expect(pts.slice(0, 2)).toEqual([0, 0]);
    expect(pts.slice(-2)).toEqual([288, 0]);
  });
});

describe('อื่น ๆ', () => {
  it('พิมพ์ดีดไม่แยกสระและวรรณยุกต์ไทยออกจากพยัญชนะ', () => {
    const text = 'ที่นี่';

    for (let p = 0; p <= 1; p += 0.1) {
      const shown = typewriterText(text, p);

      expect(text.startsWith(shown)).toBe(true);
      expect(/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(text.slice(shown.length))).toBe(false);
    }

    expect(typewriterText(text, 1)).toBe(text);
  });

  it('ความยาวการเปลี่ยนหน้าอยู่ในช่วงที่ยอมรับ', () => {
    expect(transitionLength(blankPage())).toBe(0);
    expect(transitionLength({ ...blankPage(), transition: { kind: 'fade', duration: 99999 } })).toBe(3000);
    expect(transitionLength({ ...blankPage(), transition: { kind: 'wipe', duration: 800 } })).toBe(800);
  });

  it('ข้อความที่ไม่มีแอนิเมชันไม่ถูกนับในลำดับ', () => {
    const page = pageOf(createText(SIZE, 'body'));

    expect(entryLength(page)).toBe(0);
    expect(exitLength(page)).toBe(0);
  });
});
