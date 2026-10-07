/// วิดีโอและเสียงที่ผู้ใช้อัปโหลดเอง — ตัวช่วยที่ไม่ขึ้นกับหน้าจอ (ทดสอบได้) + สร้าง element/แทร็กเสียง
///
/// ไม่มีคลังวิดีโอ/เสียงสำเร็จรูป: ทุกไฟล์มาจากแผงอัปโหลดของผู้ใช้ผ่าน `/api/v1/assets` (เก็บในระบบของคณะ)

import { newId, type AudioTrack, type VideoElement } from './types';

export type MediaKind = 'image' | 'video' | 'audio';

/// ชนิดที่หลังบ้านรับ (ตรวจซ้ำจากไบต์หัวไฟล์ที่หลังบ้าน) — ชื่อที่เบราว์เซอร์รายงานแตกต่างกันได้ จึงเผื่อชื่อเก่าไว้
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'];

const EXTENSIONS: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image',
  mp4: 'video', m4v: 'video', webm: 'video',
  mp3: 'audio', m4a: 'audio', ogg: 'audio', oga: 'audio', wav: 'audio',
};

/// ไฟล์ละไม่เกิน 10 MB ทุกชนิด (ตรงกับหลังบ้าน · ไฟล์เก็บในฐานข้อมูลของระบบตาม standards deployment.md ข้อ 4.3)
export const MAX_BYTES: Record<MediaKind, number> = { image: 10 * 1024 * 1024, video: 10 * 1024 * 1024, audio: 10 * 1024 * 1024 };

export const ACCEPT: Record<MediaKind, string> = {
  image: IMAGE_TYPES.join(','),
  video: [...VIDEO_TYPES, '.mp4', '.webm'].join(','),
  audio: [...AUDIO_TYPES, '.mp3', '.m4a', '.ogg', '.wav'].join(','),
};

/// ชนิดของ asset จาก mimeType ที่หลังบ้านตอบ
export function mediaKindOf(mime: string): MediaKind | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  return null;
}

/// ชนิดของไฟล์ที่ผู้ใช้เลือก (ก่อนอัปโหลด) · null = ไม่รองรับ — ไฟล์ที่เบราว์เซอร์ไม่บอกชนิดดูจากนามสกุล
export function uploadKindOf(file: { type: string; name: string }): MediaKind | null {
  if (IMAGE_TYPES.includes(file.type)) return 'image';
  if (VIDEO_TYPES.includes(file.type)) return 'video';
  if (AUDIO_TYPES.includes(file.type)) return 'audio';
  if (file.type && !/^(application\/octet-stream|video\/x-m4v)$/.test(file.type)) return null;

  return EXTENSIONS[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/// ข้อความเหตุผลถ้าไฟล์อัปโหลดไม่ได้ · null = อัปโหลดได้
export function uploadProblem(file: { type: string; name: string; size: number }, allowed: MediaKind[]): string | null {
  const kind = uploadKindOf(file);

  if (!kind || !allowed.includes(kind)) {
    const names = allowed.map((k) => (k === 'image' ? 'รูป PNG, JPEG, WebP, GIF, SVG' : k === 'video' ? 'วิดีโอ MP4, WebM' : 'เสียง MP3, M4A, OGG, WAV'));

    return `“${file.name}” ไม่ใช่ไฟล์ที่รองรับ (${names.join(' · ')})`;
  }

  if (file.size > MAX_BYTES[kind]) return `“${file.name}” ใหญ่เกิน ${MAX_BYTES[kind] / 1024 / 1024} MB`;

  return null;
}

/// ช่วงที่เล่นจริงของคลิป (วินาทีของไฟล์) — จำกัดให้อยู่ในความยาวไฟล์และยาวอย่างน้อย 0.1 วินาที
export function trimRange(el: Pick<VideoElement, 'duration' | 'trimStart' | 'trimEnd'>): { start: number; end: number } {
  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;

  if (duration === 0) return { start: Math.max(0, el.trimStart || 0), end: Number.POSITIVE_INFINITY };

  const start = Math.min(Math.max(0, el.trimStart || 0), Math.max(0, duration - 0.1));
  const rawEnd = el.trimEnd ?? duration;
  const end = Math.min(duration, Math.max(start + 0.1, rawEnd));

  return { start, end };
}

/// เวลาในไฟล์ที่ควรแสดง ณ `elapsed` วินาทีหลังเริ่มเล่น · คลิปที่ไม่วนค้างที่เฟรมสุดท้าย
export function videoTimeAt(el: Pick<VideoElement, 'duration' | 'trimStart' | 'trimEnd' | 'loop'>, elapsed: number): number {
  const { start, end } = trimRange(el);
  const length = end - start;
  const t = Math.max(0, elapsed);

  if (!Number.isFinite(length)) return start + t;
  if (el.loop) return start + (t % length);

  return Math.min(end, start + t);
}

/// 75 → "1:15" · 3725 → "1:02:05"
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
}

/// อ่านความยาวและขนาดภาพของไฟล์ (โหลดแค่ส่วนหัว) · ไฟล์ที่เบราว์เซอร์เปิดไม่ได้ → reject
export function probeMedia(src: string, kind: 'video' | 'audio'): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(kind);
    const cleanup = () => {
      media.removeAttribute('src');
      media.load();
    };

    media.preload = 'metadata';
    media.muted = true;
    media.onloadedmetadata = () => {
      const info = {
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        width: kind === 'video' ? (media as HTMLVideoElement).videoWidth : 0,
        height: kind === 'video' ? (media as HTMLVideoElement).videoHeight : 0,
      };

      cleanup();
      resolve(info);
    };
    media.onerror = () => {
      cleanup();
      reject(new Error(kind === 'video' ? 'เบราว์เซอร์นี้เปิดวิดีโอนี้ไม่ได้' : 'เบราว์เซอร์นี้เปิดไฟล์เสียงนี้ไม่ได้'));
    };
    media.src = src;
  });
}

/// วิดีโอขนาดพอดีหน้า (ไม่เกิน 60% ของด้านสั้น) คงสัดส่วนเดิม วางกลางหน้า
export function createVideo(
  page: { width: number; height: number },
  source: { src: string; assetId: string | null; name: string } & MediaInfo,
): VideoElement {
  const naturalWidth = source.width || 1280;
  const naturalHeight = source.height || 720;
  const max = Math.min(page.width, page.height) * 0.6;
  const ratio = naturalWidth / naturalHeight;
  const width = Math.round(ratio >= 1 ? max : max * ratio);
  const height = Math.round(ratio >= 1 ? max / ratio : max);

  return {
    id: newId(),
    type: 'video',
    name: source.name,
    x: Math.round((page.width - width) / 2),
    y: Math.round((page.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    assetId: source.assetId,
    src: source.src,
    duration: source.duration,
    naturalWidth,
    naturalHeight,
    cornerRadius: 0,
    muted: false,
    loop: false,
    trimStart: 0,
    trimEnd: null,
  };
}

export function createAudioTrack(source: { src: string; assetId: string | null; name: string; duration: number }): AudioTrack {
  return { id: newId('audio'), assetId: source.assetId, src: source.src, name: source.name, duration: source.duration, volume: 1, loop: false };
}

/// ส่วนของภาพต้นฉบับที่ครอปแบบ cover ให้เต็มกล่อง (ไม่บิดภาพ)
export function coverRect(source: { width: number; height: number }, box: { width: number; height: number }): { sx: number; sy: number; sw: number; sh: number } {
  if (source.width <= 0 || source.height <= 0 || box.width <= 0 || box.height <= 0) return { sx: 0, sy: 0, sw: source.width, sh: source.height };

  const scale = Math.max(box.width / source.width, box.height / source.height);
  const sw = box.width / scale;
  const sh = box.height / scale;

  return { sx: (source.width - sw) / 2, sy: (source.height - sh) / 2, sw, sh };
}
