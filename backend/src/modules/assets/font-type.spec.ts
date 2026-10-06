import { sniffFont } from './font-type.js';
import { sniffImage } from './image-type.js';
import { sniffMedia } from './media-type.js';

/// หัว sfnt: [version:4][numTables:2][searchRange:2][entrySelector:2][rangeShift:2]
const sfnt = (version: Buffer | string, numTables = 12) => {
  const head = Buffer.alloc(12);

  (typeof version === 'string' ? Buffer.from(version, 'latin1') : version).copy(head, 0);
  head.writeUInt16BE(numTables, 4);

  return Buffer.concat([head, Buffer.alloc(32)]);
};

/// หัว WOFF/WOFF2: [signature:4][flavor:4][length:4] … · length = ขนาดไฟล์ทั้งหมด
const woff = (signature: 'wOFF' | 'wOF2', flavor: Buffer | string, size = 48, declared = size) => {
  const bytes = Buffer.alloc(size);

  bytes.write(signature, 0, 'latin1');
  (typeof flavor === 'string' ? Buffer.from(flavor, 'latin1') : flavor).copy(bytes, 4);
  bytes.writeUInt32BE(declared, 8);

  return bytes;
};

const TRUE_TYPE = Buffer.from([0x00, 0x01, 0x00, 0x00]);

describe('sniffFont', () => {
  it('รู้จัก TrueType (00 01 00 00 และ true) และ OpenType CFF (OTTO)', () => {
    expect(sniffFont(sfnt(TRUE_TYPE))).toBe('font/ttf');
    expect(sniffFont(sfnt('true'))).toBe('font/ttf');
    expect(sniffFont(sfnt('OTTO'))).toBe('font/otf');
  });

  it('รู้จัก WOFF และ WOFF2 ที่ห่อ TrueType หรือ CFF', () => {
    expect(sniffFont(woff('wOFF', TRUE_TYPE))).toBe('font/woff');
    expect(sniffFont(woff('wOF2', 'OTTO'))).toBe('font/woff2');
  });

  it('ไม่รับ WOFF ที่ flavor ผิด หรือขนาดในหัวไฟล์ไม่ตรงกับไฟล์จริง', () => {
    expect(sniffFont(woff('wOFF', 'abcd'))).toBeNull();
    expect(sniffFont(woff('wOF2', TRUE_TYPE, 48, 4096))).toBeNull();
  });

  it('ไม่รับไฟล์ที่ขึ้นต้นเหมือนฟอนต์แต่จำนวนตารางผิด · TrueType Collection · ไฟล์สั้นเกิน', () => {
    expect(sniffFont(sfnt(TRUE_TYPE, 0))).toBeNull();
    expect(sniffFont(sfnt(TRUE_TYPE, 5000))).toBeNull();
    expect(sniffFont(sfnt('ttcf'))).toBeNull();
    expect(sniffFont(Buffer.from('OTTO', 'latin1'))).toBeNull();
  });

  it('ไม่สับสนกับรูป วิดีโอ หรือเสียง และตัวตรวจอื่นก็ไม่รับฟอนต์', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'ascii'), Buffer.alloc(8)]);

    expect(sniffFont(png)).toBeNull();
    expect(sniffFont(mp4)).toBeNull();
    expect(sniffFont(Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00\x00\x00', 'binary'))).toBeNull();

    for (const font of [sfnt(TRUE_TYPE), sfnt('OTTO'), woff('wOFF', TRUE_TYPE), woff('wOF2', 'OTTO')]) {
      expect(sniffImage(font)).toBeNull();
      expect(sniffMedia(font)).toBeNull();
    }
  });
});
