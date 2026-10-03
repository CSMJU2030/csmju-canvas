/// เทมเพลตตั้งต้นของ CS Canvas — ออกแบบโดยทีม CS Canvas สำหรับงานจริงของสาขา
///
/// ข้อความในเทมเพลตเป็นตัวอย่างให้ผู้ใช้แก้ (เช่น "ชื่อ-นามสกุล") ไม่ใช่ข้อมูลของบุคคลจริง
/// id คงที่เพื่อให้รัน seed ซ้ำได้โดยไม่สร้างซ้ำ (upsert)

type Json = Record<string, unknown>;

let counter = 0;

function id(prefix: string) {
  counter += 1;
  return `${prefix}-${counter.toString(36).padStart(4, '0')}`;
}

const base = (name: string, x: number, y: number, width: number, height: number) => ({
  id: id('el'),
  name,
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  groupId: null,
});

interface TextOpts {
  weight?: 400 | 700;
  color?: string;
  align?: 'left' | 'center' | 'right';
  font?: string;
  lineHeight?: number;
  lines?: number;
  italic?: boolean;
  spacing?: number;
}

function text(value: string, x: number, y: number, width: number, size: number, o: TextOpts = {}): Json {
  const lineHeight = o.lineHeight ?? 1.4;
  const lines = o.lines ?? value.split('\n').length;

  return {
    ...base(value.split('\n')[0].slice(0, 30), x, y, width, Math.round(size * lineHeight * lines)),
    type: 'text',
    text: value,
    fontFamily: o.font ?? 'Noto Sans Thai',
    fontSize: size,
    fontWeight: o.weight ?? 400,
    italic: o.italic ?? false,
    underline: false,
    align: o.align ?? 'left',
    lineHeight,
    letterSpacing: o.spacing ?? 0,
    color: o.color ?? 'rgb(15 23 42)',
  };
}

function rect(x: number, y: number, width: number, height: number, fill: string | null, o: { radius?: number; stroke?: string; strokeWidth?: number; opacity?: number } = {}): Json {
  return {
    ...base('สี่เหลี่ยม', x, y, width, height),
    opacity: o.opacity ?? 1,
    type: 'shape',
    shape: 'rect',
    fill,
    stroke: o.stroke ?? null,
    strokeWidth: o.strokeWidth ?? 0,
    cornerRadius: o.radius ?? 0,
  };
}

function ellipse(x: number, y: number, width: number, height: number, fill: string, opacity = 1): Json {
  return { ...base('วงรี', x, y, width, height), opacity, type: 'shape', shape: 'ellipse', fill, stroke: null, strokeWidth: 0, cornerRadius: 0 };
}

function line(x: number, y: number, width: number, color: string, strokeWidth = 3): Json {
  return { ...base('เส้นตรง', x, y, width, Math.max(8, strokeWidth * 2)), type: 'shape', shape: 'line', fill: null, stroke: color, strokeWidth, cornerRadius: 0 };
}

/// ไอคอนแบบเส้น (ชุดเดียวกับ lucide ที่ใช้ใน editor) — เก็บ markup ทั้งก้อน
const ICON_PATHS: Record<string, string> = {
  graduation:
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  mapPin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  phone:
    '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  lightbulb:
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
};

function icon(name: keyof typeof ICON_PATHS, x: number, y: number, size: number, color: string): Json {
  return {
    ...base(name, x, y, size, size),
    type: 'svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`,
    color,
  };
}

const NAVY = 'rgb(0 46 92)';
const BLUE = 'rgb(0 76 153)';
const SKY = 'rgb(14 165 233)';
const TEAL = 'rgb(20 184 166)';
const AMBER = 'rgb(245 158 11)';
const INK = 'rgb(15 23 42)';
const SLATE = 'rgb(71 85 105)';
const MIST = 'rgb(241 245 251)';
const WHITE = 'rgb(255 255 255)';
const GOLD = 'rgb(180 134 40)';

function page(background: string | null, elements: Json[]): Json {
  return { id: id('page'), background, elements };
}

function doc(...pages: Json[]): Json {
  return { version: 1, pages };
}

export interface BuiltinTemplate {
  id: string;
  title: string;
  description: string;
  designType: string;
  category: string;
  width: number;
  height: number;
  document: Json;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000001',
    title: 'สไลด์นำเสนอโครงงาน',
    description: 'สามหน้า: หน้าปก ที่มาและวัตถุประสงค์ และขั้นตอนการพัฒนา — เหมาะกับการสอบโครงงาน',
    designType: 'presentation',
    category: 'education',
    width: 1920,
    height: 1080,
    document: doc(
      page(NAVY, [
        ellipse(1300, -260, 900, 900, BLUE, 0.6),
        ellipse(1540, 640, 520, 520, SKY, 0.35),
        icon('code', 160, 200, 96, SKY),
        text('ชื่อโครงงานของคุณ\nแบบสั้นและสื่อความหมาย', 160, 340, 1200, 92, { weight: 700, color: WHITE, lineHeight: 1.25, font: 'Prompt' }),
        line(160, 610, 220, AMBER, 8),
        text('ผู้จัดทำ: ชื่อ-นามสกุล · รหัสนักศึกษา', 160, 660, 1200, 40, { color: 'rgb(203 213 225)' }),
        text('อาจารย์ที่ปรึกษา: ชื่ออาจารย์', 160, 720, 1200, 40, { color: 'rgb(203 213 225)' }),
        text('สาขาวิชาวิทยาการคอมพิวเตอร์ · ปีการศึกษา 2569', 160, 900, 1400, 32, { color: 'rgb(148 163 184)' }),
      ]),
      page(WHITE, [
        rect(0, 0, 24, 1080, BLUE),
        text('ที่มาและความสำคัญ', 140, 110, 1200, 72, { weight: 700, color: NAVY, font: 'Prompt' }),
        text('อธิบายปัญหาที่พบ ใครได้รับผลกระทบ และเหตุใดโครงงานนี้จึงช่วยแก้ปัญหาได้ ใช้ประโยคสั้นและข้อมูลที่ตรวจสอบได้', 140, 230, 1600, 40, { color: SLATE, lines: 2, lineHeight: 1.6 }),
        rect(140, 420, 500, 480, MIST, { radius: 32 }),
        rect(710, 420, 500, 480, MIST, { radius: 32 }),
        rect(1280, 420, 500, 480, MIST, { radius: 32 }),
        icon('lightbulb', 190, 470, 80, BLUE),
        icon('users', 760, 470, 80, BLUE),
        icon('rocket', 1330, 470, 80, BLUE),
        text('วัตถุประสงค์ข้อที่ 1', 190, 590, 400, 40, { weight: 700, color: INK }),
        text('วัตถุประสงค์ข้อที่ 2', 760, 590, 400, 40, { weight: 700, color: INK }),
        text('วัตถุประสงค์ข้อที่ 3', 1330, 590, 400, 40, { weight: 700, color: INK }),
        text('สิ่งที่โครงงานจะทำให้เกิดขึ้น วัดผลได้อย่างไร', 190, 660, 400, 30, { color: SLATE, lines: 3, lineHeight: 1.5 }),
        text('สิ่งที่โครงงานจะทำให้เกิดขึ้น วัดผลได้อย่างไร', 760, 660, 400, 30, { color: SLATE, lines: 3, lineHeight: 1.5 }),
        text('สิ่งที่โครงงานจะทำให้เกิดขึ้น วัดผลได้อย่างไร', 1330, 660, 400, 30, { color: SLATE, lines: 3, lineHeight: 1.5 }),
      ]),
      page(WHITE, [
        text('ขั้นตอนการพัฒนา', 140, 110, 1200, 72, { weight: 700, color: NAVY, font: 'Prompt' }),
        line(220, 520, 1480, 'rgb(203 213 225)', 6),
        ellipse(180, 440, 160, 160, BLUE),
        ellipse(660, 440, 160, 160, SKY),
        ellipse(1140, 440, 160, 160, TEAL),
        ellipse(1620, 440, 160, 160, AMBER),
        text('1', 180, 475, 160, 64, { weight: 700, color: WHITE, align: 'center' }),
        text('2', 660, 475, 160, 64, { weight: 700, color: WHITE, align: 'center' }),
        text('3', 1140, 475, 160, 64, { weight: 700, color: WHITE, align: 'center' }),
        text('4', 1620, 475, 160, 64, { weight: 700, color: WHITE, align: 'center' }),
        text('ศึกษาและเก็บ\nความต้องการ', 110, 660, 300, 34, { align: 'center', color: INK, weight: 700 }),
        text('ออกแบบระบบ\nและฐานข้อมูล', 590, 660, 300, 34, { align: 'center', color: INK, weight: 700 }),
        text('พัฒนา\nและทดสอบ', 1070, 660, 300, 34, { align: 'center', color: INK, weight: 700 }),
        text('นำไปใช้งาน\nและประเมินผล', 1550, 660, 300, 34, { align: 'center', color: INK, weight: 700 }),
      ]),
    ),
  },
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000002',
    title: 'ปกรายงานวิชาการ',
    description: 'ปกรายงาน A4 แบบเรียบ มีช่องชื่อเรื่อง ผู้จัดทำ รายวิชา และอาจารย์ผู้สอน',
    designType: 'report-cover',
    category: 'education',
    width: 794,
    height: 1123,
    document: doc(
      page(WHITE, [
        rect(0, 0, 794, 300, NAVY),
        rect(0, 300, 794, 12, AMBER),
        icon('graduation', 357, 80, 80, WHITE),
        text('รายงาน', 60, 190, 674, 44, { weight: 700, color: WHITE, align: 'center', font: 'Sarabun', spacing: 4 }),
        text('ชื่อเรื่องของรายงาน\nพิมพ์ได้สองบรรทัด', 60, 420, 674, 44, { weight: 700, color: INK, align: 'center', font: 'Sarabun', lineHeight: 1.4 }),
        line(297, 570, 200, BLUE, 4),
        text('จัดทำโดย', 60, 640, 674, 24, { color: SLATE, align: 'center', font: 'Sarabun' }),
        text('ชื่อ-นามสกุล  รหัสนักศึกษา', 60, 685, 674, 26, { color: INK, align: 'center', font: 'Sarabun', weight: 700 }),
        text('เสนอ', 60, 780, 674, 24, { color: SLATE, align: 'center', font: 'Sarabun' }),
        text('ชื่ออาจารย์ผู้สอน', 60, 825, 674, 26, { color: INK, align: 'center', font: 'Sarabun', weight: 700 }),
        text('รายงานนี้เป็นส่วนหนึ่งของรายวิชา รหัสวิชา ชื่อวิชา\nสาขาวิชาวิทยาการคอมพิวเตอร์ ภาคเรียนที่ 1 ปีการศึกษา 2569', 60, 960, 674, 20, { color: SLATE, align: 'center', font: 'Sarabun', lineHeight: 1.6 }),
      ]),
    ),
  },
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000003',
    title: 'เกียรติบัตรการแข่งขัน',
    description: 'เกียรติบัตร A4 แนวนอน กรอบทอง แก้ชื่อผู้รับ รางวัล และวันที่ได้ทันที',
    designType: 'certificate',
    category: 'event',
    width: 1123,
    height: 794,
    document: doc(
      page('rgb(253 251 245)', [
        rect(30, 30, 1063, 734, null, { stroke: GOLD, strokeWidth: 6 }),
        rect(50, 50, 1023, 694, null, { stroke: GOLD, strokeWidth: 2 }),
        icon('award', 516, 90, 90, GOLD),
        text('เกียรติบัตร', 100, 200, 923, 72, { weight: 700, color: NAVY, align: 'center', font: 'Charmonman' }),
        text('ฉบับนี้มอบให้เพื่อแสดงว่า', 100, 310, 923, 28, { color: SLATE, align: 'center', font: 'Sarabun' }),
        text('ชื่อ-นามสกุล ผู้รับเกียรติบัตร', 100, 360, 923, 52, { weight: 700, color: INK, align: 'center', font: 'Sarabun' }),
        line(311, 445, 500, GOLD, 2),
        text('ได้รับรางวัลชนะเลิศ การแข่งขันเขียนโปรแกรม\nงานสัปดาห์วิชาการ สาขาวิชาวิทยาการคอมพิวเตอร์', 100, 470, 923, 28, { color: INK, align: 'center', font: 'Sarabun', lineHeight: 1.6 }),
        text('ให้ไว้ ณ วันที่ ... เดือน ... พ.ศ. 2569', 100, 570, 923, 24, { color: SLATE, align: 'center', font: 'Sarabun' }),
        line(160, 680, 300, SLATE, 1),
        line(663, 680, 300, SLATE, 1),
        text('ลงชื่อ ประธานสาขาวิชา', 160, 692, 300, 20, { color: SLATE, align: 'center', font: 'Sarabun' }),
        text('ลงชื่อ ประธานจัดงาน', 663, 692, 300, 20, { color: SLATE, align: 'center', font: 'Sarabun' }),
      ]),
    ),
  },
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000004',
    title: 'โปสเตอร์ประชาสัมพันธ์กิจกรรม',
    description: 'โปสเตอร์ A3 แนวตั้ง มีหัวเรื่องใหญ่ วัน เวลา สถานที่ และช่องติดต่อ',
    designType: 'poster',
    category: 'announcement',
    width: 1123,
    height: 1587,
    document: doc(
      page(NAVY, [
        ellipse(-200, -200, 900, 900, BLUE, 0.7),
        ellipse(600, 900, 900, 900, SKY, 0.25),
        rect(80, 120, 260, 64, AMBER, { radius: 32 }),
        text('ขอเชิญร่วมงาน', 80, 132, 260, 28, { weight: 700, color: INK, align: 'center' }),
        text('CS DAY\n2026', 80, 240, 963, 190, { weight: 700, color: WHITE, font: 'Kanit', lineHeight: 1.05 }),
        text('วันวิชาการสาขาวิทยาการคอมพิวเตอร์\nนิทรรศการโครงงาน · เวิร์กช็อป · แข่งขันเขียนโปรแกรม', 80, 680, 963, 44, { color: 'rgb(203 213 225)', lineHeight: 1.5 }),
        rect(80, 900, 963, 420, WHITE, { radius: 40, opacity: 0.08 }),
        icon('calendar', 130, 960, 64, AMBER),
        icon('clock', 130, 1080, 64, AMBER),
        icon('mapPin', 130, 1200, 64, AMBER),
        text('วันที่ ... เดือน ... 2569', 230, 968, 760, 44, { weight: 700, color: WHITE }),
        text('09:00 – 16:00 น.', 230, 1088, 760, 44, { weight: 700, color: WHITE }),
        text('อาคาร ... ห้อง ...', 230, 1208, 760, 44, { weight: 700, color: WHITE }),
        text('สอบถามเพิ่มเติม: สโมสรนักศึกษาสาขาวิทยาการคอมพิวเตอร์', 80, 1440, 963, 30, { color: 'rgb(148 163 184)' }),
      ]),
    ),
  },
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000005',
    title: 'เรซูเม่นักศึกษาฝึกงาน',
    description: 'Resume A4 แถบซ้ายสำหรับข้อมูลติดต่อและทักษะ ฝั่งขวาสำหรับการศึกษาและโครงงาน',
    designType: 'resume',
    category: 'career',
    width: 794,
    height: 1123,
    document: doc(
      page(WHITE, [
        rect(0, 0, 260, 1123, NAVY),
        ellipse(60, 50, 140, 140, 'rgb(51 65 85)'),
        text('รูปถ่าย', 60, 105, 140, 22, { color: 'rgb(148 163 184)', align: 'center' }),
        text('ติดต่อ', 30, 240, 200, 22, { weight: 700, color: AMBER, spacing: 1 }),
        icon('mail', 30, 290, 24, WHITE),
        icon('phone', 30, 335, 24, WHITE),
        icon('mapPin', 30, 380, 24, WHITE),
        text('อีเมลของคุณ', 66, 290, 180, 16, { color: WHITE }),
        text('เบอร์โทรศัพท์', 66, 335, 180, 16, { color: WHITE }),
        text('จังหวัด', 66, 380, 180, 16, { color: WHITE }),
        text('ทักษะ', 30, 460, 200, 22, { weight: 700, color: AMBER, spacing: 1 }),
        text('• ภาษาโปรแกรม\n• เฟรมเวิร์ก\n• ฐานข้อมูล\n• เครื่องมือ\n• การทำงานเป็นทีม', 30, 505, 210, 17, { color: WHITE, lineHeight: 1.9 }),
        text('ภาษา', 30, 740, 200, 22, { weight: 700, color: AMBER, spacing: 1 }),
        text('ไทย (ภาษาแม่)\nอังกฤษ (ระดับ)', 30, 785, 210, 17, { color: WHITE, lineHeight: 1.9 }),
        text('ชื่อ นามสกุล', 300, 60, 460, 44, { weight: 700, color: NAVY, font: 'Prompt' }),
        text('นักศึกษาวิทยาการคอมพิวเตอร์ · หาที่ฝึกงานตำแหน่ง ...', 300, 125, 460, 18, { color: SLATE }),
        line(300, 175, 460, AMBER, 4),
        text('เกี่ยวกับฉัน', 300, 210, 460, 22, { weight: 700, color: NAVY }),
        text('สรุปตัวเองใน 2–3 บรรทัด: สนใจด้านใด ถนัดอะไร และอยากเรียนรู้อะไรจากการฝึกงาน', 300, 250, 460, 16, { color: SLATE, lines: 3, lineHeight: 1.7 }),
        text('การศึกษา', 300, 370, 460, 22, { weight: 700, color: NAVY }),
        text('วิทยาศาสตรบัณฑิต สาขาวิชาวิทยาการคอมพิวเตอร์', 300, 410, 460, 17, { weight: 700, color: INK }),
        text('ชื่อมหาวิทยาลัย · ปีที่เข้าศึกษา – ปัจจุบัน · เกรดเฉลี่ย ...', 300, 440, 460, 15, { color: SLATE }),
        text('โครงงานและผลงาน', 300, 520, 460, 22, { weight: 700, color: NAVY }),
        text('ชื่อโครงงาน', 300, 560, 460, 17, { weight: 700, color: INK }),
        text('อธิบายสิ่งที่ทำ เทคโนโลยีที่ใช้ และผลลัพธ์ที่วัดได้', 300, 590, 460, 15, { color: SLATE, lines: 2, lineHeight: 1.6 }),
        text('ชื่อโครงงาน', 300, 670, 460, 17, { weight: 700, color: INK }),
        text('อธิบายสิ่งที่ทำ เทคโนโลยีที่ใช้ และผลลัพธ์ที่วัดได้', 300, 700, 460, 15, { color: SLATE, lines: 2, lineHeight: 1.6 }),
        text('กิจกรรม', 300, 790, 460, 22, { weight: 700, color: NAVY }),
        text('• กิจกรรมหรือการแข่งขันที่เข้าร่วม (ปี)\n• บทบาทในชมรม/สโมสร (ปี)', 300, 830, 460, 15, { color: SLATE, lineHeight: 1.8 }),
      ]),
    ),
  },
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000006',
    title: 'อินโฟกราฟิกขั้นตอน 4 ข้อ',
    description: 'อินโฟกราฟิกแนวตั้งสำหรับอธิบายขั้นตอนหรือกระบวนการ เหมาะกับสื่อการสอน',
    designType: 'infographic',
    category: 'education',
    width: 800,
    height: 2000,
    document: doc(
      page(MIST, [
        rect(0, 0, 800, 420, BLUE),
        text('หัวข้ออินโฟกราฟิก', 60, 110, 680, 60, { weight: 700, color: WHITE, align: 'center', font: 'Prompt' }),
        text('คำอธิบายสั้น ๆ ว่าอินโฟกราฟิกนี้ช่วยให้ผู้อ่านเข้าใจอะไร', 60, 220, 680, 26, { color: 'rgb(219 234 254)', align: 'center', lines: 2, lineHeight: 1.5 }),
        ...[0, 1, 2, 3].flatMap((i) => {
          const y = 500 + i * 340;
          const colors = [BLUE, SKY, TEAL, AMBER];

          return [
            rect(60, y, 680, 290, WHITE, { radius: 32 }),
            ellipse(100, y + 40, 110, 110, colors[i]),
            text(String(i + 1), 100, y + 65, 110, 52, { weight: 700, color: WHITE, align: 'center' }),
            text(`ขั้นตอนที่ ${i + 1}`, 250, y + 50, 450, 34, { weight: 700, color: INK }),
            text('อธิบายสิ่งที่ต้องทำในขั้นตอนนี้ด้วยประโยคสั้น ๆ และตัวอย่างที่เห็นภาพ', 250, y + 110, 450, 22, { color: SLATE, lines: 3, lineHeight: 1.6 }),
          ];
        }),
        text('ที่มา: ระบุแหล่งข้อมูลที่ตรวจสอบได้', 60, 1900, 680, 20, { color: SLATE, align: 'center' }),
      ]),
    ),
  },
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000007',
    title: 'โพสต์ประกาศข่าวสาขา',
    description: 'โพสต์ 4:5 สำหรับเพจหรือกลุ่มของสาขา ใช้ประกาศข่าว กำหนดส่ง หรือรับสมัคร',
    designType: 'instagram-post',
    category: 'social',
    width: 1080,
    height: 1350,
    document: doc(
      page(WHITE, [
        rect(0, 0, 1080, 1350, MIST),
        rect(60, 60, 960, 1230, WHITE, { radius: 48 }),
        rect(60, 60, 960, 360, BLUE, { radius: 48 }),
        rect(60, 300, 960, 120, BLUE),
        icon('star', 120, 120, 72, AMBER),
        text('ประกาศ', 120, 220, 840, 96, { weight: 700, color: WHITE, font: 'Kanit' }),
        text('หัวข้อประกาศที่ต้องการให้เห็นชัด', 120, 480, 840, 56, { weight: 700, color: INK, lines: 2, lineHeight: 1.3 }),
        text('รายละเอียดสั้น ๆ: ใคร ทำอะไร เมื่อไร ที่ไหน และต้องเตรียมอะไร', 120, 650, 840, 36, { color: SLATE, lines: 3, lineHeight: 1.6 }),
        icon('check', 120, 860, 48, TEAL),
        icon('check', 120, 940, 48, TEAL),
        icon('check', 120, 1020, 48, TEAL),
        text('ข้อสำคัญข้อที่ 1', 190, 862, 780, 36, { color: INK }),
        text('ข้อสำคัญข้อที่ 2', 190, 942, 780, 36, { color: INK }),
        text('ข้อสำคัญข้อที่ 3', 190, 1022, 780, 36, { color: INK }),
        text('สาขาวิชาวิทยาการคอมพิวเตอร์', 120, 1170, 840, 28, { color: BLUE, weight: 700 }),
      ]),
    ),
  },
  {
    id: '6f1c2a10-0d1e-4c6a-9a11-000000000008',
    title: 'สไลด์สื่อการสอนบทเรียน',
    description: 'สไลด์บรรยายสำหรับอาจารย์: หน้าหัวข้อบท และหน้าเนื้อหาพร้อมประเด็นสำคัญ',
    designType: 'presentation',
    category: 'education',
    width: 1920,
    height: 1080,
    document: doc(
      page(WHITE, [
        rect(0, 0, 760, 1080, BLUE),
        text('บทที่ 1', 120, 360, 560, 56, { weight: 700, color: AMBER, font: 'Prompt' }),
        text('ชื่อหัวข้อ\nบทเรียน', 120, 450, 560, 96, { weight: 700, color: WHITE, font: 'Prompt', lineHeight: 1.2 }),
        text('รหัสวิชา ชื่อวิชา', 880, 420, 900, 48, { weight: 700, color: INK }),
        text('ผู้สอน: ชื่ออาจารย์\nภาคเรียนที่ 1/2569', 880, 500, 900, 36, { color: SLATE, lineHeight: 1.6 }),
        icon('graduation', 880, 700, 96, BLUE),
      ]),
      page(WHITE, [
        rect(0, 0, 1920, 160, MIST),
        text('หัวข้อของสไลด์นี้', 120, 45, 1600, 60, { weight: 700, color: NAVY, font: 'Prompt' }),
        icon('check', 120, 280, 56, BLUE),
        icon('check', 120, 440, 56, BLUE),
        icon('check', 120, 600, 56, BLUE),
        text('ประเด็นสำคัญข้อที่ 1 — อธิบายสั้น ๆ', 210, 282, 1500, 44, { color: INK }),
        text('ประเด็นสำคัญข้อที่ 2 — อธิบายสั้น ๆ', 210, 442, 1500, 44, { color: INK }),
        text('ประเด็นสำคัญข้อที่ 3 — อธิบายสั้น ๆ', 210, 602, 1500, 44, { color: INK }),
        rect(120, 800, 1680, 160, 'rgb(254 243 199)', { radius: 24 }),
        text('ข้อควรจำ: สรุปสิ่งที่ผู้เรียนต้องจำได้จากสไลด์นี้ในประโยคเดียว', 170, 850, 1580, 40, { color: 'rgb(146 64 14)', weight: 700 }),
      ]),
    ),
  },
];
