/// ส่งออกงานแบบเคลื่อนไหว: GIF (เข้ารหัสเอง) และวิดีโอ (MediaRecorder ของเบราว์เซอร์) — ทำในเครื่องผู้ใช้ทั้งหมด
///
/// ลำดับเวลาในหน้าหนึ่ง: เปลี่ยนหน้า (ถ้าตั้งไว้) → แอนิเมชันเข้า → เส้นทาง/เน้นวน → แอนิเมชันออกก่อนหมดเวลาหน้า (animation.ts)

import {
  drawTransition, exitLength, finalMotion, pageLoops, pageMotion, settleLength, transitionLength, type MotionState,
} from './animation';
import { encodeGif, type GifFrame } from './gif';
import { withGifClock } from './gif-player';
import { PagePlayback, pageHasMedia } from './playback';
import { drawPage, pageGifSources, preloadPage, type VideoFrameSource } from './render';
import { pageSizeOf, type CanvasElement, type Page } from './types';


/// เวลาแสดงหน้าเริ่มต้น (วินาที) ตรงกับปุ่ม ⏱ บนแถบเครื่องมือหน้า
export const DEFAULT_PAGE_SECONDS = 5;

export const pageSeconds = (page: Page) => page.duration ?? DEFAULT_PAGE_SECONDS;

function frameCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! };
}

/// วาดหน้าเต็มกรอบผลลัพธ์ (คงสัดส่วน อยู่กึ่งกลาง) บนพื้นขาว
function drawFitted(
  ctx: CanvasRenderingContext2D,
  page: Page,
  base: { width: number; height: number },
  motion: (el: CanvasElement) => MotionState | undefined,
  videoFrame?: VideoFrameSource,
) {
  const { width, height } = ctx.canvas;
  const size = pageSizeOf(page, base);
  const fit = Math.min(width / size.width, height / size.height);

  ctx.save();
  ctx.fillStyle = 'rgb(255 255 255)';
  ctx.fillRect(0, 0, width, height);
  ctx.translate((width - size.width * fit) / 2, (height - size.height * fit) / 2);
  ctx.scale(fit, fit);
  drawPage(ctx, page, size, { motion, videoFrame });
  ctx.restore();
}

/// วาดเฟรมของหน้า `index` ณ เวลา `elapsed` มิลลิวินาทีนับจากต้นช่วงเวลาของหน้านั้น
export function paintTimeline(
  ctx: CanvasRenderingContext2D,
  pages: Page[],
  index: number,
  base: { width: number; height: number },
  elapsed: number,
  videoFrame?: VideoFrameSource,
) {
  const page = pages[index];
  const length = pageSeconds(page) * 1000;
  const trans = index > 0 ? transitionLength(page) : 0;
  const exitAt = Math.max(trans, length - exitLength(page)) - trans;
  const t = elapsed - trans;

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // GIF ในหน้าเริ่มเฟรมแรกตอนเข้าหน้า
  withGifClock(Math.max(0, elapsed), () => {
    const next = () => drawFitted(ctx, page, base, pageMotion(page, Math.max(0, t), exitAt), videoFrame);

    if (trans > 0 && elapsed < trans && page.transition) {
      const prev = pages[index - 1];

      drawTransition(ctx, page.transition, elapsed / trans, { width: ctx.canvas.width, height: ctx.canvas.height }, () => drawFitted(ctx, prev, base, finalMotion(prev)), next);
    } else {
      next();
    }
  });
}

/// GIF: เฟรมละ 1/10 วินาทีช่วงที่มีการเคลื่อนไหว แล้วค้างภาพนิ่งยาวตามเวลาที่เหลือ
/// (หน้าที่มีแอนิเมชันวนหรือ GIF เก็บเฟรมทั้งหน้า โดยจำกัดจำนวนเฟรมรวมตามหน่วยความจำ)
export async function renderGif(pages: Page[], base: { width: number; height: number }, scale: number, onProgress?: (ratio: number) => void): Promise<Blob> {
  const first = pageSizeOf(pages[0], base);
  const width = Math.max(1, Math.round(first.width * scale));
  const height = Math.max(1, Math.round(first.height * scale));
  const { ctx } = frameCanvas(width, height);
  const frames: GifFrame[] = [];
  const STEP = 100;
  const budget = Math.max(pages.length * 2, Math.floor((200 * 1024 * 1024) / (width * height * 4)));
  const perPage = Math.max(10, Math.floor(budget / pages.length));

  for (const [i, page] of pages.entries()) {
    await preloadPage(page);

    const total = pageSeconds(page) * 1000;
    const trans = i > 0 ? transitionLength(page) : 0;
    const continuous = pageLoops(page) || pageGifSources(page).length > 0;
    // ช่วงที่ต้องเก็บหลายเฟรม: [เริ่ม, จบ) — ช่วงอื่นค้างภาพเดียว
    const spans: [number, number][] = continuous
      ? [[0, total]]
      : [
          [0, Math.min(total, trans + settleLength(page))],
          [Math.max(0, total - exitLength(page)), total],
        ];
    const moving = spans.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
    const step = Math.max(STEP, Math.ceil(moving / perPage / 10) * 10);
    let t = 0;

    for (const [from, to] of spans) {
      // ช่วงนิ่งก่อนช่วงนี้: ภาพเดียวค้างไว้
      if (from > t) {
        paintTimeline(ctx, pages, i, base, t);
        frames.push({ data: ctx.getImageData(0, 0, width, height).data, delay: from - t });
        t = from;
      }

      for (; t < to; t += step) {
        paintTimeline(ctx, pages, i, base, t);
        frames.push({ data: ctx.getImageData(0, 0, width, height).data, delay: Math.min(step, to - t) });
      }
    }

    if (t < total) {
      paintTimeline(ctx, pages, i, base, t);
      frames.push({ data: ctx.getImageData(0, 0, width, height).data, delay: total - t });
    }

    onProgress?.((i + 1) / (pages.length + 1));
    // คืนจังหวะให้หน้าเว็บวาดแถบความคืบหน้า
    await new Promise((r) => setTimeout(r, 0));
  }

  const bytes = encodeGif(width, height, frames.filter((f) => f.delay > 0));

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
        // เข้าหน้าใหม่: หยุดคลิปของหน้าก่อน แล้วเริ่มคลิปของหน้านี้จากต้นช่วงตัดต่อ
        if (index !== playing) {
          playbacks[playing]?.stop();
          playing = index;
          void playbacks[index]?.start();
        }

        paintTimeline(ctx, pages, index, base, time - start, playbacks[index]?.frame);

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
