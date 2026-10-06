'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage, useToast } from '@/components/csmju/primitives';
import { UploadIcon, useUploadActivity } from '@/components/shell/upload-icon';
import { api } from '@/lib/csmju/api';
import { prefersInternalPaste } from '@/lib/editor/clipboard-bridge';
import { createImage, createTable, createText } from '@/lib/editor/factory';
import { clampGrid, clampText, looksTabular, parseDelimited, planImport, pngName } from '@/lib/editor/file-import';
import { fillCell, fillSelectedFrame, type ImageSource } from '@/lib/editor/frame-actions';
import {
  originFields, originFromHints, originOfAsset, readTransferHints, recentIntent, useImportHint, useSourceIntent, type ImageOrigin,
} from '@/lib/editor/image-sources';
import { canEditDoc, useEditor } from '@/lib/editor/store';
import type { CanvasElement } from '@/lib/editor/types';
import type { Asset } from '@/lib/types';
import { useInsertMedia } from './media-panel';
import { useUploadFonts } from './my-fonts';

/// นำเข้าไฟล์จากทุกทาง: ลากไฟล์จากเครื่องมาวางบนผืนผ้าใบ/แผงอัปโหลด · วาง (Ctrl+V) รูปที่แคปหน้าจอ ไฟล์ที่คัดลอก
/// ข้อความ หรือช่องตารางจาก Excel · ลากรูปจากเว็บอื่นมาวาง — ทุกอย่างผ่าน planImport ใน lib/editor/file-import.ts

/// แผ่นบอก "ปล่อยไฟล์ที่นี่" ระหว่างลากไฟล์จากเครื่องมาเหนือผืนผ้าใบ
export function FileDropOverlay({ target }: { target: 'page' | 'cell' | 'uploads' }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary-soft/70">
      <div className="csmju-pop flex flex-col items-center gap-2 rounded-2xl bg-surface px-6 py-4 text-center shadow-csmju-lg">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary text-on-inverse">
          <UploadIcon className="size-8" animate />
        </span>
        <p className="text-csmju-body font-bold text-ink">
          {target === 'cell' ? 'ปล่อยเพื่อใส่รูปลงในช่อง' : target === 'uploads' ? 'ปล่อยเพื่ออัปโหลดเก็บไว้' : 'ปล่อยเพื่อเพิ่มลงในดีไซน์'}
        </p>
        <p className="text-csmju-caption text-muted">รูป · วิดีโอ · เสียง · ฟอนต์ · ข้อความ (.txt) · ตาราง (.csv)</p>
      </div>
    </div>
  );
}

/// แผงอัปโหลด: ลากไฟล์จากเครื่องมาปล่อย = อัปโหลดเก็บไว้ในคลัง (ยังไม่ใส่ลงหน้า) แบบ Canva
export function UploadDropZone({ children }: { children: ReactNode }) {
  const { importFiles } = useFileImport();
  const [over, setOver] = useState(false);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (!dragHasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        if (!dragHasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        void importFiles(Array.from(event.dataTransfer.files), { insert: false, origin: originFrom(event.dataTransfer) });
      }}
    >
      {children}
      {over && <FileDropOverlay target="uploads" />}
    </div>
  );
}

export function dragHasFiles(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.types).includes('Files'));
}

/// ลิงก์รูปจากเว็บอื่น (ลากรูปจากแท็บอื่น / คัดลอกรูปเป็น HTML)
export function imageUrlFrom(data: DataTransfer | null): string | null {
  if (!data) return null;

  const html = data.getData('text/html');
  const fromHtml = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];

  if (fromHtml) return fromHtml.replace(/&amp;/g, '&');

  const uri = data.getData('text/uri-list').split('\n').find((line) => line && !line.startsWith('#'))?.trim();

  return uri && /^(https?:|data:image\/)/i.test(uri) && /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|#|$)|^data:image\//i.test(uri) ? uri : null;
}

/// ภาพนี้คัดลอก/ลากมาจากเว็บอื่นหรือไม่ (ดูจาก HTML/ลิงก์ในคลิปบอร์ด และแหล่งที่เพิ่งเปิดจากแผงแหล่งภาพ)
export function originFrom(data: DataTransfer | null, fallbackUrl?: string | null): ImageOrigin | null {
  return originFromHints(readTransferHints(data), {
    ownHost: typeof window === 'undefined' ? undefined : window.location.host,
    intent: recentIntent(useSourceIntent.getState()),
    fallbackUrl,
  });
}

interface ImportOptions {
  /// จุดบนหน้าที่ปล่อยไฟล์ (หน่วยพิกเซลของหน้า) — ไม่มี = กลางหน้า
  at?: { x: number; y: number };
  /// ช่องของกรอบ/กริดที่ปล่อยรูปลงไป (รูปแรกเท่านั้น)
  cell?: { id: string; cell: number } | null;
  /// false = อัปโหลดเก็บไว้ในคลังอย่างเดียว (ลากลงแผงอัปโหลด)
  insert?: boolean;
  /// แหล่งที่มาของภาพที่คัดลอก/ลากมาจากเว็บอื่น — ส่งไปเก็บกับไฟล์ (เฉพาะรูป)
  origin?: ImageOrigin | null;
}

function loadSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 400 });
    img.onerror = () => resolve({ width: 400, height: 400 });
    img.src = src;
  });
}

/// รูปที่เบราว์เซอร์เปิดได้แต่ระบบไม่เก็บ → PNG
async function convertToPng(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');

  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

  if (!blob) throw new Error('แปลงรูปไม่สำเร็จ');

  return new File([blob], pngName(file.name), { type: 'image/png' });
}

function placeAt<T extends CanvasElement>(el: T, at: { x: number; y: number } | undefined, offset: number): T {
  if (!at) return offset ? { ...el, x: el.x + offset, y: el.y + offset } : el;

  return { ...el, x: Math.round(at.x - el.width / 2 + offset), y: Math.round(at.y - el.height / 2 + offset) };
}

/// กำลังพิมพ์ในช่องกรอก — ปล่อยให้ Ctrl+V ทำงานตามปกติของช่องนั้น
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;

  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
}

export function useFileImport() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const insertMedia = useInsertMedia();
  const uploadFonts = useUploadFonts();

  const addText = (text: string, at?: { x: number; y: number }, offset = 0) => {
    const state = useEditor.getState();
    const page = { width: state.width, height: state.height };
    const clamped = clampText(text);

    if (!clamped.text) return;

    if (looksTabular(clamped.text)) {
      addTable(parseDelimited(clamped.text, '\t'), at, offset);
      return;
    }

    state.addElements([placeAt(createText(page, 'body', { text: clamped.text }), at, offset)]);
    if (clamped.truncated) toast('ข้อความยาวมาก ตัดเหลือ 5,000 ตัวอักษรแรก');
  };

  const addTable = (grid: string[][], at?: { x: number; y: number }, offset = 0) => {
    const state = useEditor.getState();
    const { rows, truncated } = clampGrid(grid);

    if (rows.length === 0) return;

    const table = createTable({ width: state.width, height: state.height }, rows.length, rows[0].length, 'header');
    const filled = { ...table, cells: table.cells.map((row, r) => row.map((cell, c) => ({ ...cell, text: rows[r]?.[c] ?? '' }))) };

    state.addElements([placeAt(filled, at, offset)]);
    if (truncated) toast('ตารางใหญ่เกิน ใส่ได้สูงสุด 50 แถว × 20 คอลัมน์');
  };

  const importFiles = async (files: File[], options: ImportOptions = {}) => {
    const state = useEditor.getState();
    const insert = options.insert ?? true;

    if (insert && !canEditDoc(state)) {
      toast('งานนี้เปิดแบบดูหรือแสดงความคิดเห็นได้อย่างเดียว', 'error');
      return;
    }

    const problems: string[] = [];
    const uploads: File[] = [];
    const fonts: File[] = [];
    let offset = 0;

    for (const file of files) {
      const plan = planImport(file);

      if (plan.kind === 'unsupported') {
        problems.push(plan.reason);
      } else if (plan.kind === 'upload') {
        uploads.push(file);
      } else if (plan.kind === 'font') {
        fonts.push(file);
      } else if (plan.kind === 'convert-image') {
        try {
          uploads.push(await convertToPng(file));
        } catch {
          problems.push(`เปิดรูป “${file.name}” ในเบราว์เซอร์นี้ไม่ได้ — บันทึกเป็น JPG หรือ PNG ก่อน`);
        }
      } else if (!insert) {
        problems.push(`“${file.name}” เป็นข้อความ/ตาราง ไม่ต้องอัปโหลด — ลากไปวางบนหน้าได้เลย`);
      } else {
        const text = await file.text();

        if (plan.kind === 'text') addText(text, options.at, offset);
        else addTable(parseDelimited(text, plan.delimiter), options.at, offset);
        offset += 24;
      }
    }

    if (problems.length) toast(problems.length > 1 ? `${problems[0]} (และอีก ${problems.length - 1} ไฟล์)` : problems[0], 'error');
    // ฟอนต์ → "ฟอนต์ของฉัน" (ใช้กับข้อความที่เลือกอยู่ทันทีเมื่อวางลงหน้า)
    if (fonts.length > 0) await uploadFonts(fonts, { apply: insert });
    if (uploads.length === 0) return;

    const activity = useUploadActivity.getState();

    activity.begin(uploads.length);
    if (uploads.length > 1 || !insert) toast(`กำลังอัปโหลด ${uploads.length} ไฟล์…`);

    let cell = options.cell ?? null;
    let done = 0;

    for (const file of uploads) {
      try {
        const asset = await api.upload<Asset>('/assets', file, file.type.startsWith('image/') ? originFields(options.origin) : undefined);

        done++;
        if (!insert) continue;

        if (asset.mimeType.startsWith('image/')) {
          const size = await loadSize(asset.contentUrl);
          const origin = originOfAsset(asset);
          const source: ImageSource = { src: asset.contentUrl, assetId: asset.id, naturalWidth: size.width, naturalHeight: size.height, name: asset.fileName, origin };
          const now = useEditor.getState();

          if (cell) {
            fillCell(cell.id, cell.cell, source);
            cell = null;
          } else if (options.at || !fillSelectedFrame(source)) {
            const image = placeAt(createImage({ width: now.width, height: now.height }, source), options.at, offset);

            now.addElements([image]);
            offset += 24;
            // ภาพจากเว็บอื่น: เสนอทางลัดลบพื้นหลัง/ใส่เครดิต
            if (origin) useImportHint.getState().show(image.id, origin);
          }
        } else {
          await insertMedia(asset);
        }
      } catch (error) {
        toast(`${file.name}: ${errorMessage(error)}`, 'error');
      } finally {
        useUploadActivity.getState().end();
      }
    }

    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['quotas'] });
    if (done > 0 && (!insert || done > 1)) toast(insert ? `เพิ่ม ${done} ไฟล์ลงดีไซน์แล้ว` : `อัปโหลดแล้ว ${done} ไฟล์ · อยู่ในแผงอัปโหลด`);
  };

  /// รูปจากเว็บอื่น: ดึงด้วยเบราว์เซอร์ (เว็บต้นทางต้องอนุญาต CORS) แล้วนำเข้าเหมือนไฟล์
  const importImageUrl = async (url: string, options: ImportOptions = {}) => {
    const withOrigin: ImportOptions = { ...options, origin: options.origin ?? originFrom(null, url) };

    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' });

      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();

      if (!blob.type.startsWith('image/')) throw new Error('not image');

      const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'image') || 'image';
      const ext = blob.type.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg') ?? 'png';

      await importFiles([new File([blob], /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${ext}`, { type: blob.type })], withOrigin);
    } catch {
      toast('ดึงรูปจากเว็บนั้นไม่ได้ (เว็บต้นทางไม่อนุญาต) — บันทึกรูปลงเครื่องแล้วลากไฟล์มาวางแทน', 'error');
    }
  };

  return { importFiles, importImageUrl, addText };
}

/// Ctrl+V ในหน้าแก้ไข: ไฟล์/รูปจากคลิปบอร์ด → นำเข้า · ข้อความ → กล่องข้อความ (ช่องจาก Excel → ตาราง) ·
/// คลิปบอร์ดยังเป็นของที่คัดลอกในหน้าแก้ไข → วางชิ้นงานนั้น · กันเบราว์เซอร์เปิดไฟล์เมื่อปล่อยนอกผืนผ้าใบ
export function usePasteAndDropImport() {
  const { importFiles, importImageUrl, addText } = useFileImport();

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;

      const state = useEditor.getState();
      const data = event.clipboardData;

      if (!data || !canEditDoc(state)) return;

      const files = Array.from(data.files);
      const text = data.getData('text/plain');

      if (files.length > 0) {
        event.preventDefault();
        void importFiles(files, { origin: originFrom(data) });
        return;
      }

      if (state.clipboard.length > 0 && (prefersInternalPaste(text) || !text.trim())) {
        event.preventDefault();
        state.paste();
        return;
      }

      const url = imageUrlFrom(data);

      if (url && !text.trim()) {
        event.preventDefault();
        void importImageUrl(url, { origin: originFrom(data, url) });
        return;
      }

      if (text.trim()) {
        event.preventDefault();
        addText(text);
      }
    };

    // ไฟล์ที่ปล่อยนอกผืนผ้าใบ (เช่นบนแถบเครื่องมือ) ไม่ให้เบราว์เซอร์เปิดไฟล์แทนหน้าแก้ไข
    const onDragOver = (event: DragEvent) => {
      if (dragHasFiles(event.dataTransfer)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (dragHasFiles(event.dataTransfer)) event.preventDefault();
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles, importImageUrl, addText]);
}
