import { boundingBox, unionBox } from './geometry';
import { drawElement, preloadPage, renderPageToCanvas } from './render';
import type { DesignDocument, Page } from './types';

/// ส่งออกฝั่ง client ทั้งหมดด้วย Canvas API — ไม่มีไฟล์ไหนถูกส่งไปที่เซิร์ฟเวอร์

export type ExportFormat = 'png' | 'jpeg';

export interface ExportOptions {
  format: ExportFormat;
  scale: number;
  /// PNG เท่านั้น: ไม่วาดสีพื้นหลังของหน้า
  transparent: boolean;
  /// JPEG เท่านั้น: 0.5–1
  quality: number;
  pageIndexes: number[];
}

function canvasToBlob(canvas: HTMLCanvasElement, format: ExportFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('สร้างไฟล์ไม่สำเร็จ — ลองลดขนาดการส่งออก'))),
      format === 'png' ? 'image/png' : 'image/jpeg',
      quality,
    );
  });
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'cs-canvas';
}

export async function exportPages(
  doc: DesignDocument,
  size: { width: number; height: number },
  title: string,
  options: ExportOptions,
): Promise<number> {
  const name = safeFileName(title);
  const many = options.pageIndexes.length > 1;

  for (const index of options.pageIndexes) {
    const page = doc.pages[index];
    const transparent = options.format === 'png' && options.transparent;
    // JPEG ไม่มีช่องโปร่งใส — หน้าที่ไม่มีพื้นหลังจะกลายเป็นสีดำ จึงรองพื้นขาวให้
    const background = options.format === 'jpeg' && !page.background ? 'rgb(255 255 255)' : undefined;
    const canvas = await renderPageToCanvas(page, size, options.scale, { transparent, background });
    const blob = await canvasToBlob(canvas, options.format, options.quality);
    const ext = options.format === 'png' ? 'png' : 'jpg';

    download(blob, many ? `${name}-${index + 1}.${ext}` : `${name}.${ext}`);
  }

  return options.pageIndexes.length;
}

/// ภาพย่อของหน้าแรก (กว้างไม่เกิน 480px) เป็น data URL ของ JPEG — เก็บคู่กับงานในฐานข้อมูล
export async function thumbnailOf(page: Page, size: { width: number; height: number }): Promise<string> {
  const scale = Math.min(1, 480 / Math.max(size.width, size.height));
  const canvas = await renderPageToCanvas(page, size, scale, {
    background: page.background ? undefined : 'rgb(255 255 255)',
  });

  return canvas.toDataURL('image/jpeg', 0.72);
}

/// ดาวน์โหลดเฉพาะชิ้นงานที่เลือก (เมนูคลิกขวา) เป็น PNG พื้นโปร่งใส ขนาด 2 เท่า
export async function exportSelection(page: Page, ids: string[], title: string): Promise<void> {
  const picked = page.elements.filter((el) => ids.includes(el.id) && !el.hidden);
  const box = unionBox(picked.map(boundingBox));

  if (!box) return;

  await preloadPage({ ...page, elements: picked });

  const scale = Math.min(2, 8000 / Math.max(box.width, box.height));
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(box.width * scale));
  canvas.height = Math.max(1, Math.round(box.height * scale));

  const ctx = canvas.getContext('2d')!;

  ctx.scale(scale, scale);
  ctx.translate(-box.x, -box.y);
  for (const el of picked) drawElement(ctx, el);

  download(await canvasToBlob(canvas, 'png', 1), `${safeFileName(title)}-ชิ้นงาน.png`);
}
