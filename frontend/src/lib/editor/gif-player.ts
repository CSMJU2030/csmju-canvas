/// เล่น GIF เคลื่อนไหวบนผืนผ้าใบ — โหลดไฟล์ครั้งเดียว ถอดทุกเฟรมเป็น canvas (gif-decode.ts) แล้วเลือกเฟรมตามเวลา
///
/// เวลาที่ใช้เลือกเฟรม: ปกติคือนาฬิกาจริงของหน้าเว็บ · ตอนส่งออกวิดีโอ/GIF ตั้งเวลาเองด้วย `withGifClock`
/// เพื่อให้เฟรมตรงกับเวลาของไฟล์ที่กำลังสร้าง

import { decodeGif, frameIndexAt } from './gif-decode';

export interface GifAnimation {
  width: number;
  height: number;
  frames: HTMLCanvasElement[];
  delays: number[];
  loopCount: number;
  /// เวลาของเฟรมที่สั้นที่สุด — ผืนที่แสดงต้องวาดใหม่อย่างน้อยถี่เท่านี้
  minDelay: number;
}

type Entry = GifAnimation | 'loading' | 'static';

const players = new Map<string, Entry>();
const listeners = new Set<() => void>();
let clock: number | null = null;

export function onGifReady(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/// รูปนี้น่าจะเป็น GIF (จากชนิดไฟล์ตอนนำเข้า หรือ data URL/นามสกุล)
export function maybeGif(src: string, flagged?: boolean): boolean {
  return Boolean(flagged) || src.startsWith('data:image/gif') || /\.gif(?:[?#]|$)/i.test(src);
}

/// GIF ที่ถอดแล้ว (มีมากกว่าหนึ่งเฟรม) · ยังโหลดอยู่หรือเป็นภาพนิ่ง = null (ใช้ภาพจาก <img> ตามปกติ)
export function gifAnimation(src: string): GifAnimation | null {
  const entry = players.get(src);

  if (entry) return typeof entry === 'string' ? null : entry;
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return null;

  players.set(src, 'loading');
  void load(src);

  return null;
}

async function load(src: string) {
  try {
    const response = await fetch(src, { credentials: 'same-origin' });

    if (!response.ok) throw new Error(String(response.status));

    const gif = decodeGif(new Uint8Array(await response.arrayBuffer()));

    if (gif.frames.length < 2) {
      players.set(src, 'static');
      return;
    }

    const frames = gif.frames.map((frame) => {
      const canvas = document.createElement('canvas');

      canvas.width = gif.width;
      canvas.height = gif.height;
      canvas.getContext('2d')!.putImageData(new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, gif.width, gif.height), 0, 0);

      return canvas;
    });
    const delays = gif.frames.map((f) => f.delay);

    players.set(src, { width: gif.width, height: gif.height, frames, delays, loopCount: gif.loopCount, minDelay: Math.min(...delays) });
    for (const listener of listeners) listener();
  } catch {
    // อ่านไม่ได้ (ไม่ใช่ GIF จริง ข้ามโดเมน ฯลฯ) — แสดงเป็นภาพนิ่ง
    players.set(src, 'static');
  }
}

/// รอจน GIF ในรายการถอดเสร็จ (ก่อนส่งออก)
export async function preloadGifs(srcs: string[]): Promise<void> {
  for (const src of srcs) gifAnimation(src);

  for (let i = 0; i < 200 && srcs.some((src) => players.get(src) === 'loading'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export function gifFrame(anim: GifAnimation, at = clock ?? (typeof performance === 'undefined' ? 0 : performance.now())): HTMLCanvasElement {
  return anim.frames[frameIndexAt(anim.delays, anim.loopCount, at)];
}

/// วาดด้วยเวลาที่กำหนด (ส่งออก/หยุด GIF) แล้วคืนนาฬิกาเดิม
export function withGifClock<T>(at: number | null, draw: () => T): T {
  const before = clock;

  clock = at;

  try {
    return draw();
  } finally {
    clock = before;
  }
}

/// เวลาเฟรมที่สั้นที่สุดของ GIF ที่ถอดแล้วในรายการ (ไม่มี = null)
export function gifRedrawDelay(srcs: Iterable<string>): number | null {
  let min: number | null = null;

  for (const src of srcs) {
    const entry = players.get(src);

    if (entry && typeof entry !== 'string') min = Math.min(min ?? Number.POSITIVE_INFINITY, entry.minDelay);
  }

  return min;
}
