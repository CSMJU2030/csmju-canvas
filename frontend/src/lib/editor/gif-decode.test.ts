import { describe, expect, it } from 'vitest';
import { encodeGif } from './gif';
import { decodeGif, frameIndexAt, isGif } from './gif-decode';

function solid(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);

  return data;
}

/// GIF 2×1 ที่เขียนมือ: เฟรมแรกแดงทั้งคู่ เฟรมสองโปร่งใสช่องซ้าย (ต้องเห็นแดงของเฟรมก่อน) + interlace ไม่มี
/// ใช้ตารางสี 2 สี (แดง ฟ้า) · LZW min code 2
function handMade(): Uint8Array {
  return new Uint8Array([
    ...[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
    2, 0, 1, 0, 0x80, 0, 0, // 2×1 · ตารางสีรวม 2 สี
    255, 0, 0, 0, 0, 255, // แดง ฟ้า
    0x21, 0xff, 11, ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)), 3, 1, 0, 0, 0, // วนไม่สิ้นสุด
    0x21, 0xf9, 4, 0x04, 5, 0, 0, 0, // ทิ้งแบบ 1 · 50 ms
    0x2c, 0, 0, 0, 0, 2, 0, 1, 0, 0, // ภาพเต็ม 2×1
    2, 2, 0x04, 0x0a, 0, // LZW (3 บิต): clear, 0, 0, eoi
    0x21, 0xf9, 4, 0x05, 1, 0, 0, 0, // โปร่งใส index 0 · 10 ms (ต่ำเกิน → 100 ms)
    0x2c, 0, 0, 0, 0, 2, 0, 1, 0, 0,
    2, 2, 0x44, 0x0a, 0, // clear, 0, 1, eoi
    0x3b,
  ]);
}

describe('ถอดรหัส GIF', () => {
  it('ไฟล์ที่ไม่ใช่ GIF ถูกปฏิเสธ', () => {
    expect(isGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(() => decodeGif(new Uint8Array([1, 2, 3]))).toThrow('ไม่ใช่ไฟล์ GIF');
  });

  it('ถอดไฟล์ที่ตัวเข้ารหัสของระบบสร้างได้ครบทุกเฟรม สีตรง เวลาตรง', () => {
    const w = 7;
    const h = 5;
    const bytes = encodeGif(w, h, [
      { data: solid(w, h, [255, 0, 0]), delay: 100 },
      { data: solid(w, h, [0, 128, 255]), delay: 300 },
    ]);
    const gif = decodeGif(bytes);

    expect([gif.width, gif.height, gif.frames.length, gif.loopCount]).toEqual([w, h, 2, 0]);
    expect(gif.frames.map((f) => f.delay)).toEqual([100, 300]);

    const [r, g, b, a] = gif.frames[1].data.subarray(0, 4);

    expect(a).toBe(255);
    expect(Math.abs(r - 0) + Math.abs(g - 128) + Math.abs(b - 255)).toBeLessThan(24);
    expect(gif.frames[0].data[0]).toBeGreaterThan(230);
  });

  it('สีโปร่งใสของเฟรมถัดไปเห็นเฟรมก่อนหน้า · เวลาต่ำกว่า 20 ms นับเป็น 100 ms', () => {
    const gif = decodeGif(handMade());

    expect(gif.frames).toHaveLength(2);
    expect(Array.from(gif.frames[0].data)).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
    // ช่องซ้ายโปร่งใส → ยังเป็นแดงของเฟรมแรก · ช่องขวาเป็นฟ้า
    expect(Array.from(gif.frames[1].data)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(gif.frames.map((f) => f.delay)).toEqual([50, 100]);
  });

  it('เพดานหน่วยความจำ: เก็บเฉพาะเฟรมที่พอ', () => {
    const bytes = encodeGif(4, 4, [0, 1, 2].map((i) => ({ data: solid(4, 4, [i * 80, 0, 0]), delay: 100 })));

    expect(decodeGif(bytes, 4 * 4 * 4 * 2).frames).toHaveLength(2);
  });

  it('เลือกเฟรมตามเวลา วนซ้ำ และค้างเฟรมสุดท้ายเมื่อครบรอบ', () => {
    expect(frameIndexAt([100, 200], 0, 50)).toBe(0);
    expect(frameIndexAt([100, 200], 0, 150)).toBe(1);
    expect(frameIndexAt([100, 200], 0, 350)).toBe(0);
    expect(frameIndexAt([100, 200], 2, 700)).toBe(1);
    expect(frameIndexAt([100], 0, 999)).toBe(0);
  });
});
