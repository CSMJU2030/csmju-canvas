import type { CanvasElement, DesignDocument, Page } from './types';
import { newId } from './types';

/// ปรับเทมเพลตให้พอดีกับขนาดผืนผ้าใบของงานปัจจุบัน (แผง "ออกแบบ" ในหน้าแก้ไข)
///
/// ย่อ/ขยายทั้งหน้าด้วยสัดส่วนเดียว (ไม่บิดรูป) แล้ววางกึ่งกลาง — ขนาดตัวอักษร เส้นขอบ
/// และมุมโค้งย่อขยายตามด้วย · id ใหม่ทุกชิ้นเพื่อไม่ชนกับของเดิมในประวัติ undo
export function fitTemplate(
  doc: DesignDocument,
  from: { width: number; height: number },
  to: { width: number; height: number },
): DesignDocument {
  const scale = Math.min(to.width / from.width, to.height / from.height);
  const offsetX = (to.width - from.width * scale) / 2;
  const offsetY = (to.height - from.height * scale) / 2;
  const groups = new Map<string, string>();

  const fitElement = (el: CanvasElement): CanvasElement => {
    let groupId: string | null = null;

    if (el.groupId) {
      groupId = groups.get(el.groupId) ?? newId('group');
      groups.set(el.groupId, groupId);
    }

    const base = {
      ...el,
      id: newId(),
      groupId,
      x: offsetX + el.x * scale,
      y: offsetY + el.y * scale,
      width: el.width * scale,
      height: el.height * scale,
    };

    switch (el.type) {
      case 'text':
        return { ...base, type: 'text', fontSize: el.fontSize * scale, letterSpacing: el.letterSpacing * scale } as CanvasElement;
      case 'shape':
        return { ...base, type: 'shape', strokeWidth: el.strokeWidth * scale, cornerRadius: el.cornerRadius * scale } as CanvasElement;
      case 'image':
        return { ...base, type: 'image', cornerRadius: el.cornerRadius * scale } as CanvasElement;
      case 'path':
        return { ...base, type: 'path', strokeWidth: el.strokeWidth * scale } as CanvasElement;
      case 'grid':
        return { ...base, type: 'grid', gap: el.gap * scale, cornerRadius: el.cornerRadius * scale } as CanvasElement;
      default:
        return base as CanvasElement;
    }
  };

  return {
    version: 1,
    pages: doc.pages.map((page): Page => ({ id: newId('page'), background: page.background, elements: page.elements.map(fitElement) })),
  };
}
