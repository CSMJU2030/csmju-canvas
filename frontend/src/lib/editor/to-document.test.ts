import { describe, expect, it } from 'vitest';
import { createText } from './factory';
import { A4, designToDocument, estimateTextHeight } from './to-document';
import type { DesignDocument, TextElement } from './types';

/// "แปลงเป็นเอกสาร" — ข้อความเรียงตามลำดับอ่าน · ตัวใหญ่เป็นหัวเรื่อง · ล้นแล้วขึ้นหน้าใหม่

const page = { width: 1920, height: 1080 };

function text(value: string, x: number, y: number, preset: 'heading' | 'body'): TextElement {
  return { ...createText(page, preset, { text: value }), x, y };
}

describe('designToDocument', () => {
  it('เรียงบนลงล่าง ซ้ายไปขวา ข้ามหน้า · หัวเรื่องตัวใหญ่หนา เนื้อความตัวปกติ', () => {
    const doc: DesignDocument = {
      version: 1,
      pages: [
        { id: 'p1', background: null, elements: [text('เนื้อหาขวา', 900, 500, 'body'), text('หัวเรื่องหลัก', 100, 100, 'heading'), text('เนื้อหาซ้าย', 100, 500, 'body')] },
        { id: 'p2', background: null, elements: [text('หน้าสอง', 100, 100, 'body')] },
      ],
    };
    const out = designToDocument(doc, page);
    const texts = out.pages.flatMap((p) => p.elements) as TextElement[];

    expect(texts.map((t) => t.text)).toEqual(['หัวเรื่องหลัก', 'เนื้อหาซ้าย', 'เนื้อหาขวา', 'หน้าสอง']);
    expect(texts[0].fontSize).toBeGreaterThan(texts[1].fontSize);
    expect(texts[0].fontWeight).toBe(700);
    expect(texts.every((t) => t.x === 72 && t.width === A4.width - 144 && t.align === 'left')).toBe(true);
    expect(texts[1].y).toBeGreaterThan(texts[0].y);
  });

  it('ข้อความยาวล้น A4 → ขึ้นหน้าใหม่ ไม่มีชิ้นไหนเลยขอบล่าง', () => {
    const long = 'ข้อความยาว '.repeat(260);
    const doc: DesignDocument = { version: 1, pages: [{ id: 'p', background: null, elements: [0, 1, 2, 3].map((i) => text(long, 100, i * 200, 'body')) }] };
    const out = designToDocument(doc, page);

    expect(out.pages.length).toBeGreaterThan(1);
    for (const p of out.pages) for (const el of p.elements) expect(el.y + el.height).toBeLessThanOrEqual(A4.height);
  });

  it('ประมาณความสูงตามจำนวนบรรทัด', () => {
    expect(estimateTextHeight('ก', 16, 650)).toBe(24);
    expect(estimateTextHeight('a\nb', 16, 650)).toBe(48);
  });
});
