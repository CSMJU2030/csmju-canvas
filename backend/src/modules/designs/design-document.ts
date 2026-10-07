import { BadRequestException } from '@nestjs/common';

/// รูปแบบ JSON state ของผืนผ้าใบ (เวอร์ชัน 1) — ดู docs/design-document.md
///
///   { "version": 1, "pages": [ { "id", "background", "elements": [...] } ] }
///
/// backend ตรวจแค่โครงชั้นนอกกับขนาด ไม่ตรวจทุก element — ตัว element เป็นของ editor
/// และ CMS ที่ render ต้องข้าม element ชนิดที่ไม่รู้จักได้อยู่แล้ว
export const DOCUMENT_VERSION = 1;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_PAGES = 100;
export const MAX_ELEMENTS_PER_PAGE = 1000;

export function emptyDocument(background = 'rgb(255 255 255)') {
  return {
    version: DOCUMENT_VERSION,
    pages: [{ id: 'page-1', background, elements: [] }],
  };
}

export function assertDocument(document: Record<string, unknown>): void {
  if (document.version !== DOCUMENT_VERSION) {
    throw new BadRequestException(`document.version ต้องเป็น ${DOCUMENT_VERSION}`);
  }

  const pages = document.pages;

  if (!Array.isArray(pages) || pages.length < 1 || pages.length > MAX_PAGES) {
    throw new BadRequestException(`document.pages ต้องมี 1–${MAX_PAGES} หน้า`);
  }

  for (const page of pages as unknown[]) {
    const elements = (page as { elements?: unknown } | null)?.elements;

    if (!Array.isArray(elements) || elements.length > MAX_ELEMENTS_PER_PAGE) {
      throw new BadRequestException(
        `ทุกหน้าต้องมี elements เป็นอาร์เรย์ ไม่เกิน ${MAX_ELEMENTS_PER_PAGE} ชิ้น`,
      );
    }
  }

  if (Buffer.byteLength(JSON.stringify(document), 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new BadRequestException('งานนี้ใหญ่เกิน 4 MB — ลดจำนวนหน้าหรือชิ้นงานลง');
  }
}
