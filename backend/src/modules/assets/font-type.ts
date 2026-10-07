/// ตรวจชนิดไฟล์ฟอนต์จากไบต์หัวไฟล์ (magic bytes) — ไม่เชื่อ Content-Type หรือนามสกุลที่ client ส่งมา
///
/// รับเฉพาะฟอนต์ที่เบราว์เซอร์โหลดด้วย `FontFace` ได้เอง: TTF · OTF · WOFF · WOFF2
/// (ไม่รับ TrueType Collection `ttcf` เพราะ FontFace เลือกฟอนต์ในชุดไม่ได้)
export type FontMime = 'font/ttf' | 'font/otf' | 'font/woff' | 'font/woff2';

export const FONT_EXTENSIONS: Record<FontMime, string> = {
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
};

/// ฟอนต์ที่ผู้ใช้อัปโหลดเองไม่เกิน 5 MB (ฟอนต์ไทยทั่วไป 100–700 KB)
export const MAX_FONT_BYTES = 5 * 1024 * 1024;

/// sfnt version ของ TrueType (`00 01 00 00` หรือ `true` ของ Apple) และ CFF (`OTTO`)
function sfntKind(tag: Buffer): 'font/ttf' | 'font/otf' | null {
  if (tag.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || tag.toString('latin1') === 'true') return 'font/ttf';
  if (tag.toString('latin1') === 'OTTO') return 'font/otf';

  return null;
}

export function sniffFont(bytes: Buffer): FontMime | null {
  if (bytes.length < 12) return null;

  const tag = bytes.subarray(0, 4);
  const sfnt = sfntKind(tag);

  if (sfnt) {
    // ตารางในฟอนต์จริงมี 1 ถึงไม่กี่สิบตาราง — กันไฟล์อื่นที่บังเอิญขึ้นต้นด้วย 00 01 00 00
    const numTables = bytes.readUInt16BE(4);

    return numTables >= 1 && numTables <= 100 ? sfnt : null;
  }

  const signature = tag.toString('latin1');

  if (signature === 'wOFF' || signature === 'wOF2') {
    // flavor ของฟอนต์ที่ห่ออยู่ต้องเป็น TrueType หรือ CFF · ช่อง length ต้องตรงกับขนาดไฟล์จริง
    const flavor = sfntKind(bytes.subarray(4, 8));
    const declared = bytes.readUInt32BE(8);

    if (!flavor || declared !== bytes.length) return null;

    return signature === 'wOFF' ? 'font/woff' : 'font/woff2';
  }

  return null;
}
