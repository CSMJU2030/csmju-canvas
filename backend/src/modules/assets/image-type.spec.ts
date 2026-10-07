import { looksLikeSvg, sniffImage } from './image-type.js';

describe('sniffImage', () => {
  it('รู้จัก PNG จาก magic bytes', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
  });

  it('รู้จัก JPEG', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('รู้จัก WebP และ GIF', () => {
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))).toBe('image/webp');
    expect(sniffImage(Buffer.from('GIF89a....'))).toBe('image/gif');
  });

  it('ไม่รับ SVG (ฝังสคริปต์ได้ · deployment.md ข้อ 4.3) แต่จำได้ว่าเป็น SVG เพื่อบอกเหตุผล', () => {
    const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');

    expect(sniffImage(svg)).toBeNull();
    expect(looksLikeSvg(svg)).toBe(true);
    expect(looksLikeSvg(Buffer.from('<html><svg></svg></html>'))).toBe(false);
  });

  it('ปฏิเสธไฟล์ที่ไม่ใช่รูป แม้ตั้งชื่อเป็น .png', () => {
    expect(sniffImage(Buffer.from('MZ\x90\x00 executable'))).toBeNull();
    expect(sniffImage(Buffer.from('<html><svg></svg></html>'))).toBeNull();
  });
});
