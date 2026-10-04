/// ป้ายสีและภาษาของเทมเพลต — คำนวณจาก JSON state ตอนบันทึก ใช้กับตัวกรอง "สี" และ "ภาษา"
///
/// สีจัดเป็น 13 กลุ่มตามชุดสีของตัวกรอง (ภาพบรีฟ "พรีเซนเทชั่น 1.1") ด้วยค่า HSL
/// นับเฉพาะสีที่เขียนไว้ใน document (พื้นหลังหน้า ตัวอักษร รูปทรง ไอคอน เส้นวาด) ไม่วิเคราะห์พิกเซลของรูป

export const COLOR_TAGS = ['gray', 'blue', 'sky', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'white', 'black'] as const;
export const LANGUAGE_TAGS = ['th', 'en'] as const;

export type ColorTag = (typeof COLOR_TAGS)[number];

/// อ่านสี CSS ที่ editor เขียน: rgb(r g b) · rgb(r, g, b) · rgba(...) · #rgb · #rrggbb
export function parseColor(value: string): [number, number, number] | null {
  const text = value.trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);

  if (hex) {
    const raw = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];

    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }

  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);

  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  return null;
}

export function classifyColor([r, g, b]: [number, number, number]): ColorTag {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (l >= 0.93) return 'white';
  if (l <= 0.12) return 'black';
  if (s < 0.15) return l > 0.85 ? 'white' : 'gray';

  let h = 0;

  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = (h * 60 + 360) % 360;

  if (h < 15 || h >= 345) return 'red';
  if (h < 40) return 'orange';
  if (h < 62) return 'yellow';
  if (h < 85) return 'lime';
  if (h < 160) return 'green';
  if (h < 185) return 'teal';
  if (h < 215) return 'sky';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';

  return 'pink';
}

interface LooseElement {
  type?: unknown;
  text?: unknown;
  color?: unknown;
  fill?: unknown;
  stroke?: unknown;
}

export function templateTags(document: unknown): { colorTags: string[]; languageTags: string[] } {
  const colors = new Set<ColorTag>();
  const languages = new Set<string>();
  const pages = (document as { pages?: unknown } | null)?.pages;
  const addColor = (value: unknown) => {
    if (typeof value !== 'string') return;

    const rgb = parseColor(value);

    if (rgb) colors.add(classifyColor(rgb));
  };

  for (const page of Array.isArray(pages) ? pages : []) {
    const p = page as { background?: unknown; elements?: unknown };

    addColor(p.background);

    for (const element of Array.isArray(p.elements) ? (p.elements as LooseElement[]) : []) {
      addColor(element.color);
      addColor(element.fill);
      addColor(element.stroke);

      if (element.type === 'text' && typeof element.text === 'string') {
        if (/[฀-๿]/.test(element.text)) languages.add('th');
        if (/[A-Za-z]/.test(element.text)) languages.add('en');
      }
    }
  }

  return {
    colorTags: COLOR_TAGS.filter((tag) => colors.has(tag)),
    languageTags: LANGUAGE_TAGS.filter((tag) => languages.has(tag)),
  };
}
