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
  /// ภาษาที่ฟอนต์ออกแบบมา · ฟอนต์อังกฤษแสดงภาษาไทยด้วยฟอนต์สำรอง Noto Sans Thai
  script?: 'th' | 'en';
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
  { id: 'Anuphan', label: 'อนุพันธ์ (Anuphan)', regular: 'Anuphan-Variable.ttf', bold: 'Anuphan-Variable.ttf', style: 'sans', script: 'th' },
  { id: 'Bai Jamjuree', label: 'ใบจามจุรี (Bai Jamjuree)', regular: 'BaiJamjuree-Regular.ttf', bold: 'BaiJamjuree-Bold.ttf', style: 'sans', script: 'th' },
  { id: 'Chonburi', label: 'ชลบุรี (Chonburi)', regular: 'Chonburi-Regular.ttf', bold: null, style: 'display', script: 'th' },
  { id: 'Fahkwang', label: 'ฟ้ากว้าง (Fahkwang)', regular: 'Fahkwang-Regular.ttf', bold: 'Fahkwang-Bold.ttf', style: 'display', script: 'th' },
  { id: 'K2D', label: 'K2D', regular: 'K2D-Regular.ttf', bold: 'K2D-Bold.ttf', style: 'sans', script: 'th' },
  { id: 'KoHo', label: 'โคโฮ (KoHo)', regular: 'KoHo-Regular.ttf', bold: 'KoHo-Bold.ttf', style: 'sans', script: 'th' },
  { id: 'Kodchasan', label: 'กชสัณ (Kodchasan)', regular: 'Kodchasan-Regular.ttf', bold: 'Kodchasan-Bold.ttf', style: 'display', script: 'th' },
  { id: 'Krub', label: 'ครับ (Krub)', regular: 'Krub-Regular.ttf', bold: 'Krub-Bold.ttf', style: 'sans', script: 'th' },
  { id: 'Mali', label: 'มะลิ (Mali)', regular: 'Mali-Regular.ttf', bold: 'Mali-Bold.ttf', style: 'handwriting', script: 'th' },
  { id: 'Niramit', label: 'นิรมิต (Niramit)', regular: 'Niramit-Regular.ttf', bold: 'Niramit-Bold.ttf', style: 'sans', script: 'th' },
  { id: 'Taviraj', label: 'ทวิราช (Taviraj)', regular: 'Taviraj-Regular.ttf', bold: 'Taviraj-Bold.ttf', style: 'serif', script: 'th' },
  { id: 'Trirong', label: 'ตรีรงค์ (Trirong)', regular: 'Trirong-Regular.ttf', bold: 'Trirong-Bold.ttf', style: 'serif', script: 'th' },
  { id: 'Athiti', label: 'อทิติ (Athiti)', regular: 'Athiti-Regular.ttf', bold: 'Athiti-Bold.ttf', style: 'sans', script: 'th' },
  { id: 'Maitree', label: 'ไมตรี (Maitree)', regular: 'Maitree-Regular.ttf', bold: 'Maitree-Bold.ttf', style: 'serif', script: 'th' },
  { id: 'Pattaya', label: 'พัทยา (Pattaya)', regular: 'Pattaya-Regular.ttf', bold: null, style: 'display', script: 'th' },
  { id: 'Thasadith', label: 'ทัศดิษฐ์ (Thasadith)', regular: 'Thasadith-Regular.ttf', bold: 'Thasadith-Bold.ttf', style: 'sans', script: 'th' },
  { id: 'Srisakdi', label: 'ศรีศักดิ์ (Srisakdi)', regular: 'Srisakdi-Regular.ttf', bold: 'Srisakdi-Bold.ttf', style: 'display', script: 'th' },
  { id: 'Charm', label: 'ชาม (Charm)', regular: 'Charm-Regular.ttf', bold: 'Charm-Bold.ttf', style: 'handwriting', script: 'th' },
  { id: 'Noto Serif Thai', label: 'Noto Serif Thai', regular: 'NotoSerifThai-Variable.ttf', bold: 'NotoSerifThai-Variable.ttf', style: 'serif', script: 'th' },
  { id: 'Montserrat', label: 'Montserrat', regular: 'Montserrat-Variable.ttf', bold: 'Montserrat-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Poppins', label: 'Poppins', regular: 'Poppins-Regular.ttf', bold: 'Poppins-Bold.ttf', style: 'sans', script: 'en' },
  { id: 'Roboto', label: 'Roboto', regular: 'Roboto-Variable.ttf', bold: 'Roboto-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Open Sans', label: 'Open Sans', regular: 'OpenSans-Variable.ttf', bold: 'OpenSans-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Lato', label: 'Lato', regular: 'Lato-Regular.ttf', bold: 'Lato-Bold.ttf', style: 'sans', script: 'en' },
  { id: 'Inter', label: 'Inter', regular: 'Inter-Variable.ttf', bold: 'Inter-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Nunito', label: 'Nunito', regular: 'Nunito-Variable.ttf', bold: 'Nunito-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Quicksand', label: 'Quicksand', regular: 'Quicksand-Variable.ttf', bold: 'Quicksand-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Rubik', label: 'Rubik', regular: 'Rubik-Variable.ttf', bold: 'Rubik-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Raleway', label: 'Raleway', regular: 'Raleway-Variable.ttf', bold: 'Raleway-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Josefin Sans', label: 'Josefin Sans', regular: 'JosefinSans-Variable.ttf', bold: 'JosefinSans-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Space Grotesk', label: 'Space Grotesk', regular: 'SpaceGrotesk-Variable.ttf', bold: 'SpaceGrotesk-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Comfortaa', label: 'Comfortaa', regular: 'Comfortaa-Variable.ttf', bold: 'Comfortaa-Variable.ttf', style: 'display', script: 'en' },
  { id: 'Oswald', label: 'Oswald', regular: 'Oswald-Variable.ttf', bold: 'Oswald-Variable.ttf', style: 'display', script: 'en' },
  { id: 'Bebas Neue', label: 'Bebas Neue', regular: 'BebasNeue-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Anton', label: 'Anton', regular: 'Anton-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Archivo Black', label: 'Archivo Black', regular: 'ArchivoBlack-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Righteous', label: 'Righteous', regular: 'Righteous-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Abril Fatface', label: 'Abril Fatface', regular: 'AbrilFatface-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Lobster', label: 'Lobster', regular: 'Lobster-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Playfair Display', label: 'Playfair Display', regular: 'PlayfairDisplay-Variable.ttf', bold: 'PlayfairDisplay-Variable.ttf', style: 'serif', script: 'en' },
  { id: 'Pacifico', label: 'Pacifico', regular: 'Pacifico-Regular.ttf', bold: null, style: 'handwriting', script: 'en' },
  { id: 'Dancing Script', label: 'Dancing Script', regular: 'DancingScript-Variable.ttf', bold: 'DancingScript-Variable.ttf', style: 'handwriting', script: 'en' },
  { id: 'Caveat', label: 'Caveat', regular: 'Caveat-Variable.ttf', bold: 'Caveat-Variable.ttf', style: 'handwriting', script: 'en' },
  { id: 'Great Vibes', label: 'Great Vibes', regular: 'GreatVibes-Regular.ttf', bold: null, style: 'handwriting', script: 'en' },
];

export const DEFAULT_FONT = 'Noto Sans Thai';

export function cssFamily(id: string): string {
  return `"CSC ${id}", "CSC ${DEFAULT_FONT}", sans-serif`;
}

const loaded = new Map<string, Promise<void>>();
const ready = new Set<string>();

interface FontSource {
  family: string;
  url: string;
  weight: string;
}

/// ฟอนต์ที่โหลดแล้ว — ใช้ติดตั้งซ้ำในหน้าต่างอื่น (หน้าต่างผู้พรีเซนต์) เพราะ FontFace ผูกกับเอกสารของตัวเอง
const sources = new Map<string, FontSource>();
const mirrors = new Set<(source: FontSource) => void>();

/// ติดตั้งฟอนต์ที่โหลดแล้วทั้งหมด (และที่จะโหลดต่อจากนี้) ลงเอกสารอื่น · onReady เรียกทุกครั้งที่ฟอนต์พร้อม ให้วาดใหม่
export function mirrorFonts(doc: Document, onReady: () => void): () => void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;

  if (!win || typeof win.FontFace === 'undefined') return () => undefined;

  const install = (source: FontSource) => {
    const face = new win.FontFace(source.family, source.url, { weight: source.weight });

    void face
      .load()
      .then((done) => {
        doc.fonts.add(done);
        onReady();
      })
      .catch(() => undefined);
  };

  sources.forEach(install);
  mirrors.add(install);

  return () => {
    mirrors.delete(install);
  };
}

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

  const source: FontSource = {
    family: `CSC ${family.id}`,
    // URL เต็ม ให้หน้าต่างที่เปิดจากหน้านี้ (about:blank) โหลดได้ด้วย
    url: `url(${window.location.origin}/fonts/${file})`,
    weight: file.includes('Variable') ? '100 900' : String(weight),
  };
  const face = new FontFace(source.family, source.url, { weight: source.weight });
  const promise = face
    .load()
    .then((face) => {
      document.fonts.add(face);
      ready.add(key);
      sources.set(key, source);
      mirrors.forEach((install) => install(source));
    })
    .catch(() => {
      // โหลดไม่ได้ก็วาดด้วยฟอนต์สำรอง ดีกว่าค้างทั้งหน้า · ให้ลองใหม่ครั้งหน้า
      loaded.delete(key);
    });

  loaded.set(key, promise);

  return promise;
}
