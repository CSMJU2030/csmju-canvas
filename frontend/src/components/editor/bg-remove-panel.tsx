'use client';

import { Pipette, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { DEFAULT_BG_OPTIONS, applyMask, backgroundMask, removedRatio, type BgRemoveMode, type BgRemoveOptions } from '@/lib/editor/bg-remove';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import type { ImageElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import type { Asset } from '@/lib/types';
import { PanelHeader, RangeField } from './controls';

/// แผง "ลบพื้นหลัง" — ลบพื้นหลังด้วยสี (ไม่ใช้ AI · ประมวลผลในเครื่อง) ดูผลสดก่อนกดใช้
///
/// กด "ลบพื้นหลัง" = สร้างรูป PNG โปร่งใสแล้วอัปโหลดเป็นไฟล์ใหม่ของผู้ใช้ · รูปเดิมยังอยู่ (คืนพื้นหลังได้ทุกเมื่อ)

/// ขนาดตัวอย่างในแผง (ด้านยาว) และขนาดสูงสุดของรูปผลลัพธ์
const PREVIEW_MAX = 360;
const OUTPUT_MAX = 2000;

function close() {
  useEditorUi.getState().setPanel(null);
}

function useSelectedImage(): ImageElement | null {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);

  return useMemo(() => {
    const picked = elements.filter((el) => selection.includes(el.id));

    return picked.length === 1 && picked[0].type === 'image' ? picked[0] : null;
  }, [elements, selection]);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้'));
    img.src = src;
  });
}

/// วาดรูปลงผืนขนาดไม่เกิน `max` แล้วคืนพิกเซล (รูปข้ามโดเมนอ่านพิกเซลไม่ได้ → throw)
function pixelsOf(img: HTMLImageElement, max: number) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { canvas, ctx, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

export function BgRemovePanel() {
  const el = useSelectedImage();

  if (!el) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="ลบพื้นหลัง" onClose={close} />
        <p className="px-4 text-csmju-caption text-muted">เลือกรูปบนผืนผ้าใบก่อน แล้วกด “ลบพื้นหลัง” บนแถบเครื่องมือ</p>
      </div>
    );
  }

  // เลือกรูปอื่นระหว่างแผงเปิด = เริ่มค่าของรูปนั้นใหม่
  return <BgRemoveBody key={el.id} el={el} />;
}

function BgRemoveBody({ el }: { el: ImageElement }) {
  const toast = useToast();
  const original = el.bgRemoved?.originalSrc ?? el.src;
  const [options, setOptions] = useState<BgRemoveOptions>(() => el.bgRemoved?.options ?? DEFAULT_BG_OPTIONS);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const editable = useEditor((s) => canEditDoc(s));

  // ตัวอย่างสด: คำนวณบนรูปย่อ (เร็ว) ทุกครั้งที่ปรับค่า · หน่วงนิดหน่อยระหว่างลากแถบเลื่อน
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadImage(original)
        .then((img) => {
          if (cancelled) return;

          const { image } = pixelsOf(img, PREVIEW_MAX);

          sourceRef.current = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);

          const { alpha, background } = backgroundMask(image, options);

          applyMask(image, alpha, background);

          const canvas = previewRef.current;

          if (!canvas) return;
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.getContext('2d')!.putImageData(image, 0, 0);
          setRatio(removedRatio(alpha));
          setError(null);
        })
        .catch(() => {
          if (!cancelled) setError('อ่านพิกเซลของรูปนี้ไม่ได้ — ลองอัปโหลดรูปนี้ใหม่จากเครื่องแล้วลบพื้นหลังอีกครั้ง');
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [original, options]);

  const set = (patch: Partial<BgRemoveOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const pickColor = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const source = sourceRef.current;

    if (!picking || !source) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(source.width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * source.width)));
    const y = Math.min(source.height - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * source.height)));
    const i = (y * source.width + x) * 4;

    set({ sample: [source.data[i], source.data[i + 1], source.data[i + 2]] });
    setPicking(false);
  };

  const apply = async () => {
    setBusy(true);

    try {
      const img = await loadImage(original);
      const { canvas, ctx, image } = pixelsOf(img, OUTPUT_MAX);
      const { alpha, background } = backgroundMask(image, options);

      applyMask(image, alpha, background);
      ctx.putImageData(image, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

      if (!blob) throw new Error('สร้างรูปไม่สำเร็จ');

      const base = (el.name || 'รูป').replace(/\.[^.]+$/, '');
      const asset = await api.upload<Asset>('/assets', new File([blob], `${base}-ไม่มีพื้นหลัง.png`, { type: 'image/png' }));
      const now = useEditor.getState();
      const current = currentPage(now).elements.find((e) => e.id === el.id);

      if (!current || current.type !== 'image') return;

      now.updateElements([el.id], () => ({
        src: asset.contentUrl,
        assetId: asset.id,
        bgRemoved: {
          originalSrc: current.bgRemoved?.originalSrc ?? current.src,
          originalAssetId: current.bgRemoved ? current.bgRemoved.originalAssetId : current.assetId,
          options,
        },
      }));
      toast('ลบพื้นหลังแล้ว · เก็บรายละเอียดเพิ่มได้ด้วยยางลบ หรือกด “คืนพื้นหลัง”');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const restore = () => {
    const removed = el.bgRemoved;

    if (!removed) return;

    useEditor.getState().updateElements([el.id], () => ({ src: removed.originalSrc, assetId: removed.originalAssetId, bgRemoved: null }));
    toast('คืนพื้นหลังเดิมแล้ว');
  };

  const warn = ratio === null ? null : ratio < 0.02 ? 'แทบไม่พบพื้นหลัง — ลองเพิ่มความไว หรือจิ้มเลือกสีพื้นหลังเอง' : ratio > 0.95 ? 'ลบไปเกือบทั้งรูป — ลองลดความไว' : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="ลบพื้นหลัง" onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className={cx('csmju-checker relative overflow-hidden rounded-xl border border-line', picking && 'ring-2 ring-primary')}>
          <canvas
            ref={previewRef}
            onClick={pickColor}
            aria-label={picking ? 'คลิกที่พื้นหลังในรูปเพื่อเลือกสี' : 'ตัวอย่างรูปหลังลบพื้นหลัง'}
            className={cx('mx-auto block max-h-72 w-auto max-w-full', picking ? 'cursor-crosshair' : 'cursor-default')}
          />
        </div>
        {error && <p className="mt-2 text-csmju-caption text-danger">{error}</p>}
        {warn && !error && <p className="mt-2 text-csmju-caption text-warning">{warn}</p>}
        {ratio !== null && !error && !warn && <p className="mt-2 text-csmju-caption text-muted">ลบพื้นหลังราว {Math.round(ratio * 100)}% ของรูป</p>}

        <p className="mt-4 mb-2 text-csmju-caption font-semibold text-ink">ลบส่วนไหน</p>
        <div role="radiogroup" aria-label="วิธีลบพื้นหลัง" className="grid grid-cols-2 rounded-xl bg-surface-muted p-1">
          {(
            [
              ['edges', 'พื้นที่ติดขอบรูป'],
              ['color', 'สีนี้ทั้งรูป'],
            ] as [BgRemoveMode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={options.mode === key}
              onClick={() => set({ mode: key })}
              className={cx('min-h-10 rounded-lg text-csmju-caption', options.mode === key ? 'bg-surface font-semibold text-ink shadow-csmju-sm' : 'text-body')}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-csmju-caption text-muted">
          {options.mode === 'edges' ? 'ลบพื้นหลังที่ต่อกับขอบรูป ส่วนในตัวแบบที่สีคล้ายพื้นยังอยู่' : 'ลบทุกจุดที่สีใกล้พื้นหลัง รวมช่องในตัวอักษรหรือโลโก้'}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            aria-pressed={picking}
            onClick={() => setPicking((v) => !v)}
            className={cx(
              'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-csmju-caption font-semibold',
              picking ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
            )}
          >
            <Pipette aria-hidden className="size-4" /> {picking ? 'คลิกที่พื้นหลังในรูป' : 'เลือกสีพื้นหลังเอง'}
          </button>
          {options.sample && (
            <>
              <span aria-label="สีพื้นหลังที่เลือก" className="size-8 rounded-full border border-line-strong" style={{ background: `rgb(${options.sample.join(' ')})` }} />
              <button type="button" onClick={() => set({ sample: null })} className="min-h-10 px-2 text-csmju-caption font-semibold text-primary">
                หาจากขอบรูป
              </button>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <RangeField label="ความไวต่อสี" value={options.tolerance} min={0} max={100} onChange={(v) => set({ tolerance: v })} />
          <RangeField label="ขอบนุ่ม" value={options.softness} min={0} max={10} onChange={(v) => set({ softness: v })} />
        </div>

        <p className="mt-4 rounded-xl bg-surface-muted px-3 py-2 text-csmju-caption text-muted">
          ได้ผลดีกับพื้นหลังสีเรียบ เช่น รูปสินค้าบนพื้นขาว โลโก้ หรือภาพบนฉากสีเดียว · พื้นหลังที่มีลวดลายมากให้เก็บส่วนที่เหลือด้วยยางลบพิกเซล
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-3">
        <button
          type="button"
          disabled={busy || !editable || el.locked || Boolean(error)}
          onClick={() => void apply()}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? 'กำลังลบพื้นหลัง…' : el.bgRemoved ? 'ลบพื้นหลังใหม่ด้วยค่านี้' : 'ลบพื้นหลัง'}
        </button>
        <div className="flex gap-2">
          {el.bgRemoved && (
            <button type="button" disabled={!editable || el.locked} onClick={restore} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50">
              <RotateCcw aria-hidden className="size-4" /> คืนพื้นหลัง
            </button>
          )}
          <button
            type="button"
            disabled={!editable || el.locked}
            onClick={() => useEditorUi.getState().set({ imageErase: { id: el.id, size: 40 } })}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
          >
            เก็บรายละเอียดด้วยยางลบ
          </button>
        </div>
      </div>
    </div>
  );
}
