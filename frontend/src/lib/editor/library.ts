/// คลังกราฟิกในระบบ (public/library — แหล่งที่มาและสัญญาอนุญาตอยู่ใน LICENSES.md ข้างไฟล์)
///
/// โหลดไฟล์รายการครั้งเดียวต่อการเปิดหน้า · ไม่มีการเรียกบริการภายนอก

export interface LibraryIcon {
  /// ชื่อ Tabler
  n: string;
  /// หมวด (อังกฤษ)
  c: string;
  /// แท็กสำหรับค้นหา
  t: string;
  /// เนื้อใน SVG (viewBox 24×24 เส้น currentColor)
  d: string;
}

export interface LibrarySticker {
  id: string;
  g: string;
  n: string;
  ch: string;
}

export interface LibraryPhoto {
  id: string;
  g: string;
  title: string;
  credit: string;
  date: string;
  w: number;
  h: number;
  source: string;
}

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string): Promise<T> {
  let p = cache.get(file) as Promise<T> | undefined;

  if (!p) {
    p = fetch(`/library/${file}`).then((r) => {
      if (!r.ok) throw new Error('โหลดคลังกราฟิกไม่สำเร็จ');

      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }

  return p;
}

export const loadIcons = () => load<LibraryIcon[]>('icons.json');
export const loadStickers = () => load<LibrarySticker[]>('stickers.json');
export const loadPhotos = () => load<LibraryPhoto[]>('photos.json');

export function iconMarkup(icon: Pick<LibraryIcon, 'd'>, strokeWidth = 2): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${icon.d}</svg>`;
}

export const stickerSrc = (id: string) => `/library/stickers/${id}.svg`;
export const photoSrc = (id: string) => `/library/photos/${id}.jpg`;
export const photoThumb = (id: string) => `/library/photos/${id}-thumb.jpg`;

/// ชื่อหมวดของกราฟิกเป็นภาษาไทย
export const ICON_CATEGORY_TH: Record<string, string> = {
  System: 'ระบบ',
  Devices: 'อุปกรณ์',
  Design: 'ออกแบบ',
  Arrows: 'ลูกศร',
  Map: 'แผนที่และสถานที่',
  Letters: 'ตัวอักษร',
  Document: 'เอกสาร',
  Numbers: 'ตัวเลข',
  Text: 'ข้อความ',
  Shapes: 'รูปทรง',
  Media: 'สื่อ',
  'E-commerce': 'ซื้อขาย',
  Communication: 'การสื่อสาร',
  Food: 'อาหาร',
  Buildings: 'อาคาร',
  Vehicles: 'ยานพาหนะ',
  Math: 'คณิตศาสตร์',
  Health: 'สุขภาพ',
  Sport: 'กีฬา',
  Currencies: 'สกุลเงิน',
  Development: 'พัฒนาโปรแกรม',
  Weather: 'สภาพอากาศ',
  Mood: 'อารมณ์',
  Nature: 'ธรรมชาติ',
  Photography: 'ถ่ายภาพ',
  Games: 'เกม',
  Computers: 'คอมพิวเตอร์',
  Database: 'ฐานข้อมูล',
  Laundry: 'ซักรีด',
  Charts: 'แผนภูมิ',
  Symbols: 'สัญลักษณ์',
  Badges: 'ป้าย',
  Electrical: 'ไฟฟ้า',
  Animals: 'สัตว์',
  Gender: 'เพศ',
  Gestures: 'ท่าทาง',
  'Version control': 'จัดการเวอร์ชัน',
  Extensions: 'ไฟล์',
  Zodiac: 'ราศี',
};

/// คำค้นภาษาไทยที่พบบ่อย → คำอังกฤษในแท็กของกราฟิกและชื่อสติกเกอร์
const TH_KEYWORDS: Record<string, string[]> = {
  หัวใจ: ['heart'], รัก: ['heart', 'love'], ดาว: ['star'], บ้าน: ['home', 'house'], โรงเรียน: ['school'], เรียน: ['school', 'book', 'education'],
  หนังสือ: ['book'], ปากกา: ['pen', 'pencil'], ดินสอ: ['pencil'], คอมพิวเตอร์: ['computer', 'device-desktop', 'laptop'], โทรศัพท์: ['phone'], มือถือ: ['phone', 'mobile'],
  กล้อง: ['camera'], รูป: ['photo', 'image'], เพลง: ['music'], ดนตรี: ['music'], วิดีโอ: ['video'], เวลา: ['clock', 'time'], นาฬิกา: ['clock'], ปฏิทิน: ['calendar'],
  เงิน: ['money', 'cash', 'coin'], ตลาด: ['shop', 'cart'], ตะกร้า: ['basket', 'cart'], ร้าน: ['shop', 'store'], อาหาร: ['food', 'meal'], กาแฟ: ['coffee'], น้ำ: ['water', 'droplet'],
  ต้นไม้: ['tree', 'plant'], ดอกไม้: ['flower'], ใบไม้: ['leaf'], ภูเขา: ['mountain'], ทะเล: ['sea', 'wave', 'ocean'], ดวงอาทิตย์: ['sun'], ฝน: ['rain'], เมฆ: ['cloud'], หิมะ: ['snow'],
  ไฟ: ['fire', 'flame', 'bulb'], หลอดไฟ: ['bulb'], ไอเดีย: ['bulb', 'idea'], รถ: ['car'], จักรยาน: ['bike'], เครื่องบิน: ['plane'], เรือ: ['ship', 'boat'], แผนที่: ['map'], หมุด: ['pin', 'map-pin'],
  คน: ['user', 'person'], ผู้ใช้: ['user'], กลุ่ม: ['users', 'group'], ทีม: ['users', 'team'], หมา: ['dog'], สุนัข: ['dog'], แมว: ['cat'], นก: ['bird'], ปลา: ['fish'],
  ลูกศร: ['arrow'], ถูก: ['check'], ผิด: ['x'], บวก: ['plus'], ลบ: ['minus', 'trash'], ถังขยะ: ['trash'], ค้นหา: ['search'], ตั้งค่า: ['settings'], ล็อก: ['lock'], กุญแจ: ['key', 'lock'],
  ข้อความ: ['message', 'text'], แชท: ['message', 'chat'], อีเมล: ['mail'], จดหมาย: ['mail'], ระฆัง: ['bell'], แจ้งเตือน: ['bell'], ธง: ['flag'], รางวัล: ['award', 'trophy'], ถ้วย: ['trophy', 'cup'],
  ยิ้ม: ['smile', 'grinning'], หัวเราะ: ['laugh', 'joy'], เศร้า: ['sad', 'cry'], โกรธ: ['angry'], ตกใจ: ['surprise', 'scream'], ปาร์ตี้: ['party', 'confetti'], เค้ก: ['cake'], ของขวัญ: ['gift'],
  กีฬา: ['ball', 'sport'], ฟุตบอล: ['soccer', 'ball-football'], บาส: ['basketball'], เกม: ['game', 'device-gamepad'], สุขภาพ: ['heart', 'health'], หมอ: ['stethoscope', 'doctor'], ยา: ['pill', 'medicine'],
  แผนภูมิ: ['chart'], กราฟ: ['chart', 'graph'], สถิติ: ['chart'], ไฟล์: ['file'], เอกสาร: ['file', 'document'], โฟลเดอร์: ['folder'], ดาวน์โหลด: ['download'], อัปโหลด: ['upload'], แชร์: ['share'],
  ผลไม้: ['fruit', 'apple', 'banana'], แอปเปิล: ['apple'], กล้วย: ['banana'], พิซซ่า: ['pizza'], ไอศกรีม: ['ice-cream', 'ice cream'], มือ: ['hand'], นิ้วโป้ง: ['thumbs', 'thumb'], ไลก์: ['thumbs up', 'thumb-up'],
};

/// คำค้น (ไทย/อังกฤษ) → รายการคำอังกฤษที่จะเทียบกับแท็ก
export function searchTerms(query: string): string[] {
  const q = query.trim().toLowerCase();

  if (!q) return [];

  const out = new Set<string>([q]);

  for (const [th, en] of Object.entries(TH_KEYWORDS)) {
    if (q.includes(th) || th.includes(q)) en.forEach((e) => out.add(e));
  }

  return [...out];
}

export function matchIcon(icon: LibraryIcon, terms: string[]): boolean {
  const hay = `${icon.n} ${icon.t} ${ICON_CATEGORY_TH[icon.c] ?? ''}`.toLowerCase();

  return terms.some((t) => hay.includes(t));
}

export function matchSticker(s: LibrarySticker, terms: string[]): boolean {
  const hay = `${s.n} ${s.g}`.toLowerCase();

  return terms.some((t) => hay.includes(t));
}

export function matchPhoto(p: LibraryPhoto, terms: string[]): boolean {
  const hay = `${p.title} ${p.g} ${p.credit}`.toLowerCase();

  return terms.some((t) => hay.includes(t));
}
