/// แหล่งที่มาของรูปที่ผู้ใช้นำเข้าจากเว็บอื่น (คัดลอก/ลากจากหน้าต่าง "แหล่งภาพ" ที่เปิดข้างจอ)
///
/// หลังบ้าน **ไม่เคยเปิดหรือดึง URL นี้** — เก็บไว้เป็นข้อความให้ผู้ใช้กดกลับไปดูต้นฉบับและใส่เครดิตเท่านั้น
/// ชื่อแหล่งรับเฉพาะจากรายการคงที่ · ค่าอื่นกลายเป็น "other"

export const SOURCE_SITES = [
  'unsplash',
  'pexels',
  'pixabay',
  'openverse',
  'wikimedia',
  'nasa',
  'pinterest',
  'google',
  'other',
] as const;
export type SourceSite = (typeof SOURCE_SITES)[number];

export const MAX_SOURCE_URL_LENGTH = 500;

/// โดเมนของแต่ละแหล่ง (รวมโดเมนที่เก็บไฟล์รูปของเว็บนั้น)
const HOSTS: Array<[Exclude<SourceSite, 'other'>, RegExp]> = [
  ['unsplash', /(^|\.)unsplash\.com$/],
  ['pexels', /(^|\.)pexels\.com$/],
  ['pixabay', /(^|\.)pixabay\.com$/],
  ['openverse', /(^|\.)openverse\.(org|engineering)$/],
  ['wikimedia', /(^|\.)(wikimedia|wikipedia)\.org$/],
  ['nasa', /(^|\.)nasa\.gov$/],
  ['pinterest', /(^|\.)(pinterest\.[a-z]{2,3}(\.[a-z]{2})?|pinimg\.com|pin\.it)$/],
  ['google', /(^|\.)(google\.[a-z]{2,3}(\.[a-z]{2})?|gstatic\.com)$/],
];

/// URL ที่เก็บได้: http(s) เท่านั้น ยาวไม่เกิน 500 · ไม่ใช่ → null
export function cleanSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_SOURCE_URL_LENGTH) return null;

  try {
    const url = new URL(trimmed);

    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().slice(0, MAX_SOURCE_URL_LENGTH) : null;
  } catch {
    return null;
  }
}

/// เดาแหล่งจากโดเมนของ URL · ไม่รู้จัก → null
export function siteFromUrl(value: string | null | undefined): Exclude<SourceSite, 'other'> | null {
  const url = cleanSourceUrl(value);

  if (!url) return null;

  const host = new URL(url).hostname.toLowerCase();

  return HOSTS.find(([, pattern]) => pattern.test(host))?.[0] ?? null;
}

/// ชื่อแหล่งที่ client ส่งมา → ค่าในรายการ · ไม่อยู่ในรายการ → "other"
export function normalizeSite(value: string | null | undefined): SourceSite | null {
  if (!value?.trim()) return null;

  const site = value.trim().toLowerCase();

  return (SOURCE_SITES as readonly string[]).includes(site) ? (site as SourceSite) : 'other';
}

/// รวมสองข้อมูล: โดเมนที่รู้จักชนะเสมอ · รองลงมาคือแหล่งที่ผู้ใช้เลือกในแผง · มี URL แต่ไม่รู้จัก → other
/// ไม่มีทั้งคู่ = ไฟล์จากเครื่อง (ไม่ใช่ภาพที่นำเข้าจากเว็บ)
export function resolveSource(sourceUrl?: string | null, sourceSite?: string | null): { sourceUrl: string | null; sourceSite: SourceSite | null } {
  const url = cleanSourceUrl(sourceUrl);
  const fromUrl = siteFromUrl(url);
  const picked = normalizeSite(sourceSite);
  const site = fromUrl ?? (picked && picked !== 'other' ? picked : url || picked ? 'other' : null);

  return { sourceUrl: url, sourceSite: site };
}
