/// คลังฟอนต์ของผืนผ้าใบ — ไฟล์อยู่ใน public/fonts ของ repo ทั้งหมด (สัญญาอนุญาต OFL แนบข้างไฟล์)
///
/// ไม่ดึงจาก Google Fonts หรือ CDN ใด ๆ ตอนใช้งาน เพื่อไม่ให้ข้อมูลผู้ใช้ออกนอกระบบ
/// ชื่อ family ขึ้นต้นด้วย "CSC " กันชนกับฟอนต์ที่ติดเครื่องผู้ใช้ชื่อเดียวกัน
/// (ไม่งั้นงานจะหน้าตาต่างกันในแต่ละเครื่อง)

export interface FontFamily {
  /// ค่าที่เก็บใน JSON state (`fontFamily`)
  id: string;
  label: string;
  /// ไฟล์ของน้ำหนัก 400 และ 700 (ไม่มี 700 = ใช้ไฟล์ 400 แล้วให้เบราว์เซอร์ทำตัวหนาเทียม)
  regular: string;
  bold: string | null;
  style: 'sans' | 'serif' | 'display' | 'handwriting';
}

export const FONT_FAMILIES: FontFamily[] = [
  { id: 'Noto Sans Thai', label: 'Noto Sans Thai', regular: 'NotoSansThai-Variable.ttf', bold: 'NotoSansThai-Variable.ttf', style: 'sans' },
  { id: 'Noto Sans Thai Looped', label: 'Noto Sans Thai Looped (มีหัว)', regular: 'NotoSansThaiLooped-Variable.ttf', bold: 'NotoSansThaiLooped-Variable.ttf', style: 'sans' },
  { id: 'Sarabun', label: 'สารบรรณ (Sarabun)', regular: 'Sarabun-Regular.ttf', bold: 'Sarabun-Bold.ttf', style: 'sans' },
  { id: 'IBM Plex Sans Thai', label: 'IBM Plex Sans Thai', regular: 'IBMPlexSansThai-Regular.ttf', bold: 'IBMPlexSansThai-Bold.ttf', style: 'sans' },
  { id: 'Prompt', label: 'พร้อมท์ (Prompt)', regular: 'Prompt-Regular.ttf', bold: 'Prompt-Bold.ttf', style: 'sans' },
  { id: 'Kanit', label: 'คณิต (Kanit)', regular: 'Kanit-Regular.ttf', bold: 'Kanit-Bold.ttf', style: 'display' },
  { id: 'Mitr', label: 'มิตร (Mitr)', regular: 'Mitr-Regular.ttf', bold: 'Mitr-Bold.ttf', style: 'display' },
  { id: 'Chakra Petch', label: 'จักรเพชร (Chakra Petch)', regular: 'ChakraPetch-Regular.ttf', bold: 'ChakraPetch-Bold.ttf', style: 'display' },
  { id: 'Pridi', label: 'ปรีดี (Pridi)', regular: 'Pridi-Regular.ttf', bold: 'Pridi-Bold.ttf', style: 'serif' },
  { id: 'Charmonman', label: 'ชามนแมน (Charmonman)', regular: 'Charmonman-Regular.ttf', bold: 'Charmonman-Bold.ttf', style: 'handwriting' },
  { id: 'Itim', label: 'ไอติม (Itim)', regular: 'Itim-Regular.ttf', bold: null, style: 'handwriting' },
  { id: 'Sriracha', label: 'ศรีราชา (Sriracha)', regular: 'Sriracha-Regular.ttf', bold: null, style: 'handwriting' },
];

export const DEFAULT_FONT = 'Noto Sans Thai';

export function cssFamily(id: string): string {
  return `"CSC ${id}", "CSC ${DEFAULT_FONT}", sans-serif`;
}

const loaded = new Map<string, Promise<void>>();
const ready = new Set<string>();

export function isFontReady(id: string, weight: 400 | 700): boolean {
  return ready.has(`${id}:${weight}`);
}

/// โหลดฟอนต์ก่อนวาด — canvas วาดด้วยฟอนต์สำรองถ้ายังโหลดไม่เสร็จ และไม่วาดใหม่เอง
export function ensureFont(id: string, weight: 400 | 700): Promise<void> {
  const family = FONT_FAMILIES.find((f) => f.id === id) ?? FONT_FAMILIES[0];
  const file = weight === 700 && family.bold ? family.bold : family.regular;
  const key = `${family.id}:${weight}`;
  const existing = loaded.get(key);

  if (existing) return existing;

  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }

  const face = new FontFace(`CSC ${family.id}`, `url(/fonts/${file})`, {
    weight: file.includes('Variable') ? '100 900' : String(weight),
  });
  const promise = face
    .load()
    .then((face) => {
      document.fonts.add(face);
      ready.add(key);
    })
    .catch(() => {
      // โหลดไม่ได้ก็วาดด้วยฟอนต์สำรอง ดีกว่าค้างทั้งหน้า · ให้ลองใหม่ครั้งหน้า
      loaded.delete(key);
    });

  loaded.set(key, promise);

  return promise;
}
