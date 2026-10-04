import { beforeEach, describe, expect, it } from 'vitest';
import { createShape } from './factory';
import { parseGradient, gradientCss } from './paint';
import { useEditor } from './store';
import { blankDocument } from './types';

function load() {
  useEditor.getState().load(
    { designId: 'd1', title: 'งานทดสอบ', designType: 'presentation', width: 1920, height: 1080, access: 'OWNER', linkAccess: 'NONE' },
    blankDocument(),
  );
}

describe('editor store: หน้า', () => {
  beforeEach(load);

  it('หน้าขนาดเฉพาะเปลี่ยนขนาดผืนผ้าใบตอนเปิดหน้านั้น และขนาดของงานคงเดิม', () => {
    const s = useEditor.getState;

    s().addPageWithSize({ width: 1080, height: 1920 });
    expect(s().pageIndex).toBe(1);
    expect([s().width, s().height]).toEqual([1080, 1920]);
    expect([s().baseWidth, s().baseHeight]).toEqual([1920, 1080]);

    s().setPageIndex(0);
    expect([s().width, s().height]).toEqual([1920, 1080]);

    s().undo();
    expect(s().doc.pages).toHaveLength(1);
    expect([s().width, s().height]).toEqual([1920, 1080]);
  });

  it('คัดลอก/วางหน้า ได้หน้าใหม่ id ใหม่ · ลบหลายหน้าเหลืออย่างน้อยหนึ่งหน้า', () => {
    const s = useEditor.getState;

    s().addElements([createShape({ width: 1920, height: 1080 }, 'rect')]);
    s().copyPage(0);
    s().pastePage(0);
    expect(s().doc.pages).toHaveLength(2);
    expect(s().doc.pages[1].id).not.toBe(s().doc.pages[0].id);
    expect(s().doc.pages[1].elements[0].id).not.toBe(s().doc.pages[0].elements[0].id);

    s().deletePages([0, 1]);
    expect(s().doc.pages).toHaveLength(2);
    s().deletePages([1]);
    expect(s().doc.pages).toHaveLength(1);
  });

  it('เปลี่ยนสีทั้งหมดแทนทุกจุดในงาน', () => {
    const s = useEditor.getState;
    const shape = { ...createShape({ width: 1920, height: 1080 }, 'rect'), fill: 'rgb(1 2 3)' };

    s().addElements([shape]);
    s().setBackground('rgb(1 2 3)');
    expect(s().replaceColor('rgb(1 2 3)', 'rgb(9 9 9)', 'all')).toBe(2);
    expect(s().doc.pages[0].background).toBe('rgb(9 9 9)');
  });

  it('คัดลอกสไตล์จากรูปทรงไปวางที่รูปทรงอื่น', () => {
    const s = useEditor.getState;
    const a = { ...createShape({ width: 1920, height: 1080 }, 'rect'), fill: 'rgb(255 0 0)', cornerRadius: 20 };
    const b = createShape({ width: 1920, height: 1080 }, 'ellipse');

    s().addElements([a, b]);
    s().select([a.id]);
    s().copyStyle();
    s().pasteStyle([b.id]);

    const pasted = s().doc.pages[0].elements.find((el) => el.id === b.id);

    expect(pasted).toMatchObject({ fill: 'rgb(255 0 0)', cornerRadius: 20, shape: 'ellipse' });
  });
});

describe('paint', () => {
  it('อ่านและเขียนกราเดียนต์รูปแบบเดียวกับที่ editor เก็บ', () => {
    const css = 'linear-gradient(90deg, rgb(255 0 0) 0%, rgb(0 0 255) 100%)';
    const g = parseGradient(css)!;

    expect(g).toMatchObject({ type: 'linear', angle: 90 });
    expect(g.stops.map((s) => s.color)).toEqual(['rgb(255 0 0)', 'rgb(0 0 255)']);
    expect(gradientCss(g)).toBe(css);
  });
});

describe('export helpers', () => {
  it('อ่านช่วงหน้า "1-3, 5" และข้ามเลขที่เกินจำนวนหน้า', async () => {
    const { parsePageRange } = await import('./export');

    expect(parsePageRange('1-3, 5, 9', 6)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange('3-1', 6)).toEqual([0, 1, 2]);
  });

  it('ZIP มี CRC32 ที่ถูกต้องตามค่ามาตรฐาน', async () => {
    const { crc32 } = await import('./zip');

    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('ค้นหาและแทนที่ข้อความทุกหน้า', async () => {
    const { createText } = await import('./factory');
    const s = useEditor.getState;

    s().addElements([createText({ width: 1920, height: 1080 }, 'body', { text: 'สวัสดี ชาวโลก สวัสดี' })]);
    expect(s().replaceText('สวัสดี', 'Hello', false)).toBe(2);
    expect((s().doc.pages[0].elements.at(-1) as { text: string }).text).toBe('Hello ชาวโลก Hello');
  });
});
