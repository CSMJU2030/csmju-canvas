/// "แหล่งภาพ": ทางลัดไปเว็บคลังภาพที่เปิดไว้ข้างจอ แล้วให้ผู้ใช้คัดลอก/ลากภาพกลับมาเอง
///
/// CS Canvas **ไม่ฝัง (iframe) ไม่ดึง (scrape) และไม่เรียก API ของเว็บเหล่านี้** — เปิดหน้าค้นหาของเว็บนั้นในหน้าต่างใหม่เท่านั้น
/// ภาพที่ผู้ใช้นำเข้ามาจะจำแหล่งที่มา (โดเมนในข้อมูลคลิปบอร์ด/การลาก หรือแหล่งที่เพิ่งเปิดจากแผง) ไว้ให้กลับไปดูต้นฉบับและใส่เครดิต

import { create } from 'zustand';
import { createText } from './factory';
import type { ImageElement, ImageOrigin, TextElement } from './types';

export type { ImageOrigin } from './types';

export const SOURCE_SITES = ['unsplash', 'pexels', 'pixabay', 'openverse', 'wikimedia', 'nasa', 'pinterest', 'google', 'other'] as const;
export type SourceSite = (typeof SOURCE_SITES)[number];
export type KnownSite = Exclude<SourceSite, 'other'>;

export interface ImageSourceSite {
  key: KnownSite;
  name: string;
  /// free = คลังภาพสัญญาอนุญาตเสรี · inspiration = ใช้หาไอเดียเท่านั้น
  group: 'free' | 'inspiration';
  description: string;
  licence: string;
  home: string;
  search: (q: string) => string;
}

const enc = encodeURIComponent;

export const INSPIRATION_WARNING = 'ภาพส่วนใหญ่มีเจ้าของ ใช้ในงานได้เมื่อได้รับอนุญาตจากเจ้าของเท่านั้น — เหมาะใช้หาไอเดีย';

export const IMAGE_SOURCES: ImageSourceSite[] = [
  {
    key: 'unsplash',
    name: 'Unsplash',
    group: 'free',
    description: 'ภาพถ่ายความละเอียดสูง วิว คน อาหาร พื้นหลัง',
    licence: 'ใช้ฟรีตามสัญญาอนุญาตของ Unsplash · ใส่เครดิตช่างภาพจะดีมาก · ห้ามนำภาพไปขายต่อตรง ๆ',
    home: 'https://unsplash.com/',
    search: (q) => `https://unsplash.com/s/photos/${enc(q)}`,
  },
  {
    key: 'pexels',
    name: 'Pexels',
    group: 'free',
    description: 'ภาพถ่ายและวิดีโอสต็อกหลากหลาย',
    licence: 'ใช้ฟรีตามสัญญาอนุญาตของ Pexels · ใส่เครดิตจะดีมาก · ห้ามขายภาพโดยไม่ดัดแปลง',
    home: 'https://www.pexels.com/',
    search: (q) => `https://www.pexels.com/search/${enc(q)}/`,
  },
  {
    key: 'pixabay',
    name: 'Pixabay',
    group: 'free',
    description: 'ภาพถ่าย ภาพประกอบ และเวกเตอร์',
    licence: 'ใช้ฟรีตามสัญญาอนุญาตของ Pixabay · ใส่เครดิตจะดีมาก · ระวังภาพที่มีโลโก้หรือบุคคลที่จำได้',
    home: 'https://pixabay.com/',
    search: (q) => `https://pixabay.com/images/search/${enc(q)}/`,
  },
  {
    key: 'openverse',
    name: 'Openverse',
    group: 'free',
    description: 'ค้นภาพสัญญาอนุญาต Creative Commons จากหลายคลังในที่เดียว',
    licence: 'แต่ละภาพมีสัญญาอนุญาต CC ของตัวเอง — ต้องทำตาม เช่น ใส่ชื่อผู้สร้าง หรือห้ามใช้เชิงพาณิชย์',
    home: 'https://openverse.org/',
    search: (q) => `https://openverse.org/search/image?q=${enc(q)}`,
  },
  {
    key: 'wikimedia',
    name: 'Wikimedia Commons',
    group: 'free',
    description: 'ภาพสถานที่ บุคคลสำคัญ ประวัติศาสตร์ วิทยาศาสตร์',
    licence: 'แต่ละภาพมีสัญญาอนุญาตของตัวเอง (CC หรือสาธารณสมบัติ) — อ่านหน้าภาพแล้วใส่เครดิตตามที่กำหนด',
    home: 'https://commons.wikimedia.org/',
    search: (q) => `https://commons.wikimedia.org/w/index.php?search=${enc(q)}&title=Special:MediaSearch&type=image`,
  },
  {
    key: 'nasa',
    name: 'NASA Image Library',
    group: 'free',
    description: 'ภาพอวกาศ ดาวเคราะห์ จรวด จากคลังของ NASA',
    licence: 'ส่วนใหญ่เป็นสาธารณสมบัติ · ห้ามใช้โลโก้ NASA ให้ดูเหมือนได้รับการรับรอง · บางภาพเป็นของผู้อื่น ตรวจในหน้าภาพ',
    home: 'https://images.nasa.gov/',
    search: (q) => `https://images.nasa.gov/search?q=${enc(q)}&media=image`,
  },
  {
    key: 'pinterest',
    name: 'Pinterest',
    group: 'inspiration',
    description: 'รวมไอเดียการจัดหน้า สี และสไตล์',
    licence: INSPIRATION_WARNING,
    home: 'https://www.pinterest.com/',
    search: (q) => `https://www.pinterest.com/search/pins/?q=${enc(q)}`,
  },
  {
    key: 'google',
    name: 'Google รูปภาพ',
    group: 'inspiration',
    description: 'ค้นภาพจากทั่วทั้งเว็บ',
    licence: INSPIRATION_WARNING,
    home: 'https://images.google.com/',
    search: (q) => `https://www.google.com/search?tbm=isch&q=${enc(q)}`,
  },
];

export const SITE_LABELS: Record<SourceSite, string> = {
  unsplash: 'Unsplash',
  pexels: 'Pexels',
  pixabay: 'Pixabay',
  openverse: 'Openverse',
  wikimedia: 'Wikimedia',
  nasa: 'NASA',
  pinterest: 'Pinterest',
  google: 'Google',
  other: 'อื่น ๆ',
};

/// ลำดับกลุ่มในหมวด "ภาพที่นำเข้า"
export const IMPORTED_GROUPS: SourceSite[] = ['unsplash', 'pexels', 'pixabay', 'openverse', 'wikimedia', 'nasa', 'pinterest', 'google', 'other'];

/// แหล่งที่ภาพส่วนใหญ่มีเจ้าของ — แสดงป้าย "ตรวจสิทธิ์ก่อนใช้"
export function needsPermission(site: string | null | undefined): boolean {
  return site === 'pinterest' || site === 'google';
}

/// แหล่งที่ภาพใช้ได้ตามสัญญาอนุญาตเสรี — มีปุ่ม "ใส่เครดิตภาพ"
export function canCredit(site: string | null | undefined): site is KnownSite {
  return site === 'unsplash' || site === 'pexels' || site === 'pixabay' || site === 'openverse' || site === 'wikimedia' || site === 'nasa';
}

export function isSourceSite(value: unknown): value is SourceSite {
  return typeof value === 'string' && (SOURCE_SITES as readonly string[]).includes(value);
}

// ── เดาแหล่งจากโดเมน (ตรงกับ backend/src/modules/assets/source-site.ts) ─────────────

const HOSTS: Array<[KnownSite, RegExp]> = [
  ['unsplash', /(^|\.)unsplash\.com$/],
  ['pexels', /(^|\.)pexels\.com$/],
  ['pixabay', /(^|\.)pixabay\.com$/],
  ['openverse', /(^|\.)openverse\.(org|engineering)$/],
  ['wikimedia', /(^|\.)(wikimedia|wikipedia)\.org$/],
  ['nasa', /(^|\.)nasa\.gov$/],
  ['pinterest', /(^|\.)(pinterest\.[a-z]{2,3}(\.[a-z]{2})?|pinimg\.com|pin\.it)$/],
  ['google', /(^|\.)(google\.[a-z]{2,3}(\.[a-z]{2})?|gstatic\.com)$/],
];

export const MAX_SOURCE_URL_LENGTH = 500;

/// ลิงก์ภายนอกแบบ http(s) ยาวไม่เกิน 500 · ลิงก์ภายในระบบเราเอง/ลิงก์สัมพัทธ์/data: → null
export function externalUrl(value: string | null | undefined, ownHost?: string): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/&amp;/g, '&');

  if (!/^https?:\/\//i.test(trimmed) || trimmed.length > MAX_SOURCE_URL_LENGTH) return null;

  try {
    const url = new URL(trimmed);

    if (ownHost && url.host === ownHost) return null;

    return url.toString().length > MAX_SOURCE_URL_LENGTH ? null : url.toString();
  } catch {
    return null;
  }
}

export function siteFromUrl(value: string | null | undefined): KnownSite | null {
  const url = externalUrl(value);

  if (!url) return null;

  const host = new URL(url).hostname.toLowerCase();

  return HOSTS.find(([, pattern]) => pattern.test(host))?.[0] ?? null;
}

export function hostOf(url: string | null | undefined): string | null {
  const clean = externalUrl(url);

  return clean ? new URL(clean).hostname.replace(/^www\./, '') : null;
}

// ── จำแหล่งที่เพิ่งเปิดจากแผง (ใช้เมื่อโดเมนของภาพไม่บอกแหล่ง เช่น ภาพที่ Google พาไปเว็บต้นทาง) ──

/// ภาพที่นำเข้าภายในเวลานี้หลังเปิดแหล่งจากแผง นับว่ามาจากแหล่งนั้น
export const SOURCE_INTENT_MS = 10 * 60 * 1000;

interface SourceIntent {
  site: KnownSite | null;
  at: number;
  remember(site: KnownSite): void;
}

export const useSourceIntent = create<SourceIntent>((set) => ({
  site: null,
  at: 0,
  remember(site) {
    set({ site, at: Date.now() });
  },
}));

export function recentIntent(intent: { site: KnownSite | null; at: number }, now = Date.now()): KnownSite | null {
  return intent.site && now - intent.at <= SOURCE_INTENT_MS ? intent.site : null;
}

/// สิ่งที่อ่านได้จากคลิปบอร์ด/การลาก (แยกจาก DataTransfer เพื่อเทสต์ได้)
export interface TransferHints {
  html: string;
  uriList: string;
}

export function readTransferHints(data: DataTransfer | null): TransferHints {
  if (!data) return { html: '', uriList: '' };

  const get = (type: string) => {
    try {
      return data.getData(type) ?? '';
    } catch {
      return '';
    }
  };

  return { html: get('text/html'), uriList: get('text/uri-list') || get('text/x-moz-url') };
}

/// ภาพที่คัดลอก/ลากมาจากเว็บอื่น: หน้าเว็บ (ลิงก์ที่ครอบรูป) หรือลิงก์ไฟล์รูป + แหล่งที่เดาได้
/// ไม่มีร่องรอยเว็บเลย (เช่น ภาพแคปหน้าจอ) → null = ไฟล์จากเครื่อง
export function originFromHints(
  hints: TransferHints,
  options: { ownHost?: string; intent?: KnownSite | null; fallbackUrl?: string | null } = {},
): ImageOrigin | null {
  const html = hints.html;
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
  const anchor = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<img/i)?.[1] ?? null;
  const uri = hints.uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#')) ?? null;

  const pageUrl = externalUrl(anchor, options.ownHost);
  const imageUrl = externalUrl(img, options.ownHost) ?? externalUrl(uri, options.ownHost) ?? externalUrl(options.fallbackUrl, options.ownHost);
  const hasWebHint = Boolean(html.trim() || hints.uriList.trim() || options.fallbackUrl);

  if (!hasWebHint) return null;

  const url = pageUrl ?? imageUrl;
  const site = siteFromUrl(pageUrl) ?? siteFromUrl(imageUrl) ?? options.intent ?? (url ? 'other' : null);

  // html ภายในระบบเอง (ไม่มีลิงก์ภายนอก และไม่ได้เพิ่งเปิดแหล่งจากแผง) ไม่นับว่านำเข้า
  if (!site) return null;

  return { site, url };
}

/// ช่อง multipart ที่ส่งไปกับไฟล์ (POST /api/v1/assets)
export function originFields(origin: ImageOrigin | null | undefined): Record<string, string> | undefined {
  if (!origin) return undefined;

  return origin.url ? { sourceUrl: origin.url, sourceSite: origin.site } : { sourceSite: origin.site };
}

export function originOfAsset(asset: { sourceSite?: string | null; sourceUrl?: string | null }): ImageOrigin | null {
  return isSourceSite(asset.sourceSite) ? { site: asset.sourceSite, url: asset.sourceUrl ?? null } : null;
}

// ── เปิดหน้าต่างข้างจอ ───────────────────────────────────────────

export const SOURCE_WINDOW_NAME = 'csmju-canvas-image-source';

/// ครึ่งขวาของจอ (CS Canvas ย่อหน้าต่างตัวเองไม่ได้ ผู้ใช้จัดหน้าต่างนี้ไปครึ่งซ้ายเอง)
export function sideWindowFeatures(screenInfo: { availWidth: number; availHeight: number; availLeft?: number; availTop?: number }): string {
  const half = Math.floor(screenInfo.availWidth / 2);
  const left = (screenInfo.availLeft ?? 0) + half;
  const top = screenInfo.availTop ?? 0;

  return `popup=yes,left=${left},top=${top},width=${half},height=${screenInfo.availHeight}`;
}

export function sourceUrl(source: ImageSourceSite, q: string): string {
  const term = q.trim().slice(0, 100);

  return term ? source.search(term) : source.home;
}

// ── เครดิตภาพ ────────────────────────────────────────────────────

export function creditText(origin: ImageOrigin): string {
  const host = hostOf(origin.url);
  const site = origin.site === 'other' ? 'เว็บต้นทาง' : SITE_LABELS[origin.site];

  return host ? `ภาพ: ${site} · ${host}` : `ภาพ: ${site}`;
}

/// กล่องข้อความเครดิตเล็ก ๆ ใต้รูป (ชิดซ้ายของรูป · ถ้าเลยขอบล่างของหน้าให้อยู่ในขอบล่างของรูปแทน)
export function createCreditText(page: { width: number; height: number }, image: Pick<ImageElement, 'x' | 'y' | 'width' | 'height'>, origin: ImageOrigin): TextElement {
  const fontSize = Math.max(12, Math.round(Math.min(page.width, page.height) * 0.018));
  const height = Math.round(fontSize * 1.4);
  const width = Math.round(Math.max(image.width, fontSize * 16));
  const below = image.y + image.height + Math.round(fontSize / 2);
  const y = below + height <= page.height ? below : Math.max(0, image.y + image.height - height - 4);
  const text = createText(page, 'body', { text: creditText(origin), color: 'rgb(71 85 105)' });

  return { ...text, name: 'เครดิตภาพ', x: Math.round(image.x), y: Math.round(y), width, height, fontSize, align: 'left' };
}

// ── แถบแนะนำหลังนำภาพเข้า ("ลบพื้นหลังภาพนี้" · "ใส่เครดิตภาพ") ─────────────

interface ImportHint {
  elementId: string | null;
  origin: ImageOrigin | null;
  show(elementId: string, origin: ImageOrigin): void;
  clear(): void;
}

export const useImportHint = create<ImportHint>((set) => ({
  elementId: null,
  origin: null,
  show(elementId, origin) {
    set({ elementId, origin });
  },
  clear() {
    set({ elementId: null, origin: null });
  },
}));
