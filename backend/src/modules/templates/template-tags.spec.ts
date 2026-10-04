import { classifyColor, parseColor, templateTags } from './template-tags.js';

describe('template-tags', () => {
  it('อ่านสีได้ทั้ง rgb แบบช่องว่าง แบบจุลภาค และ hex', () => {
    expect(parseColor('rgb(0 76 153)')).toEqual([0, 76, 153]);
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('hsl(10 50% 50%)')).toBeNull();
  });

  it('จัดกลุ่มสีตามชุดสีของตัวกรอง', () => {
    expect(classifyColor([220, 38, 38])).toBe('red');
    expect(classifyColor([0, 76, 153])).toBe('sky');
    expect(classifyColor([79, 70, 229])).toBe('blue');
    expect(classifyColor([253, 204, 0])).toBe('yellow');
    expect(classifyColor([15, 23, 42])).toBe('black');
    expect(classifyColor([255, 255, 255])).toBe('white');
    expect(classifyColor([128, 128, 128])).toBe('gray');
  });

  it('เก็บสีจากพื้นหลัง ตัวอักษร และรูปทรง · ภาษาจากข้อความ', () => {
    const tags = templateTags({
      pages: [
        {
          background: 'rgb(255 255 255)',
          elements: [
            { type: 'text', text: 'สวัสดี', color: 'rgb(220 38 38)' },
            { type: 'shape', fill: 'rgb(22 163 74)', stroke: null },
          ],
        },
      ],
    });

    expect(tags).toEqual({ colorTags: ['green', 'red', 'white'], languageTags: ['th'] });
  });

  it('document เสียหายไม่ทำให้ล้ม', () => {
    expect(templateTags(null)).toEqual({ colorTags: [], languageTags: [] });
  });
});
