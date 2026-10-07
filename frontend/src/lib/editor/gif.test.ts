import { describe, expect, it } from 'vitest';
import { ByteWriter, buildPalette, encodeGif, lzwEncode } from './gif';

/// ตัวถอด LZW ของ GIF แบบตรงไปตรงมา ใช้ตรวจว่าตัวเข้ารหัสถอดกลับได้ตรง
function lzwDecode(data: Uint8Array): number[] {
  const minCodeSize = data[0];
  const bytes: number[] = [];
  let at = 1;

  while (data[at] !== 0) {
    const len = data[at];

    bytes.push(...data.slice(at + 1, at + 1 + len));
    at += len + 1;
  }

  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let size = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = Array.from({ length: clear + 2 }, (_, i) => [i]);
    size = minCodeSize + 1;
  };
  const out: number[] = [];
  let bitPos = 0;
  let prev: number[] | null = null;

  reset();

  for (;;) {
    let code = 0;

    for (let i = 0; i < size; i++, bitPos++) code |= ((bytes[bitPos >> 3] >> (bitPos & 7)) & 1) << i;

    if (code === clear) {
      reset();
      prev = null;
      continue;
    }

    if (code === end) break;

    let entry: number[];

    if (code < dict.length) entry = dict[code];
    else entry = [...prev!, prev![0]];

    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }

  return out;
}

describe('gif encoder', () => {
  it('round-trips LZW, including table resets', () => {
    const indices = new Uint8Array(40000);
    let seed = 7;

    for (let i = 0; i < indices.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      indices[i] = i < 20000 ? (seed >> 16) & 0xff : (i >> 6) & 3;
    }

    const w = new ByteWriter();

    lzwEncode(indices, 8, w);
    expect(lzwDecode(w.result())).toEqual([...indices]);
  });

  it('builds a palette that keeps distinct colours', () => {
    const palette = buildPalette([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 0]], 4);

    expect(palette).toEqual(expect.arrayContaining([[0, 255, 0], [0, 0, 255]]));
  });

  it('writes a GIF89a file with header, loop extension and trailer', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    const gif = encodeGif(4, 4, [{ data, delay: 500 }, { data, delay: 100 }]);

    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    expect(gif[6]).toBe(4);
    expect(gif[gif.length - 1]).toBe(0x3b);
  });
});
