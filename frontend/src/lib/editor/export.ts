import { boundingBox, unionBox } from './geometry';
import { buildPdf, type PdfPage } from './pdf';
import { drawElement, preloadPage, renderPageToCanvas } from './render';
import { pageToSvg } from './svg-export';
import { pageSizeOf, type DesignDocument, type Page } from './types';
import { buildZip, type ZipEntry } from './zip';

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

export type DownloadFormat = 'png' | 'jpeg' | 'pdf' | 'svg';

export interface DownloadOptions {
  format: DownloadFormat;
  /// PNG/JPEG: ขนาด × · PDF: 1 = ดิจิทัล · 2 = งานพิมพ์ (ความละเอียดสูง)
  scale: number;
  transparent: boolean;
  quality: number;
  pageIndexes: number[];
  /// PDF: แยกไฟล์ละหน้า (รวมเป็น ZIP)
  separate?: boolean;
  /// PDF: ต่อหน้าสมุดโน้ตท้ายแต่ละหน้า
  withNotes?: boolean;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/// หน้าโน้ต (PDF + รวมบันทึก) วาดเป็นภาพขนาดเท่าหน้า
function notesCanvas(page: Page, index: number, size: { width: number; height: number }, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(size.width * scale);
  canvas.height = Math.round(size.height * scale);

  const ctx = canvas.getContext('2d')!;
  const unit = Math.min(size.width, size.height) / 30;

  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgb(255 255 255)';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.fillStyle = 'rgb(15 23 42)';
  ctx.font = `700 ${unit * 1.4}px "CSC Sarabun", sans-serif`;
  ctx.fillText(`โน้ตของหน้า ${index + 1}${page.name ? ` - ${page.name}` : ''}`, unit * 2, unit * 3);
  ctx.font = `400 ${unit}px "CSC Sarabun", sans-serif`;

  let y = unit * 5;

  for (const paragraph of (page.notes ?? '').split(/\r?\n/)) {
    let line = '';

    for (const ch of paragraph) {
      if (ctx.measureText(line + ch).width > size.width - unit * 4) {
        ctx.fillText(line, unit * 2, y);
        y += unit * 1.6;
        line = '';
      }

      line += ch;
    }

    ctx.fillText(line, unit * 2, y);
    y += unit * 1.6;
  }

  return canvas;
}

/// ดาวน์โหลดตามตัวเลือก (แผงดาวน์โหลดในเมนูแชร์) · หลายไฟล์รวมเป็น .zip ไฟล์เดียว · คืนชื่อไฟล์ที่ได้
export async function downloadDesign(doc: DesignDocument, base: { width: number; height: number }, title: string, options: DownloadOptions): Promise<string> {
  const name = safeFileName(title);
  const indexes = options.pageIndexes.filter((i) => doc.pages[i]);

  if (indexes.length === 0) throw new Error('ยังไม่ได้เลือกหน้า');

  if (options.format === 'pdf') {
    const build = async (list: number[]) => {
      const pages: PdfPage[] = [];

      for (const index of list) {
        const page = doc.pages[index];
        const size = pageSizeOf(page, base);
        const canvases = [await renderPageToCanvas(page, size, options.scale, { background: page.background ? undefined : 'rgb(255 255 255)' })];

        if (options.withNotes && page.notes?.trim()) canvases.push(notesCanvas(page, index, size, options.scale));

        for (const canvas of canvases) {
          pages.push({
            jpeg: await blobBytes(await canvasToBlob(canvas, 'jpeg', 0.92)),
            imageWidth: canvas.width,
            imageHeight: canvas.height,
            width: size.width,
            height: size.height,
          });
        }
      }

      return buildPdf(pages, title);
    };

    if (options.separate && indexes.length > 1) {
      const entries: ZipEntry[] = [];

      for (const index of indexes) entries.push({ name: `${name}-${index + 1}.pdf`, data: await blobBytes(await build([index])) });
      download(buildZip(entries), `${name}.zip`);

      return `${name}.zip`;
    }

    download(await build(indexes), `${name}.pdf`);

    return `${name}.pdf`;
  }

  const entries: ZipEntry[] = [];
  const ext = options.format === 'jpeg' ? 'jpg' : options.format;

  for (const index of indexes) {
    const page = doc.pages[index];
    const size = pageSizeOf(page, base);
    let blob: Blob;

    if (options.format === 'svg') {
      blob = new Blob([await pageToSvg(page, size)], { type: 'image/svg+xml' });
    } else {
      const transparent = options.format === 'png' && options.transparent;
      const background = options.format === 'jpeg' && !page.background ? 'rgb(255 255 255)' : undefined;
      const canvas = await renderPageToCanvas(page, size, options.scale, { transparent, background });

      blob = await canvasToBlob(canvas, options.format, options.quality);
    }

    if (indexes.length === 1) {
      download(blob, `${name}.${ext}`);

      return `${name}.${ext}`;
    }

    entries.push({ name: `${name}-${index + 1}.${ext}`, data: await blobBytes(blob) });
  }

  download(buildZip(entries), `${name}.zip`);

  return `${name}.zip`;
}

/// "1-3, 5" → [0, 1, 2, 4] (เลขหน้าเริ่ม 1)
export function parsePageRange(text: string, count: number): number[] {
  const out = new Set<number>();

  for (const part of text.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);

    if (!m) continue;

    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;

    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= count) out.add(i - 1);
  }

  return [...out].sort((x, y) => x - y);
}
