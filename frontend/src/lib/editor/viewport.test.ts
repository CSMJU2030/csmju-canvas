import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditor } from './store';
import {
  MAX_WHEEL_STEP,
  MAX_ZOOM,
  MIN_ZOOM,
  cancelViewportAnimation,
  clampZoom,
  easeZoomStep,
  fitRect,
  setStageSize,
  wheelPixels,
  wheelZoomFactor,
  zoomAround,
  zoomBy,
  zoomTo,
} from './viewport';

describe('คณิตของการซูม', () => {
  it('จำกัดระดับซูม และค่าที่ไม่ใช่ตัวเลขกลับเป็น 100 %', () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('แปลง deltaMode เป็นพิกเซล (บรรทัด = 16 px · หน้า = 800 px)', () => {
    expect(wheelPixels(3, 0)).toBe(3);
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2)).toBe(800);
  });

  it('ล้อเมาส์หนึ่งคลิก (100 px) ซูมไม่เกิน 12 % และทิศถูกต้อง', () => {
    const zoomIn = wheelZoomFactor(-100, 0);
    const zoomOut = wheelZoomFactor(100, 0);

    expect(zoomIn).toBeGreaterThan(1);
    expect(zoomIn).toBeLessThanOrEqual(1 + MAX_WHEEL_STEP + 1e-9);
    expect(zoomOut).toBeLessThan(1);
    expect(zoomIn * zoomOut).toBeCloseTo(1);
    // ล้อแบบบรรทัด (Firefox) ก็ไม่กระโดดเกินขีด
    expect(wheelZoomFactor(-30, 1)).toBeLessThanOrEqual(1 + MAX_WHEEL_STEP + 1e-9);
  });

  it('ถ่างนิ้วบนทัชแพด (ค่าเล็ก) ซูมทีละน้อยแต่ไม่เป็นศูนย์', () => {
    const factor = wheelZoomFactor(-2, 0);

    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(1.05);
  });

  it('ซูมรอบจุดที่เมาส์ชี้: จุดใต้เมาส์ยังเป็นตำแหน่งเดิมของงาน', () => {
    const pan = { x: 40, y: 20 };
    const anchor = { x: 300, y: 200 };
    const next = zoomAround(1, pan, 2, anchor);
    const before = { x: (anchor.x - pan.x) / 1, y: (anchor.y - pan.y) / 1 };
    const after = { x: (anchor.x - next.x) / 2, y: (anchor.y - next.y) / 2 };

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('พอดีจอ: กรอบอยู่กลางพื้นที่และเว้นขอบ', () => {
    const { zoom, pan } = fitRect({ x: 100, y: 0, width: 1000, height: 500 }, { width: 1200, height: 800 }, 100);

    expect(zoom).toBeCloseTo(1);
    expect(pan.x + 100 * zoom).toBeCloseTo(100);
    expect(pan.y).toBeCloseTo(150);
  });

  it('ไล่เข้าหาเป้าแบบเอกซ์โพเนนเชียล: เข้าใกล้ขึ้นทุกเฟรม ไม่เลยเป้า', () => {
    let z = 1;

    for (let i = 0; i < 5; i++) {
      const next = easeZoomStep(z, 2, 16);

      expect(next).toBeGreaterThan(z);
      expect(next).toBeLessThan(2);
      z = next;
    }

    expect(easeZoomStep(1, 2, 0)).toBe(1);
  });
});

describe('zoomBy / zoomTo', () => {
  afterEach(() => {
    cancelViewportAnimation();
    vi.unstubAllGlobals();
  });

  it('ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวได้ระดับซูมใหม่ทันที โดยตรึงกลางผืนผ้าใบ', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    setStageSize({ width: 800, height: 600 });
    useEditor.getState().setViewport(1, { x: 0, y: 0 });

    zoomBy(2);

    const { zoom, pan } = useEditor.getState();

    expect(zoom).toBe(2);
    expect(pan).toEqual({ x: -400, y: -300 });
  });

  it('ไม่มีการลดการเคลื่อนไหว: ไล่ระดับซูมด้วย requestAnimationFrame จนถึงเป้า', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));

    const frames: FrameRequestCallback[] = [];

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    useEditor.getState().setViewport(1, { x: 0, y: 0 });

    zoomTo(2, { x: 0, y: 0 });
    expect(useEditor.getState().zoom).toBe(1);

    let now = 0;

    for (let i = 0; i < 200 && frames.length > 0; i++) {
      now += 16;
      frames.shift()!(now);
    }

    expect(useEditor.getState().zoom).toBe(2);
    expect(useEditor.getState().pan).toEqual({ x: 0, y: 0 });
  });
});
