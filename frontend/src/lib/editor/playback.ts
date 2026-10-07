/// เล่นวิดีโอและเสียงของหนึ่งหน้า — ใช้ตอนพรีเซนต์ (presenter.tsx) และตอนส่งออกวิดีโอ (motion-export.ts)
///
/// สร้างตัวเล่นที่มองไม่เห็นหนึ่งตัวต่อวิดีโอ/แทร็กเสียง แล้วให้ตัววาดดึงเฟรมสดไปวาดลงผืนผ้าใบ
/// (จึงหมุน ขอบมน ความโปร่งใส และแอนิเมชันได้เหมือนชิ้นงานอื่น) · ไฟล์มาจาก `/api/v1/assets` ของระบบเท่านั้น

import { trimRange } from './media';
import type { AudioTrack, Page, VideoElement } from './types';

interface VideoSlot {
  el: VideoElement;
  media: HTMLVideoElement;
  start: number;
  end: number;
  ended: boolean;
}

interface AudioSlot {
  track: AudioTrack;
  media: HTMLAudioElement;
}

export interface PlaybackOptions {
  /// ต่อเสียงเข้ากราฟเสียงนี้แทนลำโพง (ส่งออกวิดีโอพร้อมเสียง)
  audio?: { context: AudioContext; destination: AudioNode };
  /// เอกสารที่จะสร้างตัวเล่น (หน้าต่างผู้พรีเซนต์)
  ownerDocument?: Document;
}

export class PagePlayback {
  private readonly videos: VideoSlot[];
  private readonly tracks: AudioSlot[];
  private stopped = false;

  constructor(page: Pick<Page, 'elements' | 'audio'>, options: PlaybackOptions = {}) {
    const doc = options.ownerDocument ?? document;

    this.videos = page.elements
      .filter((el): el is VideoElement => el.type === 'video' && !el.hidden)
      .map((el) => {
        const media = doc.createElement('video');
        const { start, end } = trimRange(el);

        media.preload = 'auto';
        media.playsInline = true;
        media.muted = el.muted;
        media.src = el.src;
        media.currentTime = start;

        return { el, media, start, end, ended: false };
      });

    this.tracks = (page.audio ?? []).map((track) => {
      const media = doc.createElement('audio');

      media.preload = 'auto';
      media.loop = track.loop;
      media.volume = Math.min(1, Math.max(0, track.volume));
      media.src = track.src;

      return { track, media };
    });

    if (options.audio) {
      const { context, destination } = options.audio;

      for (const slot of [...this.videos.filter((v) => !v.el.muted), ...this.tracks]) {
        try {
          const source = context.createMediaElementSource(slot.media);
          const gain = context.createGain();

          // คุมความดังที่ gain ที่เดียว (เบราว์เซอร์แต่ละตัวคิด volume ของตัวเล่นต่างกันเมื่อต่อกราฟเสียง)
          gain.gain.value = 'track' in slot ? Math.min(1, Math.max(0, slot.track.volume)) : 1;
          slot.media.volume = 1;
          source.connect(gain).connect(destination);
        } catch {
          // เบราว์เซอร์ไม่ยอมต่อกราฟเสียง — คลิปยังเล่นได้แต่ไม่มีเสียงในไฟล์
        }
      }
    }
  }

  get hasMedia(): boolean {
    return this.videos.length + this.tracks.length > 0;
  }

  /// มีวิดีโอที่ยังเล่นอยู่ (ผืนผ้าใบต้องวาดใหม่ทุกเฟรม)
  get animating(): boolean {
    return this.videos.some((v) => !v.ended);
  }

  /// รอจนทุกคลิปพร้อมแสดงเฟรมแรก (ส่งออกวิดีโอ) — ไฟล์ที่เปิดไม่ได้ข้ามไป
  async ready(): Promise<void> {
    await Promise.all(
      [...this.videos.map((v) => v.media), ...this.tracks.map((t) => t.media)].map(
        (media) =>
          new Promise<void>((resolve) => {
            if (media.readyState >= 2) return resolve();
            media.addEventListener('canplay', () => resolve(), { once: true });
            media.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    );
  }

  /// เริ่มเล่นจากต้นช่วงตัดต่อ · เบราว์เซอร์ที่บล็อกเสียงอัตโนมัติ → ลองเล่นแบบปิดเสียงแทน (เฉพาะวิดีโอ)
  async start(): Promise<void> {
    this.stopped = false;

    await Promise.all([
      ...this.videos.map(async (slot) => {
        slot.ended = false;
        slot.media.currentTime = slot.start;

        try {
          await slot.media.play();
        } catch {
          if (this.stopped || slot.media.muted) return;
          slot.media.muted = true;
          await slot.media.play().catch(() => undefined);
        }
      }),
      ...this.tracks.map(async (slot) => {
        slot.media.currentTime = 0;
        await slot.media.play().catch(() => undefined);
      }),
    ]);
  }

  /// เฟรมสดของวิดีโอนี้ (null = ใช้ภาพปก) — เรียกทุกครั้งที่วาด จึงคุมจุดจบ/วนซ้ำของช่วงตัดต่อที่นี่ด้วย
  frame = (el: VideoElement): HTMLVideoElement | null => {
    const slot = this.videos.find((v) => v.el.id === el.id);

    if (!slot || slot.media.readyState < 2) return null;

    const { media } = slot;

    if (!slot.ended && (media.currentTime >= slot.end || media.ended)) {
      if (slot.el.loop) {
        media.currentTime = slot.start;
        if (media.paused) void media.play().catch(() => undefined);
      } else {
        media.pause();
        slot.ended = true;
      }
    }

    return media;
  };

  stop(): void {
    this.stopped = true;

    for (const { media } of [...this.videos, ...this.tracks]) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
  }
}

/// หน้านี้มีอะไรต้องเล่นไหม (ไม่ต้องสร้างตัวเล่นถ้าไม่มี)
export function pageHasMedia(page: Pick<Page, 'elements' | 'audio'>): boolean {
  return Boolean(page.audio?.length) || page.elements.some((el) => el.type === 'video' && !el.hidden);
}
