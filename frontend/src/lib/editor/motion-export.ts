/// ส่งออกงานแบบเคลื่อนไหว: GIF (เข้ารหัสเอง) และวิดีโอ (MediaRecorder ของเบราว์เซอร์) — ทำในเครื่องผู้ใช้ทั้งหมด

import { encodeGif, type GifFrame } from './gif';
import { PagePlayback, pageHasMedia } from './playback';
import { drawPage, preloadPage, type VideoFrameSource } from './render';
import { pageSizeOf, type CanvasElement, type Page } from './types';

/// เวลาแสดงหน้าเริ่มต้น (วินาที) ตรงกับปุ่ม ⏱ บนแถบเครื่องมือหน้า
export const DEFAULT_PAGE_SECONDS = 5;
/// ชิ้นที่มีแอนิเมชันเล่นต่อกันทีละชิ้น (เหลื่อมกัน 0.15 วินาที ชิ้นละ 0.8 วินาที) แบบ Canva
const STAGGER_MS = 150;
const ENTRY_MS = 800;

/// ความคืบหน้าของแอนิเมชันเข้าของแต่ละชิ้น ณ เวลา `elapsed` มิลลิวินาทีหลังเข้าหน้า
export function entryProgress(page: Page, elapsed: number): (el: CanvasElement) => number | undefined {
  const animated = page.elements.filter((el) => el.animation);

  return (el) => {
    const order = animated.indexOf(el);

    return order < 0 ? undefined : Math.max(0, Math.min(1, (elapsed - order * STAGGER_MS) / ENTRY_MS));
  };
}

/// เวลาที่แอนิเมชันเข้าของหน้านี้เล่นจบ (0 = ไม่มีแอนิเมชัน)
export function entryLength(page: Page): number {
  const count = page.elements.filter((el) => el.animation).length;

  return count === 0 ? 0 : (count - 1) * STAGGER_MS + ENTRY_MS;
}

export const pageSeconds = (page: Page) => page.duration ?? DEFAULT_PAGE_SECONDS;

function frameCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! };
}

function paint(
  ctx: CanvasRenderingContext2D,
  page: Page,
  size: { width: number; height: number },
  scale: number,
  elapsed: number,
  videoFrame?: VideoFrameSource,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgb(255 255 255)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawPage(ctx, page, size, { progress: entryProgress(page, elapsed), videoFrame });
}

/// GIF: เฟรมละ 1/10 วินาทีระหว่างแอนิเมชัน แล้วค้างภาพสุดท้ายตามเวลาของหน้า
export async function renderGif(pages: Page[], base: { width: number; height: number }, scale: number, onProgress?: (ratio: number) => void): Promise<Blob> {
  const first = pageSizeOf(pages[0], base);
  const width = Math.max(1, Math.round(first.width * scale));
  const height = Math.max(1, Math.round(first.height * scale));
  const { ctx } = frameCanvas(width, height);
  const frames: GifFrame[] = [];
  const STEP = 100;

  for (const [i, page] of pages.entries()) {
    await preloadPage(page);

    const size = pageSizeOf(page, base);
    // หน้าที่ขนาดต่างจากหน้าแรกวาดย่อให้พอดีกรอบ GIF
    const fit = Math.min(width / size.width, height / size.height);
    const total = pageSeconds(page) * 1000;
    const anim = Math.min(entryLength(page), total);

    for (let t = 0; t < anim; t += STEP) {
      paint(ctx, page, size, fit, t);
      frames.push({ data: ctx.getImageData(0, 0, width, height).data, delay: STEP });
    }

    paint(ctx, page, size, fit, Number.POSITIVE_INFINITY);
    frames.push({ data: ctx.getImageData(0, 0, width, height).data, delay: Math.max(STEP, total - anim) });
    onProgress?.((i + 1) / (pages.length + 1));
    // คืนจังหวะให้หน้าเว็บวาดแถบความคืบหน้า
    await new Promise((r) => setTimeout(r, 0));
  }

  const bytes = encodeGif(width, height, frames);

  onProgress?.(1);

  return new Blob([bytes as BlobPart], { type: 'image/gif' });
}

/// ชนิดไฟล์วิดีโอที่เบราว์เซอร์นี้อัดได้ (MP4 ถ้าได้ ไม่งั้น WebM) · `withAudio` = ลองชนิดที่มีเสียงก่อน
export function videoMimeType(withAudio = false): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;

  const audioFirst = withAudio ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : [];

  for (const mime of [...audioFirst, 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }

  return null;
}

/// วิดีโอ: เล่นทุกหน้าตามเวลาจริงบนผืนผ้าใบนอกจอแล้วอัดด้วย MediaRecorder (ใช้เวลาเท่าความยาววิดีโอ)
///
/// คลิปวิดีโอในหน้าเล่นจริง (เฟรมสด) และเสียงของคลิปที่ไม่ปิดเสียง + เสียงประกอบของหน้าถูกผสมลงไฟล์
/// ผ่าน Web Audio — ถ้าเบราว์เซอร์อัดเสียงไม่ได้ ไฟล์ยังได้ภาพครบแต่ไม่มีเสียง
export async function renderVideo(
  pages: Page[],
  base: { width: number; height: number },
  height: number,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  const wantsAudio = pages.some((p) => Boolean(p.audio?.length) || p.elements.some((el) => el.type === 'video' && !el.muted && !el.hidden));
  const audioContext = wantsAudio && typeof AudioContext !== 'undefined' ? new AudioContext() : null;
  const audioOut = audioContext?.createMediaStreamDestination() ?? null;
  const type = videoMimeType(Boolean(audioOut));

  if (!type) {
    void audioContext?.close();
    throw new Error('เบราว์เซอร์นี้อัดวิดีโอไม่ได้ ลองใช้ Chrome หรือ Edge รุ่นล่าสุด');
  }

  for (const page of pages) await preloadPage(page);

  const playbacks = pages.map((p) =>
    pageHasMedia(p) ? new PagePlayback(p, audioContext && audioOut ? { audio: { context: audioContext, destination: audioOut } } : {}) : null,
  );

  await Promise.all(playbacks.map((p) => p?.ready()));
  await audioContext?.resume().catch(() => undefined);

  const first = pageSizeOf(pages[0], base);
  const scale = height / first.height;
  // ตัวเข้ารหัสวิดีโอส่วนใหญ่ต้องการด้านเป็นเลขคู่
  const width = Math.round((first.width * scale) / 2) * 2;
  const h = Math.round(height / 2) * 2;
  const { canvas, ctx } = frameCanvas(width, h);
  const stream = canvas.captureStream(30);

  if (audioOut) for (const track of audioOut.stream.getAudioTracks()) stream.addTrack(track);
  const recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: Math.round(width * h * 4) });
  const chunks: Blob[] = [];
  const total = pages.reduce((sum, p) => sum + pageSeconds(p) * 1000, 0);

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  let playing = -1;

  const frameAt = (time: number) => {
    let start = 0;

    for (const [index, page] of pages.entries()) {
      const length = pageSeconds(page) * 1000;

      if (time < start + length || page === pages[pages.length - 1]) {
        const size = pageSizeOf(page, base);

        // เข้าหน้าใหม่: หยุดคลิปของหน้าก่อน แล้วเริ่มคลิปของหน้านี้จากต้นช่วงตัดต่อ
        if (index !== playing) {
          playbacks[playing]?.stop();
          playing = index;
          void playbacks[index]?.start();
        }

        paint(ctx, page, size, Math.min(width / size.width, h / size.height), time - start, playbacks[index]?.frame);

        return;
      }

      start += length;
    }
  };

  frameAt(0);
  recorder.start(500);

  const began = performance.now();

  // ใช้ setTimeout แทน requestAnimationFrame เพื่อให้อัดต่อได้แม้สลับแท็บ
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        reject(new DOMException('ยกเลิกแล้ว', 'AbortError'));

        return;
      }

      const time = performance.now() - began;

      frameAt(Math.min(time, total));
      onProgress?.(Math.min(1, time / total));

      if (time >= total) resolve();
      else setTimeout(tick, 1000 / 30);
    };

    tick();
  }).finally(() => {
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    playbacks.forEach((p) => p?.stop());
    void audioContext?.close();
  });

  await done;

  return { blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext };
}
