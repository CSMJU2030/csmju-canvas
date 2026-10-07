'use client';

import { ClipboardPaste, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { cx } from '@/components/csmju/primitives';
import { UploadIcon } from '@/components/shell/upload-icon';
import { originFromHints, recentIntent, useSourceIntent } from '@/lib/editor/image-sources';
import { canEditDoc, useEditor } from '@/lib/editor/store';
import { imageUrlFrom, originFrom, useFileImport } from './file-import';

/// นำภาพเข้าจาก "ที่วางภาพ" ของหน้าต่างลอยแหล่งภาพและถาดรับภาพ (Picture-in-Picture)
///
/// ใช้ตรรกะเดียวกับการวาง/ลากบนหน้าแก้ไข (useFileImport) · คืนผลเป็นข้อความสั้นให้ถาดแสดงเอง
/// เพราะข้อความแจ้งเตือน (toast) ของหน้าแก้ไขไม่ขึ้นในหน้าต่างถาด

export type ReceiveResult = { ok: true; message: string } | { ok: false; message: string };

/// ข้อความธรรมดาที่เป็นลิงก์ไฟล์รูป (เช่นคัดลอก "ที่อยู่รูปภาพ")
export function plainImageUrl(text: string): string | null {
  const line = text.trim().split(/\s+/)[0] ?? '';

  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?$/i.test(line) ? line : null;
}

const NOT_EDITABLE: ReceiveResult = { ok: false, message: 'งานนี้เปิดแบบดูหรือแสดงความคิดเห็นได้อย่างเดียว ใส่ภาพไม่ได้' };
const NO_IMAGE: ReceiveResult = { ok: false, message: 'ไม่พบภาพในสิ่งที่วาง — คลิกขวาที่ภาพแล้วเลือก “คัดลอกรูปภาพ” ก่อน' };

export function useReceiveImport() {
  const { importFiles, importImageUrl } = useFileImport();

  /// ใส่แล้วนับว่าสำเร็จเมื่อเนื้องานเปลี่ยนจริง (ภาพใหม่ หรือภาพลงกรอบที่เลือก) · การนำเข้าแจ้งข้อผิดพลาดในหน้าแก้ไขเอง
  const settle = async (job: () => Promise<void>): Promise<ReceiveResult> => {
    const before = useEditor.getState().doc;

    await job();

    const state = useEditor.getState();

    if (state.doc !== before) return { ok: true, message: `ใส่ลงหน้า ${state.pageIndex + 1} แล้ว` };

    return { ok: false, message: 'ใส่ภาพนี้ไม่สำเร็จ — ดูเหตุผลในหน้าแก้ไข หรือบันทึกรูปลงเครื่องแล้วลากไฟล์มาวาง' };
  };

  const fromTransfer = async (data: DataTransfer | null): Promise<ReceiveResult> => {
    if (!data) return NO_IMAGE;
    if (!canEditDoc(useEditor.getState())) return NOT_EDITABLE;

    const files = Array.from(data.files);

    if (files.length > 0) return settle(() => importFiles(files, { origin: originFrom(data) }));

    const url = imageUrlFrom(data) ?? plainImageUrl(data.getData('text/plain'));

    if (url) return settle(() => importImageUrl(url, { origin: originFrom(data, url) }));

    return NO_IMAGE;
  };

  /// ปุ่ม "วางจากคลิปบอร์ด" (จอสัมผัส/ไม่ถนัดคีย์ลัด) — เบราว์เซอร์จะถามสิทธิ์อ่านคลิปบอร์ดครั้งแรก
  const fromClipboard = async (): Promise<ReceiveResult> => {
    if (!canEditDoc(useEditor.getState())) return NOT_EDITABLE;

    let items: ClipboardItems;

    try {
      items = await navigator.clipboard.read();
    } catch {
      return { ok: false, message: 'เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ด — คลิกในกรอบนี้แล้วกด Ctrl+V แทน' };
    }

    const files: File[] = [];
    let html = '';

    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));

      if (type) {
        const blob = await item.getType(type);

        files.push(new File([blob], `clipboard.${type.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg') ?? 'png'}`, { type }));
      }

      if (!html && item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
    }

    if (files.length === 0) return NO_IMAGE;

    const origin = originFromHints({ html, uriList: '' }, { ownHost: window.location.host, intent: recentIntent(useSourceIntent.getState()) });

    return settle(() => importFiles(files, { origin }));
  };

  return { fromTransfer, fromClipboard };
}

/// สถานะของที่วางภาพ (กำลังใส่ / ผลล่าสุด) — ใช้ร่วมกันระหว่างหน้าต่างลอยกับถาดรับภาพ
export function useReceiveStatus() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReceiveResult | null>(null);

  const run = async (job: () => Promise<ReceiveResult>) => {
    setBusy(true);
    setResult(null);

    try {
      setResult(await job());
    } catch {
      setResult({ ok: false, message: 'ใส่ภาพไม่สำเร็จ ลองใหม่อีกครั้ง' });
    } finally {
      setBusy(false);
    }
  };

  return { busy, result, run };
}

/// กรอบ "วางภาพที่นี่ / Ctrl+V" · `interactive` = รับการลาก/วางผ่าน React เอง (หน้าต่างลอยในหน้าแก้ไข)
/// ถาดรับภาพ (หน้าต่างแยก) ฟังเหตุการณ์ของหน้าต่างตัวเองแทน จึงส่ง interactive = false
export function ReceiveDropZone({
  interactive,
  over,
  busy,
  result,
  onTransfer,
  onClipboard,
  onOver,
}: {
  interactive: boolean;
  over: boolean;
  busy: boolean;
  result: ReceiveResult | null;
  onTransfer?: (data: DataTransfer) => void;
  onClipboard: () => void;
  onOver?: (over: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        tabIndex={0}
        role="region"
        aria-label="ที่วางภาพ: ลากภาพหรือลิงก์มาวาง หรือคลิกแล้วกด Ctrl+V"
        className={cx(
          'flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-3 py-4 text-center focus-visible:border-primary',
          over ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface-muted',
        )}
        onDragOver={
          interactive
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
                if (!over) onOver?.(true);
              }
            : undefined
        }
        onDragLeave={
          interactive
            ? (event) => {
                if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                onOver?.(false);
              }
            : undefined
        }
        onDrop={
          interactive
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOver?.(false);
                onTransfer?.(event.dataTransfer);
              }
            : undefined
        }
        onPaste={
          interactive
            ? (event) => {
                // หน้าแก้ไขก็ฟัง Ctrl+V ที่ window อยู่ — หยุดตรงนี้ไม่ให้ใส่ภาพซ้ำสองชิ้น
                event.preventDefault();
                event.stopPropagation();
                onTransfer?.(event.clipboardData);
              }
            : undefined
        }
      >
        {busy ? <LoaderCircle aria-hidden className="size-7 animate-spin text-primary" /> : <UploadIcon className="size-7 text-primary" animate={over} />}
        <p className="text-csmju-body font-bold text-ink">วางภาพที่นี่ / Ctrl+V</p>
        <p className="text-csmju-caption text-muted">ลากภาพหรือลิงก์รูปมาวาง ภาพจะเข้าไปในงานที่เปิดอยู่ทันที</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onClipboard}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
      >
        <ClipboardPaste aria-hidden className="size-4" /> วางจากคลิปบอร์ด
      </button>
      <p role="status" aria-live="polite" className={cx('min-h-6 text-csmju-caption', result ? (result.ok ? 'font-semibold text-success' : 'text-danger') : 'text-muted')}>
        {busy ? 'กำลังใส่ลงหน้า…' : (result?.message ?? '')}
      </p>
    </div>
  );
}
