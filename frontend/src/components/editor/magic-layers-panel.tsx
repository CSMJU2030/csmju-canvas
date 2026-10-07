'use client';

import { Layers } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { createText } from '@/lib/editor/factory';
import { splitLayers, type NormRect } from '@/lib/editor/magic-layers';
import type { CutoutPixels } from '@/lib/editor/smart-cutout';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import { newId, type CanvasElement, type ImageElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import type { Asset } from '@/lib/types';
import { PanelHeader } from './controls';
import { pixelsAt, SmartCutoutView, type SmartCutoutHandle } from './smart-cutout-view';

/// แผง "แยกเลเยอร์" (Magic Layers แบบ Canva) — รูปแบน ๆ กลายเป็นเลเยอร์ที่ขยับ/แก้ได้อิสระ
///
///   วัตถุแต่ละชิ้น → รูป PNG แยก วางตรงที่เดิม ลากย้าย ย่อขยาย หมุน ลบ ได้ทีละชิ้น
///   พื้นหลัง → รูปเดิมที่อุดรูตรงวัตถุ/ข้อความแล้ว (แทนรูปเดิมในลำดับชั้นเดิม)
///   ข้อความในรูป (ลากกรอบ) → ลบออกจากรูป แล้ววางกล่องข้อความที่พิมพ์แก้ได้ สีและขนาดตามของเดิม
///
/// ทำในเครื่องทั้งหมด (lib/editor/magic-layers.ts) · ทั้งหมดเป็นการแก้ขั้นเดียว กด Ctrl+Z ย้อนได้ในครั้งเดียว

const OUTPUT_MAX = 1600;

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

/// ส่วนของรูปที่เห็นบนผืนผ้าใบจริง (ตามครอปและการพลิก) เป็นรูปใหม่หนึ่งรูป — เลเยอร์ที่แยกจะตรงกับที่เห็นเป๊ะ
async function visibleImage(el: ImageElement): Promise<HTMLImageElement> {
  const img = await loadImage(el.src);
  const crop = el.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const sw = crop.width * img.naturalWidth;
  const sh = crop.height * img.naturalHeight;
  const scale = Math.min(1, OUTPUT_MAX / Math.max(sw, sh));
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));

  const ctx = canvas.getContext('2d')!;

  ctx.translate(el.flipX ? canvas.width : 0, el.flipY ? canvas.height : 0);
  ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  ctx.drawImage(img, crop.x * img.naturalWidth, crop.y * img.naturalHeight, sw, sh, 0, 0, canvas.width, canvas.height);
  // อ่านพิกเซลได้ไหม (รูปข้ามโดเมน = throw ตรงนี้)
  ctx.getImageData(0, 0, 1, 1);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

  if (!blob) throw new Error('เตรียมรูปไม่สำเร็จ');

  return loadImage(URL.createObjectURL(blob));
}

async function uploadPixels(px: CutoutPixels, name: string): Promise<Asset> {
  const canvas = document.createElement('canvas');

  canvas.width = px.width;
  canvas.height = px.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

  if (!blob) throw new Error('สร้างรูปเลเยอร์ไม่สำเร็จ');

  return api.upload<Asset>('/assets', new File([blob], `${name}.png`, { type: 'image/png' }));
}

/// กรอบ (สัดส่วนในรูป) → ตำแหน่งบนหน้า ตามตำแหน่ง ขนาด และการหมุนของรูปเดิม
function placeIn(el: ImageElement, box: NormRect) {
  const width = (box.x1 - box.x0) * el.width;
  const height = (box.y1 - box.y0) * el.height;
  const dx = ((box.x0 + box.x1) / 2 - 0.5) * el.width;
  const dy = ((box.y0 + box.y1) / 2 - 0.5) * el.height;
  const angle = (el.rotation * Math.PI) / 180;
  const cx = el.x + el.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle);
  const cy = el.y + el.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle);

  return { x: Math.round((cx - width / 2) * 10) / 10, y: Math.round((cy - height / 2) * 10) / 10, width, height, rotation: el.rotation };
}

export function MagicLayersPanel() {
  const el = useSelectedImage();

  if (!el) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="แยกเลเยอร์" onClose={close} />
        <p className="px-4 text-csmju-caption text-muted">เลือกรูปบนผืนผ้าใบก่อน แล้วกด “แยกเลเยอร์” บนแถบเครื่องมือ</p>
      </div>
    );
  }

  return <MagicLayersBody key={el.id} el={el} />;
}

function MagicLayersBody({ el }: { el: ImageElement }) {
  const toast = useToast();
  const editable = useEditor((s) => canEditDoc(s));
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [objects, setObjects] = useState<number | null>(null);
  const [softness, setSoftness] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const handle = useRef<SmartCutoutHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    void visibleImage(el)
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch(() => {
        if (!cancelled) setError('อ่านพิกเซลของรูปนี้ไม่ได้ — ลองอัปโหลดรูปนี้ใหม่จากเครื่องแล้วแยกเลเยอร์อีกครั้ง');
      });

    return () => {
      cancelled = true;
    };
    // แยกจากรูปที่เห็นตอนเปิดแผง (เปลี่ยนครอป/พลิกแล้วเปิดแผงใหม่)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id]);

  const apply = async () => {
    const snap = handle.current?.snapshot();

    if (!image || !snap?.result) return;

    if (snap.result.objects.length === snap.excluded.size && snap.texts.length === 0) {
      toast('ยังไม่มีวัตถุหรือข้อความให้แยก — ตีกรอบรอบวัตถุ ทาแปรงเก็บ หรือลากกรอบรอบข้อความก่อน', 'error');
      return;
    }

    setBusy('กำลังแยกเลเยอร์…');
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    try {
      const full = pixelsAt(image, OUTPUT_MAX);
      const split = splitLayers(full, snap.result, snap.excluded, snap.texts, snap.softness);
      const base = (el.name || 'รูป').replace(/\.[^.]+$/, '');

      setBusy('กำลังบันทึกพื้นหลัง…');

      const background = await uploadPixels(split.background, `${base}-พื้นหลัง`);
      const pieces: { asset: Asset; box: NormRect }[] = [];

      for (const [index, object] of split.objects.entries()) {
        setBusy(`กำลังบันทึกวัตถุ ${index + 1}/${split.objects.length}…`);
        pieces.push({ asset: await uploadPixels(object.pixels, `${base}-วัตถุ-${index + 1}`), box: object.box });
      }

      const state = useEditor.getState();
      const current = currentPage(state).elements.find((e) => e.id === el.id);

      if (!current || current.type !== 'image') return;

      const page = { width: state.width, height: state.height };
      const fresh = { crop: null, flipX: false, flipY: false, erase: null, bgRemoved: null, animated: false };
      const layers: CanvasElement[] = [
        ...pieces.map(({ asset, box }, index): CanvasElement => ({
          ...current,
          ...fresh,
          ...placeIn(current, box),
          id: newId(),
          groupId: null,
          name: `วัตถุ ${index + 1}`,
          src: asset.contentUrl,
          assetId: asset.id,
        })),
        ...split.texts.map((text, index): CanvasElement => {
          const fontSize = Math.max(8, Math.round(text.fontHeight * current.height));
          const spot = placeIn(current, text.box);

          return {
            ...createText(page, 'body', { text: 'พิมพ์ข้อความใหม่', color: `rgb(${text.color.join(' ')})`, fontWeight: 700 }),
            ...spot,
            name: `ข้อความในรูป ${index + 1}`,
            fontSize,
            height: Math.max(spot.height, fontSize * 1.4),
          };
        }),
      ];

      // ทั้งหมดเป็นการแก้ขั้นเดียว — Ctrl+Z ครั้งเดียวกลับเป็นรูปเดิม
      state.beginGesture();
      state.updateElements([el.id], () => ({ ...fresh, src: background.contentUrl, assetId: background.id, name: `${base} (พื้นหลัง)` }));
      state.addElements(layers, { select: true });
      state.endGesture();

      toast(`แยกเป็น ${pieces.length} วัตถุ${split.texts.length ? ` · ${split.texts.length} ข้อความ` : ''} + พื้นหลัง — ลากย้ายหรือแก้ได้ทีละชิ้น`);
      close();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="แยกเลเยอร์" onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <p className="mb-3 text-csmju-caption text-muted">
          แตกรูปเป็นเลเยอร์แยก: วัตถุแต่ละชิ้นขยับได้อิสระ พื้นหลังถูกอุดตรงที่วัตถุเคยอยู่ · ลากกรอบรอบข้อความในรูปเพื่อเปลี่ยนเป็นข้อความที่พิมพ์แก้ได้
        </p>
        {error && <p className="mb-2 text-csmju-caption text-danger">{error}</p>}
        {image && !error && (
          <SmartCutoutView layers image={image} previewMax={360} softness={softness} onSoftness={setSoftness} handleRef={handle} onStatus={setObjects} />
        )}
        <p className="mt-4 rounded-xl bg-surface-muted px-3 py-2 text-csmju-caption text-muted">
          ระบบอ่านตัวอักษรในรูปไม่ได้ (ไม่ใช้ AI/OCR) — กล่องข้อความที่ได้จะใช้สีและขนาดตามของเดิม แล้วพิมพ์ข้อความใหม่ลงไป
        </p>
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <button
          type="button"
          disabled={busy !== null || !editable || el.locked || Boolean(error) || objects === null}
          onClick={() => void apply()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-50"
        >
          <Layers aria-hidden className="size-5" /> {busy ?? 'แยกเป็นเลเยอร์'}
        </button>
      </div>
    </div>
  );
}
