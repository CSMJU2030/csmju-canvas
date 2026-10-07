/// ตัวถอดรหัส GIF แบบเคลื่อนไหว (GIF87a/GIF89a) เขียนเอง — ไม่ใช้ไลบรารีภายนอก
///
/// ได้ทุกเฟรมเป็นภาพเต็มขนาด (ประกอบตามวิธีทิ้งเฟรม 0–3 แล้ว) พร้อมเวลาแสดงของแต่ละเฟรม
/// ใช้เล่น GIF บนผืนผ้าใบ พรีเซนต์ และตอนส่งออกวิดีโอ/GIF (ตัวเข้ารหัสอยู่ที่ gif.ts)

export interface DecodedGif {
  width: number;
  height: number;
  frames: { data: Uint8ClampedArray; delay: number }[];
  /// 0 = วนไม่สิ้นสุด
  loopCount: number;
}

/// เบราว์เซอร์ทั่วไปแสดงเฟรมที่ตั้งเวลาไว้ต่ำกว่า 20 ms เป็น 100 ms
const MIN_DELAY_MS = 20;
const FALLBACK_DELAY_MS = 100;

class Reader {
  pos = 0;

  constructor(readonly bytes: Uint8Array) {}

  byte() {
    if (this.pos >= this.bytes.length) throw new Error('ไฟล์ GIF ไม่ครบ');

    return this.bytes[this.pos++];
  }

  u16() {
    const lo = this.byte();

    return lo | (this.byte() << 8);
  }

  take(n: number) {
    if (this.pos + n > this.bytes.length) throw new Error('ไฟล์ GIF ไม่ครบ');

    const out = this.bytes.subarray(this.pos, this.pos + n);

    this.pos += n;

    return out;
  }

  /// ข้อมูลแบบ sub-block (ขนาด 1 ไบต์ + ข้อมูล … จบด้วย 0)
  subBlocks(): Uint8Array {
    const parts: Uint8Array[] = [];
    let total = 0;

    for (let size = this.byte(); size > 0; size = this.byte()) {
      const part = this.take(size);

      parts.push(part);
      total += size;
    }

    const out = new Uint8Array(total);
    let offset = 0;

    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }

    return out;
  }

  skipSubBlocks() {
    for (let size = this.byte(); size > 0; size = this.byte()) this.pos += size;
  }
}

export function isGif(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
}

function readColorTable(r: Reader, size: number): Uint8Array {
  return r.take(size * 3);
}

/// ถอด LZW ของภาพหนึ่งเฟรม ได้ index ของสีครบ `pixelCount` ตัว (ข้อมูลขาด = เติม 0)
export function lzwDecode(minCodeSize: number, data: Uint8Array, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  // ตารางรหัส: prefix + ตัวท้าย + ความยาว — สร้างสตริงย้อนจากท้ายตอนเขียน
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  const lengths = new Uint16Array(4096);
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let prev = -1;
  let written = 0;
  let bits = 0;
  let acc = 0;
  let pos = 0;

  for (let i = 0; i < clear; i++) {
    prefix[i] = -1;
    suffix[i] = i;
    lengths[i] = 1;
  }

  const firstOf = (code: number) => {
    while (prefix[code] !== -1) code = prefix[code];

    return suffix[code];
  };

  const emit = (code: number) => {
    const len = lengths[code];
    let at = written + len - 1;

    for (let c = code; c !== -1 && at >= written; c = prefix[c]) {
      if (at < pixelCount) out[at] = suffix[c];
      at--;
    }

    written += len;
  };

  while (written < pixelCount) {
    while (bits < codeSize) {
      if (pos >= data.length) return out;
      acc |= data[pos++] << bits;
      bits += 8;
    }

    const code = acc & ((1 << codeSize) - 1);

    acc >>>= codeSize;
    bits -= codeSize;

    if (code === clear) {
      codeSize = minCodeSize + 1;
      next = eoi + 1;
      prev = -1;
      continue;
    }

    if (code === eoi) break;

    if (prev === -1) {
      if (code >= clear) break;
      emit(code);
      prev = code;
      continue;
    }

    if (code < next) {
      emit(code);
      if (next < 4096) {
        prefix[next] = prev;
        suffix[next] = firstOf(code);
        lengths[next] = lengths[prev] + 1;
        next++;
      }
    } else if (code === next && next < 4096) {
      // รหัสที่ยังไม่มีในตาราง (KwKwK) = สตริงก่อนหน้า + ตัวแรกของมันเอง
      prefix[next] = prev;
      suffix[next] = firstOf(prev);
      lengths[next] = lengths[prev] + 1;
      next++;
      emit(code);
    } else {
      break;
    }

    prev = code;

    if (next === 1 << codeSize && codeSize < 12) codeSize++;
  }

  return out;
}

/// ลำดับแถวของภาพแบบ interlace: ทุก 8 แถวจาก 0, ทุก 8 จาก 4, ทุก 4 จาก 2, ทุก 2 จาก 1
function interlacedRows(height: number): number[] {
  const rows: number[] = [];

  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ]) {
    for (let y = start; y < height; y += step) rows.push(y);
  }

  return rows;
}

/// ถอดทั้งไฟล์ · `maxBytes` = เพดานหน่วยความจำของเฟรมทั้งหมด (เกิน = หยุดที่เฟรมก่อนหน้า ไม่ให้แท็บค้าง)
export function decodeGif(bytes: Uint8Array, maxBytes = 160 * 1024 * 1024): DecodedGif {
  if (!isGif(bytes)) throw new Error('ไม่ใช่ไฟล์ GIF');

  const r = new Reader(bytes);

  r.pos = 6;

  const width = r.u16();
  const height = r.u16();
  const packed = r.byte();

  r.byte(); // สีพื้นหลัง — เบราว์เซอร์ปัจจุบันใช้พื้นโปร่งใสแทน
  r.byte(); // อัตราส่วนพิกเซล

  if (width === 0 || height === 0) throw new Error('ขนาด GIF ไม่ถูกต้อง');

  const globalTable = packed & 0x80 ? readColorTable(r, 1 << ((packed & 0x07) + 1)) : null;
  const frameBytes = width * height * 4;
  const screen = new Uint8ClampedArray(frameBytes);
  const frames: DecodedGif['frames'] = [];
  let loopCount = 1;
  let gce = { disposal: 0, delay: 0, transparent: -1 };

  while (r.pos < bytes.length) {
    const block = r.byte();

    if (block === 0x3b) break;

    if (block === 0x21) {
      const label = r.byte();

      if (label === 0xf9) {
        const data = r.subBlocks();

        if (data.length >= 4) {
          gce = { disposal: (data[0] >> 2) & 0x07, delay: (data[1] | (data[2] << 8)) * 10, transparent: data[0] & 0x01 ? data[3] : -1 };
        }
      } else if (label === 0xff) {
        const data = r.subBlocks();
        const id = String.fromCharCode(...data.subarray(0, 11));

        // NETSCAPE2.0 / ANIMEXTS1.0: ไบต์ 12–13 คือจำนวนรอบ (0 = ไม่สิ้นสุด)
        if ((id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0') && data.length >= 14 && data[11] === 1) loopCount = data[12] | (data[13] << 8);
      } else {
        r.skipSubBlocks();
      }

      continue;
    }

    if (block !== 0x2c) break; // ไบต์แปลก — ใช้เฟรมที่ถอดได้แล้ว

    const left = r.u16();
    const top = r.u16();
    const w = r.u16();
    const h = r.u16();
    const flags = r.byte();
    const table = flags & 0x80 ? readColorTable(r, 1 << ((flags & 0x07) + 1)) : globalTable;
    const minCode = r.byte();
    const indices = lzwDecode(minCode, r.subBlocks(), w * h);

    if (!table || minCode < 1 || minCode > 11) {
      gce = { disposal: 0, delay: 0, transparent: -1 };
      continue;
    }

    if ((frames.length + 1) * frameBytes > maxBytes) break;

    // วิธีทิ้ง 3 = คืนภาพก่อนวาดเฟรมนี้หลังแสดงเสร็จ
    const restore = gce.disposal === 3 ? screen.slice() : null;
    const rows = flags & 0x40 ? interlacedRows(h) : null;

    for (let row = 0; row < h; row++) {
      const y = top + (rows ? rows[row] : row);

      if (y >= height) continue;

      for (let x = 0; x < w; x++) {
        const sx = left + x;

        if (sx >= width) continue;

        const index = indices[row * w + x];

        if (index === gce.transparent || index * 3 + 2 >= table.length) continue;

        const o = (y * width + sx) * 4;

        screen[o] = table[index * 3];
        screen[o + 1] = table[index * 3 + 1];
        screen[o + 2] = table[index * 3 + 2];
        screen[o + 3] = 255;
      }
    }

    frames.push({ data: screen.slice(), delay: gce.delay < MIN_DELAY_MS ? FALLBACK_DELAY_MS : gce.delay });

    if (gce.disposal === 2) {
      // คืนพื้นที่ของเฟรมนี้เป็นโปร่งใส
      for (let y = top; y < Math.min(height, top + h); y++) screen.fill(0, (y * width + left) * 4, (y * width + Math.min(width, left + w)) * 4);
    } else if (restore) {
      screen.set(restore);
    }

    gce = { disposal: 0, delay: 0, transparent: -1 };
  }

  if (frames.length === 0) throw new Error('GIF นี้ไม่มีภาพ');

  return { width, height, frames, loopCount };
}

/// index ของเฟรมที่ควรแสดง ณ เวลา `ms` (วนตามจำนวนรอบในไฟล์ · ครบรอบแล้วค้างเฟรมสุดท้าย)
export function frameIndexAt(delays: number[], loopCount: number, ms: number): number {
  const total = delays.reduce((a, b) => a + b, 0);

  if (delays.length <= 1 || total <= 0 || !Number.isFinite(ms)) return 0;
  if (loopCount > 0 && ms >= total * loopCount) return delays.length - 1;

  let t = ((ms % total) + total) % total;

  for (let i = 0; i < delays.length; i++) {
    if (t < delays[i]) return i;
    t -= delays[i];
  }

  return delays.length - 1;
}
