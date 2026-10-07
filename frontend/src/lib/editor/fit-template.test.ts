import { describe, expect, it } from 'vitest';
import { fitTemplate } from './fit-template';
import type { DesignDocument } from './types';

const doc: DesignDocument = {
  version: 1,
  pages: [
    {
      id: 'p',
      background: 'rgb(255 255 255)',
      elements: [
        {
          id: 't', type: 'text', name: '', x: 100, y: 100, width: 800, height: 56, rotation: 0, opacity: 1, locked: false, hidden: false, groupId: null,
          text: 'หัวเรื่อง', fontFamily: 'Sarabun', fontSize: 40, fontWeight: 700, italic: false, underline: false, align: 'left', lineHeight: 1.4, letterSpacing: 0, color: 'rgb(0 0 0)',
        },
      ],
    },
  ],
};

describe('fitTemplate', () => {
  it('ย่อทั้งหน้าด้วยสัดส่วนเดียวแล้ววางกึ่งกลาง', () => {
    const fitted = fitTemplate(doc, { width: 1000, height: 1000 }, { width: 500, height: 1000 });
    const text = fitted.pages[0].elements[0];

    expect(text.type).toBe('text');
    if (text.type !== 'text') return;
    expect(text.fontSize).toBe(20);
    expect(text.x).toBe(50);
    // สูงเหลือ 500 วางกึ่งกลางแนวตั้ง → เลื่อนลง 250
    expect(text.y).toBe(300);
    expect(text.id).not.toBe('t');
  });
});
