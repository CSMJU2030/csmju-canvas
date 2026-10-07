import { DEFAULT_FONT } from './fonts';
import { newId, pageSizeOf, type CanvasElement, type DesignDocument, type ImageElement, type Page, type TextElement } from './types';

/// "แปลงเป็นเอกสาร" (เมนูปรับขนาดแบบ Canva) — ดึงเนื้อหาของงานออกมาเรียงเป็นเอกสาร A4 อ่านจากบนลงล่าง
///
///   ข้อความ  เรียงตามลำดับอ่าน (หน้า → บนลงล่าง → ซ้ายไปขวา) · ตัวใหญ่ในงานเดิม = หัวเรื่อง/หัวข้อย่อย ที่เหลือ = เนื้อความ
///   รูป      ย่อให้กว้างไม่เกินคอลัมน์ วางตามลำดับเดียวกับข้อความ
///   ล้นหน้า  ขึ้นหน้าใหม่อัตโนมัติ
///
/// ไม่ใช้ AI — ทำในเครื่องด้วยกติกาข้างบนเท่านั้น

export const A4 = { width: 794, height: 1123 };
const MARGIN = 72;
const GAP = 16;
const BODY = 16;
const SUB = 22;
const HEADING = 30;

/// ความสูงโดยประมาณของข้อความเมื่อตัดบรรทัดในความกว้างนี้ (ตัวอักษรไทย/อังกฤษเฉลี่ยกว้างราว 0.55 เท่าของขนาด)
export function estimateTextHeight(text: string, fontSize: number, width: number, lineHeight = 1.5): number {
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.55)));
  const lines = text.split('\n').reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.length / perLine)), 0);

  return Math.ceil(lines * fontSize * lineHeight);
}

function readingOrder(page: Page): CanvasElement[] {
  return [...page.elements]
    .filter((el) => !el.hidden && (el.type === 'text' || el.type === 'image'))
    .sort((a, b) => (Math.abs(a.y - b.y) < 12 ? a.x - b.x : a.y - b.y));
}

export function designToDocument(doc: DesignDocument, base: { width: number; height: number }): DesignDocument {
  const sources = doc.pages.filter((page) => !page.hidden).flatMap((page) => readingOrder(page).map((el) => ({ el, page })));
  const texts = sources.filter((s): s is { el: TextElement; page: Page } => s.el.type === 'text');
  // หัวเรื่อง = ขนาดตัวอักษรในงานเดิมใหญ่กว่าค่ากลางชัดเจน (เทียบกับขนาดหน้าของมันเอง)
  const relative = (el: TextElement, page: Page) => el.fontSize / Math.min(pageSizeOf(page, base).width, pageSizeOf(page, base).height);
  const sizes = texts.map(({ el, page }) => relative(el, page)).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;

  const column = A4.width - MARGIN * 2;
  const pages: Page[] = [];
  let current: Page = { id: newId('page'), background: 'rgb(255 255 255)', elements: [] };
  let y = MARGIN;

  const place = (height: number) => {
    if (y + height > A4.height - MARGIN && current.elements.length > 0) {
      pages.push(current);
      current = { id: newId('page'), background: 'rgb(255 255 255)', elements: [] };
      y = MARGIN;
    }

    const top = y;

    y += height + GAP;

    return top;
  };

  for (const { el, page } of sources) {
    if (el.type === 'text') {
      const text = el.text.trim();

      if (!text) continue;

      const ratio = relative(el, page);
      const fontSize = ratio > median * 1.6 ? HEADING : ratio > median * 1.2 ? SUB : BODY;
      const height = estimateTextHeight(text, fontSize, column);
      const top = place(height);

      current.elements.push({
        ...el,
        id: newId(),
        groupId: null,
        rotation: 0,
        x: MARGIN,
        y: top,
        width: column,
        height,
        text,
        fontFamily: el.fontFamily || DEFAULT_FONT,
        fontSize,
        fontWeight: fontSize > BODY ? 700 : el.fontWeight,
        align: 'left',
        lineHeight: 1.5,
        letterSpacing: 0,
        color: 'rgb(25 28 29)',
        effect: null,
        curve: 0,
        animation: null,
        animationLoop: null,
        animationExit: null,
        motionPath: null,
      });
    } else {
      const image = el as ImageElement;
      const width = Math.min(column, image.width);
      const height = Math.min(420, (image.height / Math.max(1, image.width)) * width);
      const fitWidth = (image.width / Math.max(1, image.height)) * height;
      const top = place(height);

      current.elements.push({
        ...image,
        id: newId(),
        groupId: null,
        rotation: 0,
        x: MARGIN + (column - Math.min(column, fitWidth)) / 2,
        y: top,
        width: Math.min(column, fitWidth),
        height,
        animation: null,
        animationLoop: null,
        animationExit: null,
        motionPath: null,
      });
    }
  }

  pages.push(current);

  return { version: doc.version, pages };
}
