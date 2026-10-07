/// คลังฟอนต์ของผืนผ้าใบ — ไฟล์อยู่ใน public/fonts ของ repo ทั้งหมด
/// (สัญญาอนุญาต OFL หรือ Apache 2.0 แนบข้างไฟล์ชื่อ `OFL-<ชื่อ>.txt` / `LICENSE-<ชื่อ>.txt`)
///
/// ไม่ดึงจาก Google Fonts หรือ CDN ใด ๆ ตอนใช้งาน เพื่อไม่ให้ข้อมูลผู้ใช้ออกนอกระบบ
/// ชื่อ family ขึ้นต้นด้วย "CSC " กันชนกับฟอนต์ที่ติดเครื่องผู้ใช้ชื่อเดียวกัน
/// (ไม่งั้นงานจะหน้าตาต่างกันในแต่ละเครื่อง)
///
/// ฟอนต์ที่ผู้ใช้อัปโหลดเอง ("ฟอนต์ของฉัน") อ้างใน JSON state ด้วย `fontFamily: "asset:<uuid ของ asset>"`
/// แล้วโหลดจาก `/api/v1/assets/<uuid>/content` (ต้องมี session · คนที่ได้ลิงก์งานโหลดได้ตามกติกาเดียวกับรูป)

import { create } from 'zustand';

export type FontStyle = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';

export interface FontFamily {
  /// ค่าที่เก็บใน JSON state (`fontFamily`)
  id: string;
  label: string;
  /// ไฟล์ของน้ำหนัก 400 และ 700 (ไม่มี 700 = ใช้ไฟล์ 400 แล้วให้เบราว์เซอร์ทำตัวหนาเทียม)
  regular: string;
  bold: string | null;
  style: FontStyle;
  /// ภาษาที่ฟอนต์ออกแบบมา · ฟอนต์อังกฤษแสดงภาษาไทยด้วยฟอนต์สำรอง Noto Sans Thai
  script?: 'th' | 'en';
  /// สัญญาอนุญาต (ไม่ระบุ = SIL Open Font License 1.1)
  licence?: 'OFL' | 'Apache-2.0';
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
  { id: 'IBM Plex Sans Thai Looped', label: 'IBM Plex Sans Thai Looped (มีหัว)', regular: 'IBMPlexSansThaiLooped-Regular.ttf', bold: 'IBMPlexSansThaiLooped-Bold.ttf', style: 'sans', script: 'th' },
  // ── อังกฤษ: ไม่มีหัว ──
  { id: 'Work Sans', label: 'Work Sans', regular: 'WorkSans-Variable.ttf', bold: 'WorkSans-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'DM Sans', label: 'DM Sans', regular: 'DMSans-Variable.ttf', bold: 'DMSans-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Manrope', label: 'Manrope', regular: 'Manrope-Variable.ttf', bold: 'Manrope-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Outfit', label: 'Outfit', regular: 'Outfit-Variable.ttf', bold: 'Outfit-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', regular: 'PlusJakartaSans-Variable.ttf', bold: 'PlusJakartaSans-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Sora', label: 'Sora', regular: 'Sora-Variable.ttf', bold: 'Sora-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Urbanist', label: 'Urbanist', regular: 'Urbanist-Variable.ttf', bold: 'Urbanist-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Lexend', label: 'Lexend (อ่านง่าย)', regular: 'Lexend-Variable.ttf', bold: 'Lexend-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Barlow', label: 'Barlow', regular: 'Barlow-Regular.ttf', bold: 'Barlow-Bold.ttf', style: 'sans', script: 'en' },
  { id: 'Fira Sans', label: 'Fira Sans', regular: 'FiraSans-Regular.ttf', bold: 'FiraSans-Bold.ttf', style: 'sans', script: 'en' },
  { id: 'Source Sans 3', label: 'Source Sans 3', regular: 'SourceSans3-Variable.ttf', bold: 'SourceSans3-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'PT Sans', label: 'PT Sans', regular: 'PTSans-Regular.ttf', bold: 'PTSans-Bold.ttf', style: 'sans', script: 'en' },
  { id: 'Mulish', label: 'Mulish', regular: 'Mulish-Variable.ttf', bold: 'Mulish-Variable.ttf', style: 'sans', script: 'en' },
  { id: 'Karla', label: 'Karla', regular: 'Karla-Variable.ttf', bold: 'Karla-Variable.ttf', style: 'sans', script: 'en' },
  // ── อังกฤษ: มีเชิง ──
  { id: 'Lora', label: 'Lora', regular: 'Lora-Variable.ttf', bold: 'Lora-Variable.ttf', style: 'serif', script: 'en' },
  { id: 'Libre Baskerville', label: 'Libre Baskerville', regular: 'LibreBaskerville-Variable.ttf', bold: 'LibreBaskerville-Variable.ttf', style: 'serif', script: 'en' },
  { id: 'Crimson Text', label: 'Crimson Text', regular: 'CrimsonText-Regular.ttf', bold: 'CrimsonText-Bold.ttf', style: 'serif', script: 'en' },
  { id: 'Cinzel', label: 'Cinzel (ตัวพิมพ์ใหญ่แบบโรมัน)', regular: 'Cinzel-Variable.ttf', bold: 'Cinzel-Variable.ttf', style: 'serif', script: 'en' },
  // ── อังกฤษ: ดิสเพลย์ ──
  { id: 'Fredoka', label: 'Fredoka (กลมมน)', regular: 'Fredoka-Variable.ttf', bold: 'Fredoka-Variable.ttf', style: 'display', script: 'en' },
  { id: 'Baloo 2', label: 'Baloo 2 (กลมมน)', regular: 'Baloo2-Variable.ttf', bold: 'Baloo2-Variable.ttf', style: 'display', script: 'en' },
  { id: 'Exo 2', label: 'Exo 2 (ล้ำยุค)', regular: 'Exo2-Variable.ttf', bold: 'Exo2-Variable.ttf', style: 'display', script: 'en' },
  { id: 'Orbitron', label: 'Orbitron (ไซไฟ)', regular: 'Orbitron-Variable.ttf', bold: 'Orbitron-Variable.ttf', style: 'display', script: 'en' },
  { id: 'Audiowide', label: 'Audiowide (ไซไฟ)', regular: 'Audiowide-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Bungee', label: 'Bungee (ป้ายถนน)', regular: 'Bungee-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Press Start 2P', label: 'Press Start 2P (เกมพิกเซล)', regular: 'PressStart2P-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Monoton', label: 'Monoton (นีออน)', regular: 'Monoton-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Alfa Slab One', label: 'Alfa Slab One', regular: 'AlfaSlabOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Titan One', label: 'Titan One', regular: 'TitanOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Luckiest Guy', label: 'Luckiest Guy (การ์ตูน)', regular: 'LuckiestGuy-Regular.ttf', bold: null, style: 'display', script: 'en', licence: 'Apache-2.0' },
  { id: 'Chewy', label: 'Chewy (การ์ตูน)', regular: 'Chewy-Regular.ttf', bold: null, style: 'display', script: 'en', licence: 'Apache-2.0' },
  { id: 'Bangers', label: 'Bangers (คอมิก)', regular: 'Bangers-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Black Ops One', label: 'Black Ops One (ทหาร)', regular: 'BlackOpsOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Rubik Mono One', label: 'Rubik Mono One', regular: 'RubikMonoOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Lilita One', label: 'Lilita One', regular: 'LilitaOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Patua One', label: 'Patua One', regular: 'PatuaOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Concert One', label: 'Concert One', regular: 'ConcertOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  { id: 'Fjalla One', label: 'Fjalla One (หัวข่าว)', regular: 'FjallaOne-Regular.ttf', bold: null, style: 'display', script: 'en' },
  // ── อังกฤษ: ลายมือ ──
  { id: 'Permanent Marker', label: 'Permanent Marker (ปากกาเมจิก)', regular: 'PermanentMarker-Regular.ttf', bold: null, style: 'handwriting', script: 'en', licence: 'Apache-2.0' },
  { id: 'Shadows Into Light', label: 'Shadows Into Light', regular: 'ShadowsIntoLight-Regular.ttf', bold: null, style: 'handwriting', script: 'en' },
  { id: 'Amatic SC', label: 'Amatic SC (ตัวผอมวาดมือ)', regular: 'AmaticSC-Regular.ttf', bold: 'AmaticSC-Bold.ttf', style: 'handwriting', script: 'en' },
  { id: 'Indie Flower', label: 'Indie Flower', regular: 'IndieFlower-Regular.ttf', bold: null, style: 'handwriting', script: 'en' },
  { id: 'Kalam', label: 'Kalam', regular: 'Kalam-Regular.ttf', bold: 'Kalam-Bold.ttf', style: 'handwriting', script: 'en' },
  { id: 'Satisfy', label: 'Satisfy (ตัวเขียน)', regular: 'Satisfy-Regular.ttf', bold: null, style: 'handwriting', script: 'en', licence: 'Apache-2.0' },
  { id: 'Kaushan Script', label: 'Kaushan Script (พู่กัน)', regular: 'KaushanScript-Regular.ttf', bold: null, style: 'handwriting', script: 'en' },
  { id: 'Sacramento', label: 'Sacramento (ตัวเขียนเส้นเดียว)', regular: 'Sacramento-Regular.ttf', bold: null, style: 'handwriting', script: 'en' },
  { id: 'Courgette', label: 'Courgette', regular: 'Courgette-Regular.ttf', bold: null, style: 'handwriting', script: 'en' },
  // ── อังกฤษ: โมโนสเปซ (ตัวอักษรกว้างเท่ากัน เหมาะกับโค้ด) ──
  { id: 'Space Mono', label: 'Space Mono', regular: 'SpaceMono-Regular.ttf', bold: 'SpaceMono-Bold.ttf', style: 'mono', script: 'en' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono', regular: 'JetBrainsMono-Variable.ttf', bold: 'JetBrainsMono-Variable.ttf', style: 'mono', script: 'en' },
  { id: 'Roboto Mono', label: 'Roboto Mono', regular: 'RobotoMono-Variable.ttf', bold: 'RobotoMono-Variable.ttf', style: 'mono', script: 'en' },
  { id: 'Source Code Pro', label: 'Source Code Pro', regular: 'SourceCodePro-Variable.ttf', bold: 'SourceCodePro-Variable.ttf', style: 'mono', script: 'en' },
];

export const DEFAULT_FONT = 'Noto Sans Thai';

/// ฟอนต์ยอดนิยม (ชิป "ยอดนิยม" และเรียงขึ้นก่อนในรายการ) — ไทยที่ใช้บ่อยในงานนักศึกษา/บุคลากรก่อน แล้วอังกฤษ
export const POPULAR_FONT_IDS: string[] = [
  'Noto Sans Thai', 'Sarabun', 'Kanit', 'Prompt', 'Mitr', 'IBM Plex Sans Thai', 'Chakra Petch', 'Bai Jamjuree', 'Anuphan',
  'Itim', 'Sriracha', 'Mali', 'Pridi', 'Charmonman', 'Chonburi',
  'Montserrat', 'Poppins', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'DM Sans', 'Work Sans', 'Bebas Neue', 'Anton', 'Oswald',
  'Playfair Display', 'Lora', 'Cinzel', 'Pacifico', 'Great Vibes', 'Dancing Script', 'Permanent Marker', 'Amatic SC', 'Fredoka',
  'Bungee', 'Press Start 2P', 'JetBrains Mono',
];

const POPULAR_RANK = new Map(POPULAR_FONT_IDS.map((id, index) => [id, index]));

export function isPopularFont(id: string): boolean {
  return POPULAR_RANK.has(id);
}

/// เรียงฟอนต์ยอดนิยมขึ้นก่อน (ตามลำดับความนิยม) ที่เหลือคงลำดับเดิม
export function popularFirst<T extends { id: string }>(fonts: T[]): T[] {
  const rank = (font: T) => POPULAR_RANK.get(font.id) ?? Number.MAX_SAFE_INTEGER;

  return fonts
    .map((font, index) => ({ font, index }))
    .sort((a, b) => rank(a.font) - rank(b.font) || a.index - b.index)
    .map((entry) => entry.font);
}

// ── ฟอนต์ของฉัน (อัปโหลดเอง) ────────────────────────────────────

export const ASSET_FONT_PREFIX = 'asset:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assetFontId(assetId: string): string {
  return `${ASSET_FONT_PREFIX}${assetId}`;
}

/// uuid ของ asset จาก `fontFamily` แบบ "asset:<uuid>" · ค่าอื่น/uuid ไม่ถูกต้อง → null
export function assetIdOfFont(id: string | null | undefined): string | null {
  if (!id || !id.startsWith(ASSET_FONT_PREFIX)) return null;

  const assetId = id.slice(ASSET_FONT_PREFIX.length);

  return UUID.test(assetId) ? assetId.toLowerCase() : null;
}

export function assetFontUrl(assetId: string): string {
  return `/api/v1/assets/${assetId}/content`;
}

/// ชื่อของฟอนต์ที่อัปโหลด (จากรายการ "ฟอนต์ของฉัน") ไว้แสดงเป็นชื่อฟอนต์ · ผู้ชมงานที่แชร์ไม่มีรายการนี้ → ชื่อกลาง
interface UserFonts {
  names: Record<string, string>;
  setNames(fonts: Array<{ id: string; fileName: string }>): void;
}

export const useUserFonts = create<UserFonts>((set) => ({
  names: {},
  setNames(fonts) {
    set((state) => ({ names: { ...state.names, ...Object.fromEntries(fonts.map((f) => [f.id, userFontName(f.fileName)])) } }));
  },
}));

/// "Kanit-Bold.ttf" → "Kanit-Bold"
export function userFontName(fileName: string): string {
  return fileName.replace(/\.(ttf|otf|woff2?)$/i, '').trim() || 'ฟอนต์ของฉัน';
}

/// ชื่อที่แสดงของฟอนต์ใดก็ได้ (คลังของระบบ หรือฟอนต์ที่อัปโหลด)
export function fontLabel(id: string, names: Record<string, string> = useUserFonts.getState().names): string {
  const assetId = assetIdOfFont(id);

  if (assetId) return names[assetId] ?? 'ฟอนต์ที่อัปโหลด';

  return FONT_FAMILIES.find((f) => f.id === id)?.label ?? id;
}

/// ชื่อสั้นสำหรับปุ่มบนแถบเครื่องมือ (ตัดคำอธิบายในวงเล็บ)
export function shortFontLabel(id: string, names?: Record<string, string>): string {
  return fontLabel(id, names).replace(/\s*\(.*\)$/, '');
}

/// ชื่อ family ที่ติดตั้งในเบราว์เซอร์ (ไม่มีเครื่องหมายคำพูด)
export function fontFaceName(id: string): string {
  const assetId = assetIdOfFont(id);

  return assetId ? `CSC asset-${assetId}` : `CSC ${id}`;
}

export function cssFamily(id: string): string {
  return `"${fontFaceName(id)}", "CSC ${DEFAULT_FONT}", sans-serif`;
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
  const assetId = assetIdOfFont(id);

  return ready.has(assetId ? `${ASSET_FONT_PREFIX}${assetId}:${weight}` : `${id}:${weight}`);
}

/// ฟอนต์ที่อัปโหลด: ไฟล์เดียวใช้ทั้งตัวปกติและตัวหนา (ตัวหนาให้เบราว์เซอร์ทำเทียม) · โหลดไม่ได้ (ถูกลบ/ไม่มีสิทธิ์)
/// จำไว้ทั้ง session ไม่ลองซ้ำทุกเฟรม แล้ววาดด้วยฟอนต์สำรอง
function ensureAssetFont(id: string, assetId: string): Promise<void> {
  const key = `${ASSET_FONT_PREFIX}${assetId}`;
  const existing = loaded.get(key);

  if (existing) return existing;

  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return Promise.resolve();

  const source: FontSource = { family: fontFaceName(id), url: `url(${window.location.origin}${assetFontUrl(assetId)})`, weight: '400' };
  const promise = new FontFace(source.family, source.url, { weight: source.weight })
    .load()
    .then((face) => {
      document.fonts.add(face);
      ready.add(`${key}:400`);
      ready.add(`${key}:700`);
      sources.set(key, source);
      mirrors.forEach((install) => install(source));
    })
    .catch(() => undefined);

  loaded.set(key, promise);

  return promise;
}

/// โหลดฟอนต์ก่อนวาด — canvas วาดด้วยฟอนต์สำรองถ้ายังโหลดไม่เสร็จ และไม่วาดใหม่เอง
export function ensureFont(id: string, weight: 400 | 700): Promise<void> {
  const assetId = assetIdOfFont(id);

  if (assetId) return ensureAssetFont(id, assetId);

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
