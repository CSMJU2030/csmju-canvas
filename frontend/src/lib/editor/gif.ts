/// ตัวเข้ารหัส GIF แบบเคลื่อนไหว (GIF89a) เขียนเอง — ไม่ใช้ไลบรารีภายนอก
///
/// จานสีรวม 256 สี (median cut จากพิกเซลตัวอย่างทุกเฟรม) · บีบอัด LZW · วนซ้ำไม่สิ้นสุด

export interface GifFrame {
  /// RGBA ขนาด width × height
  data: Uint8ClampedArray;
  /// เวลาที่แสดงเฟรมนี้ (มิลลิวินาที)
  delay: number;
}

type Rgb = [number, number, number];

/// median cut: แบ่งกล่องสีที่ช่วงกว้างที่สุดไปเรื่อยๆ จนได้ `size` กล่อง แล้วใช้ค่าเฉลี่ยของแต่ละกล่อง
export function buildPalette(samples: Rgb[], size = 256): Rgb[] {
  if (samples.length === 0) return [[0, 0, 0]];

  let boxes: Rgb[][] = [samples];

  while (boxes.length < size) {
    let best = -1;
    let bestRange = 0;
    let bestChannel = 0;

    boxes.forEach((box, i) => {
      if (box.length < 2) return;

      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;

        for (const p of box) {
          if (p[c] < lo) lo = p[c];
          if (p[c] > hi) hi = p[c];
        }

        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          best = i;
          bestChannel = c;
        }
      }
    });

    if (best < 0) break;

    const box = boxes[best].slice().sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = box.length >> 1;

    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }

  return boxes.map((box) => {
    const sum = [0, 0, 0];

    for (const p of box) {
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
    }

    return sum.map((v) => Math.round(v / box.length)) as Rgb;
  });
}

function nearest(palette: Rgb[], r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;

    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }

  return best;
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private buf = new Uint8Array(65536);
  private pos = 0;

  byte(b: number) {
    if (this.pos === this.buf.length) this.flush();
    this.buf[this.pos++] = b & 0xff;
  }

  word(w: number) {
    this.byte(w);
    this.byte(w >> 8);
  }

  bytes(list: ArrayLike<number>) {
    for (let i = 0; i < list.length; i++) this.byte(list[i]);
  }

  text(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }

  private flush() {
    this.chunks.push(this.buf.slice(0, this.pos));
    this.pos = 0;
  }

  result(): Uint8Array {
    this.flush();

    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;

    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }

    return out;
  }
}

/// LZW ของ GIF (รหัสความยาวแปรผัน 9–12 บิต) แล้วแบ่งเป็นบล็อกย่อยละไม่เกิน 255 ไบต์
export function lzwEncode(indices: Uint8Array, minCodeSize: number, out: ByteWriter) {
  if (indices.length === 0) throw new Error('ไม่มีพิกเซล');

  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let dict = new Map<number, number>();
  const block: number[] = [];
  let acc = 0;
  let bits = 0;

  const emit = (code: number) => {
    acc |= code << bits;
    bits += codeSize;

    while (bits >= 8) {
      block.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;

      if (block.length === 255) {
        out.byte(255);
        out.bytes(block);
        block.length = 0;
      }
    }
  };

  out.byte(minCodeSize);
  emit(clear);

  let prefix = indices[0];

  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);

    if (found !== undefined) {
      prefix = found;
      continue;
    }

    emit(prefix);

    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = end + 1;
    }

    prefix = k;
  }

  emit(prefix);
  // ตัวถอดรหัสเพิ่มรายการหลังอ่านรหัสสุดท้าย — ขยายความยาวรหัสให้ตรงกันก่อนส่งรหัสจบ
  if (next >= 1 << codeSize && codeSize < 12) codeSize++;
  emit(end);

  if (bits > 0) block.push(acc & 0xff);

  if (block.length) {
    out.byte(block.length);
    out.bytes(block);
  }

  out.byte(0);
}

/// ภาพทุกเฟรมขนาดเท่ากัน · คืนไฟล์ GIF
export function encodeGif(width: number, height: number, frames: GifFrame[]): Uint8Array {
  // เก็บตัวอย่างพิกเซลจากทุกเฟรม (ไม่เกินราว 60,000 จุด) เพื่อสร้างจานสีรวม
  const samples: Rgb[] = [];
  const totalPixels = width * height * frames.length;
  const step = Math.max(1, Math.floor(totalPixels / 60000));

  for (const frame of frames) {
    for (let p = 0; p < width * height; p += step) samples.push([frame.data[p * 4], frame.data[p * 4 + 1], frame.data[p * 4 + 2]]);
  }

  const palette = buildPalette(samples, 256);

  while (palette.length < 256) palette.push([0, 0, 0]);

  const out = new ByteWriter();

  out.text('GIF89a');
  out.word(width);
  out.word(height);
  out.byte(0xf7); // มีจานสีรวม 256 สี
  out.byte(0);
  out.byte(0);

  for (const [r, g, b] of palette) {
    out.byte(r);
    out.byte(g);
    out.byte(b);
  }

  // วนซ้ำไม่สิ้นสุด (NETSCAPE2.0)
  out.bytes([0x21, 0xff, 0x0b]);
  out.text('NETSCAPE2.0');
  out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

  const cache = new Map<number, number>();
  const indices = new Uint8Array(width * height);

  for (const frame of frames) {
    for (let p = 0; p < indices.length; p++) {
      const r = frame.data[p * 4];
      const g = frame.data[p * 4 + 1];
      const b = frame.data[p * 4 + 2];
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let index = cache.get(key);

      if (index === undefined) {
        index = nearest(palette, r, g, b);
        cache.set(key, index);
      }

      indices[p] = index;
    }

    out.bytes([0x21, 0xf9, 0x04, 0x04]);
    out.word(Math.max(2, Math.min(65535, Math.round(frame.delay / 10))));
    out.bytes([0x00, 0x00]);
    out.byte(0x2c);
    out.word(0);
    out.word(0);
    out.word(width);
    out.word(height);
    out.byte(0);
    lzwEncode(indices, 8, out);
  }

  out.byte(0x3b);

  return out.result();
}

export { ByteWriter };
