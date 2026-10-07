import { describe, expect, it } from 'vitest';
import { applyStyleFonts, paletteMapping, recolorDocument, rotateAccents } from './design-styles';
import { createShape, createText } from './factory';
import { calendarGrid, harmonyGradient, harmonyPalette, hslToRgb, parseRgb, patternSvg, PATTERNS, rgbToHsl, thaiMonthTitle } from './generators';
import { blankPage, type DesignDocument, type ShapeElement, type TextElement } from './types';

const SIZE = { width: 1000, height: 600 };

describe('ตัวสร้าง', () => {
  it('อ่านสีได้ทั้ง rgb() และรหัส # · แปลง HSL ไปกลับได้ใกล้เคียงเดิม', () => {
    expect(parseRgb('rgb(0 76 153)')).toEqual([0, 76, 153]);
    expect(parseRgb('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
    expect(parseRgb(['#', 'fa0'].join(''))).toEqual([255, 170, 0]);
    expect(parseRgb('ไม่ใช่สี')).toBeNull();

    const [h, s, l] = rgbToHsl([0, 76, 153]);
    const back = hslToRgb(h, s, l);

    back.forEach((v, i) => expect(Math.abs(v - [0, 76, 153][i])).toBeLessThanOrEqual(1));
  });

  it('ชุดสีตามทฤษฎีมี 5 สี สีแรกคือสีหลัก · สีตรงข้ามอยู่ห่าง 180°', () => {
    const palette = harmonyPalette('rgb(0 76 153)', 'complementary');

    expect(palette).toHaveLength(5);
    expect(palette[0]).toBe('rgb(0 76 153)');

    const hue = (c: string) => rgbToHsl(parseRgb(c)!)[0];
    const diff = Math.abs(hue(palette[1]) - hue(palette[0]));

    expect(Math.abs(diff - 180)).toBeLessThan(3);
    expect(harmonyGradient('rgb(0 76 153)', 40, 135)).toMatch(/^linear-gradient\(135deg, rgb/);
  });

  it('ลายซ้ำทุกแบบเป็น SVG ที่ใช้ currentColor', () => {
    for (const { key } of PATTERNS) {
      const svg = patternSvg(key, 800, 600, 12);

      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('currentColor');
      expect(svg).toContain('viewBox="0 0 800 600"');
    }
  });

  it('ปฏิทิน ต.ค. 2026 เริ่มวันพฤหัส · เริ่มจันทร์ได้ · ชื่อเดือนเป็น พ.ศ.', () => {
    const sun = calendarGrid(2026, 9, false);

    expect(sun[0][0]).toBe('อา.');
    expect(sun[1].indexOf('1')).toBe(4);
    expect(sun.flat()).toContain('31');
    expect(sun.slice(1).every((row) => row.length === 7)).toBe(true);

    const mon = calendarGrid(2026, 9, true);

    expect(mon[0][0]).toBe('จ.');
    expect(mon[1].indexOf('1')).toBe(3);
    expect(thaiMonthTitle(2026, 9)).toBe('ตุลาคม 2569');
  });
});

describe('สไตล์ทั้งงาน', () => {
  const doc = (): DesignDocument => {
    const title: TextElement = { ...createText(SIZE, 'heading'), color: 'rgb(0 0 0)', fontSize: 80 };
    const body: TextElement = { ...createText(SIZE, 'body'), color: 'rgb(0 0 0)', fontSize: 24 };
    const backdrop: ShapeElement = { ...createShape(SIZE, 'rect'), x: 0, y: 0, width: 1000, height: 600, fill: 'rgb(200 200 200)' };
    const accent: ShapeElement = { ...createShape(SIZE, 'ellipse'), fill: 'rgb(0 0 0)' };
    const locked: ShapeElement = { ...createShape(SIZE, 'rect'), fill: 'rgb(1 2 3)', locked: true };

    return { version: 1, pages: [{ ...blankPage('rgb(255 255 255)'), elements: [backdrop, accent, title, body, locked] }] };
  };

  it('เปลี่ยนสีตามบทบาท: พื้นหลัง/ตัวอักษร/สีเน้น แยกกันแม้เป็นสีเดิม · ชิ้นที่ล็อกไม่เปลี่ยน', () => {
    const colors = ['rgb(10 10 10)', 'rgb(250 250 250)', 'rgb(255 0 0)', 'rgb(0 255 0)', 'rgb(0 0 255)'];
    const source = doc();
    const out = recolorDocument(source, paletteMapping(source, colors, SIZE), SIZE);
    const [backdrop, accent, title, body, locked] = out.pages[0].elements as [ShapeElement, ShapeElement, TextElement, TextElement, ShapeElement];

    expect(out.pages[0].background).toBe('rgb(10 10 10)');
    expect(backdrop.fill).toBe('rgb(255 0 0)');
    expect(title.color).toBe('rgb(250 250 250)');
    expect(body.color).toBe('rgb(250 250 250)');
    expect(accent.fill).toBe('rgb(255 0 0)');
    expect(locked.fill).toBe('rgb(1 2 3)');
  });

  it('ฟอนต์หัวข้อใช้กับข้อความใหญ่ · เนื้อหาใช้กับที่เหลือ', () => {
    const out = applyStyleFonts(doc(), 'Kanit', 'Sarabun');
    const texts = out.pages[0].elements.filter((el): el is TextElement => el.type === 'text');

    expect(texts.map((t) => t.fontFamily)).toEqual(['Kanit', 'Sarabun']);
  });

  it('สุ่มสีสลับเฉพาะสีเน้น', () => {
    expect(rotateAccents(['a', 'b', 'c', 'd', 'e'], 1)).toEqual(['a', 'b', 'd', 'e', 'c']);
  });
});
