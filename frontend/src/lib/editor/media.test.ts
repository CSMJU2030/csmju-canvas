import { describe, expect, it } from 'vitest';
import { coverRect, createAudioTrack, createVideo, formatDuration, mediaKindOf, trimRange, uploadKindOf, uploadProblem, videoTimeAt } from './media';
import { normalizeDocument } from './types';

describe('ชนิดไฟล์', () => {
  it('แยกชนิดจาก mimeType ของหลังบ้าน', () => {
    expect(mediaKindOf('image/png')).toBe('image');
    expect(mediaKindOf('video/webm')).toBe('video');
    expect(mediaKindOf('audio/mpeg')).toBe('audio');
    expect(mediaKindOf('application/pdf')).toBeNull();
  });

  it('ไฟล์ที่เบราว์เซอร์ไม่บอกชนิดดูจากนามสกุล', () => {
    expect(uploadKindOf({ type: 'audio/x-m4a', name: 'a.m4a' })).toBe('audio');
    expect(uploadKindOf({ type: '', name: 'clip.MP4' })).toBe('video');
    expect(uploadKindOf({ type: 'video/quicktime', name: 'clip.mov' })).toBeNull();
    expect(uploadKindOf({ type: '', name: 'notes.txt' })).toBeNull();
  });

  it('บอกเหตุผลเมื่อชนิดไม่ตรงหรือใหญ่เกิน', () => {
    expect(uploadProblem({ type: 'video/mp4', name: 'a.mp4', size: 1000 }, ['video'])).toBeNull();
    expect(uploadProblem({ type: 'video/mp4', name: 'a.mp4', size: 1000 }, ['audio'])).toContain('ไม่ใช่ไฟล์ที่รองรับ');
    expect(uploadProblem({ type: 'image/png', name: 'a.png', size: 11 * 1024 * 1024 }, ['image'])).toContain('10 MB');
    expect(uploadProblem({ type: 'audio/mpeg', name: 'a.mp3', size: 9 * 1024 * 1024 }, ['audio'])).toBeNull();
    expect(uploadProblem({ type: 'audio/mpeg', name: 'a.mp3', size: 11 * 1024 * 1024 }, ['audio'])).toContain('10 MB');
  });
});

describe('ช่วงตัดต่อ', () => {
  const clip = { duration: 10, trimStart: 0, trimEnd: null as number | null, loop: false };

  it('ไม่ตัด = ทั้งคลิป', () => {
    expect(trimRange(clip)).toEqual({ start: 0, end: 10 });
  });

  it('จำกัดให้อยู่ในความยาวไฟล์และยาวอย่างน้อย 0.1 วินาที', () => {
    expect(trimRange({ ...clip, trimStart: 4, trimEnd: 2 })).toEqual({ start: 4, end: 4.1 });
    expect(trimRange({ ...clip, trimStart: 20, trimEnd: null })).toEqual({ start: 9.9, end: 10 });
    expect(trimRange({ ...clip, trimStart: -3, trimEnd: 50 })).toEqual({ start: 0, end: 10 });
  });

  it('ไม่รู้ความยาว = เล่นไปเรื่อย ๆ', () => {
    expect(trimRange({ duration: 0, trimStart: 2, trimEnd: null }).end).toBe(Number.POSITIVE_INFINITY);
  });

  it('เวลาในไฟล์: ไม่วน = ค้างท้าย · วน = กลับต้นช่วง', () => {
    const trimmed = { ...clip, trimStart: 2, trimEnd: 5 };

    expect(videoTimeAt(trimmed, 1)).toBe(3);
    expect(videoTimeAt(trimmed, 10)).toBe(5);
    expect(videoTimeAt({ ...trimmed, loop: true }, 4)).toBeCloseTo(3);
    expect(videoTimeAt(trimmed, -1)).toBe(2);
  });
});

describe('ตัวช่วยอื่น', () => {
  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75.4)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });

  it('coverRect ครอปกลางภาพให้เต็มกล่องโดยไม่บิด', () => {
    expect(coverRect({ width: 1920, height: 1080 }, { width: 100, height: 100 })).toEqual({ sx: 420, sy: 0, sw: 1080, sh: 1080 });
    expect(coverRect({ width: 1000, height: 1000 }, { width: 200, height: 100 })).toEqual({ sx: 0, sy: 250, sw: 1000, sh: 500 });
  });

  it('createVideo คงสัดส่วนและวางกลางหน้า', () => {
    const el = createVideo({ width: 1000, height: 1000 }, { src: '/api/v1/assets/x/content', assetId: 'x', name: 'clip.mp4', duration: 12, width: 1920, height: 1080 });

    expect(el.type).toBe('video');
    expect(el.width).toBe(600);
    expect(el.height).toBe(338);
    expect(el.x).toBe(200);
    expect(el).toMatchObject({ muted: false, loop: false, trimStart: 0, trimEnd: null, duration: 12 });
  });

  it('normalizeDocument เก็บวิดีโอและเติมค่าเสียงประกอบที่ขาด', () => {
    const video = createVideo({ width: 100, height: 100 }, { src: 's', assetId: null, name: 'v', duration: 1, width: 16, height: 9 });
    const track = createAudioTrack({ src: '/a', assetId: null, name: 'เพลง', duration: 30 });
    const doc = normalizeDocument({
      pages: [{ id: 'p', background: null, elements: [video], audio: [track, { src: '/b', volume: 7 }, { name: 'ไม่มีไฟล์' }] }],
    });

    expect(doc.pages[0].elements[0].type).toBe('video');
    expect(doc.pages[0].audio).toHaveLength(2);
    expect(doc.pages[0].audio![1]).toMatchObject({ src: '/b', volume: 1, loop: false, name: '' });
  });
});
