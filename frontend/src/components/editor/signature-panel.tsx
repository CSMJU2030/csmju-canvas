'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { Button, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { createImage, createPath, createText, placeCentered } from '@/lib/editor/factory';
import { cssFamily, ensureFont } from '@/lib/editor/fonts';
import { brushStyle, strokeFreehand } from '@/lib/editor/render';
import { useEditor } from '@/lib/editor/store';
import type { Asset } from '@/lib/types';
import { ColorPicker, RainbowSwatch, Swatch } from './color-picker';
import { FontPicker } from './font-picker';

/// แผง "สร้างลายเซ็น" (ภาพบรีฟชุด "ลายเซ็น"): พิมพ์ชื่อด้วยฟอนต์ลายมือ · วาด/เขียนเอง · อัปโหลดรูป
///
/// "บันทึกลายเซ็น" เก็บลายเซ็นล่าสุดไว้ในเบราว์เซอร์นี้ (localStorage) ให้ใช้ซ้ำครั้งหน้า — ไม่ส่งขึ้นเซิร์ฟเวอร์

type Tab = 'text' | 'draw' | 'upload';

const STORE_KEY = 'csc.signature.v1';
const BLACK = 'rgb(0 0 0)';

interface SavedSignature {
  text?: { name: string; font: string; color: string };
  draw?: { strokes: number[][]; color: string; weight: number; width: number; height: number };
}

function loadSaved(): SavedSignature {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);

    return raw ? (JSON.parse(raw) as SavedSignature) : {};
  } catch {
    return {};
  }
}

function save(patch: SavedSignature | null, keep: boolean) {
  try {
    if (!keep) {
      window.localStorage.removeItem(STORE_KEY);
      return;
    }

    window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadSaved(), ...patch }));
  } catch {
    // เบราว์เซอร์ไม่ให้เก็บ — ลายเซ็นยังใส่ลงงานได้ตามปกติ
  }
}

export function SignaturePanel({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('text');
  const [saved] = useState(() => (typeof window === 'undefined' ? {} : loadSaved()));
  const tabs: { key: Tab; label: string }[] = [
    { key: 'text', label: 'ข้อความ' },
    { key: 'draw', label: 'วาด/เขียน' },
    { key: 'upload', label: 'อัปโหลด' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3">
        <button type="button" onClick={onBack} aria-label="กลับไปที่เครื่องมือ" className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-muted">
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <h2 className="flex-1 text-csmju-body font-bold text-ink">สร้างลายเซ็น</h2>
        <button type="button" onClick={onClose} aria-label="ปิดแผงลายเซ็น" className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-muted">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div role="tablist" aria-label="วิธีสร้างลายเซ็น" className="mx-4 mt-3 flex shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              'min-h-11 flex-1 border-b-4 text-csmju-body transition-colors',
              tab === t.key ? 'border-primary font-semibold text-ink' : 'border-transparent text-body hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-4">
        {tab === 'text' && <TextSignature initial={saved.text} />}
        {tab === 'draw' && <DrawSignature initial={saved.draw} />}
        {tab === 'upload' && <UploadSignature />}
      </div>
    </div>
  );
}

function usePage() {
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);

  return { width, height };
}

/// สีลายเซ็น: ดำ + เลือกสีเอง (ภาพบรีฟ "เพิ่มสี")
function SignatureColor({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const custom = value !== BLACK;

  return (
    <fieldset>
      <legend className="mb-2 text-csmju-body font-semibold text-ink">สี</legend>
      <div className="flex items-center gap-3">
        <Swatch color={BLACK} label="สีดำ" selected={!custom} onClick={() => onChange(BLACK)} />
        {custom && <Swatch color={value} label="สีที่เลือก" selected onClick={() => setOpen(true)} />}
        <RainbowSwatch buttonRef={anchorRef} label="เลือกสีเอง" active={open} onClick={() => setOpen((v) => !v)} />
      </div>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label="เลือกสีลายเซ็น" className="rounded-2xl border border-line bg-surface p-4 shadow-csmju-lg">
        <ColorPicker value={value} onChange={onChange} />
      </FloatingPanel>
    </fieldset>
  );
}

function SaveToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId();

  return (
    <div className="flex items-center gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-primary' : 'bg-line-strong')}
      >
        <span className={cx('inline-block size-5 rounded-full bg-surface shadow-csmju-sm transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
      <label htmlFor={id} className="text-csmju-caption text-ink">
        บันทึกลายเซ็น (ในเบราว์เซอร์นี้)
      </label>
    </div>
  );
}

function TextSignature({ initial }: { initial?: SavedSignature['text'] }) {
  const page = usePage();
  const [name, setName] = useState(initial?.name ?? '');
  const [font, setFont] = useState(initial?.font ?? 'Sriracha');
  const [color, setColor] = useState(initial?.color ?? BLACK);
  const [keep, setKeep] = useState(true);
  const nameId = useId();

  const add = async () => {
    await ensureFont(font, 400);
    useEditor.getState().addElements([
      { ...createText(page, 'heading', { text: name.trim(), fontFamily: font, color, fontWeight: 400 }), name: 'ลายเซ็น' },
    ]);
    save({ text: { name: name.trim(), font, color } }, keep);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-muted px-4 py-6">
        <p
          className={cx('text-center text-csmju-display leading-snug break-all', !name.trim() && 'text-muted')}
          style={{ fontFamily: cssFamily(font), color: name.trim() ? color : undefined }}
        >
          {name.trim() || 'ลายเซ็นของคุณ'}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-csmju-body font-semibold text-ink">
          ชื่อ-นามสกุล
        </label>
        <input id={nameId} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="พิมพ์ชื่อของคุณ" className={inputClass} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-csmju-body font-semibold text-ink">ฟอนต์</span>
        <FontPicker value={font} onChange={setFont} />
      </div>
      <SignatureColor value={color} onChange={setColor} />
      <SaveToggle checked={keep} onChange={setKeep} />
      <Button variant="primary" disabled={!name.trim()} onClick={() => void add()}>
        เพิ่มลายเซ็น
      </Button>
    </div>
  );
}

const PAD_WIDTH = 400;
const PAD_HEIGHT = 240;

function DrawSignature({ initial }: { initial?: SavedSignature['draw'] }) {
  const page = usePage();
  const canvas = useRef<HTMLCanvasElement>(null);
  // กรองเส้นเสียที่อาจถูกบันทึกไว้ในเครื่องก่อนแก้บั๊ก (null) — ไม่งั้นเปิดแผงแล้วพังทันที
  const [strokes, setStrokes] = useState<number[][]>(() => (initial?.strokes ?? []).filter((stroke) => Array.isArray(stroke) && stroke.length >= 2));
  const [weight, setWeight] = useState(initial?.weight ?? 2);
  const [color, setColor] = useState(initial?.color ?? BLACK);
  const [keep, setKeep] = useState(true);
  const drawing = useRef<number[] | null>(null);
  const rangeId = useId();
  const numberId = useId();

  // วาดแผ่นใหม่ทุกครั้งที่เส้น สี หรือน้ำหนักเปลี่ยน
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');

    if (!ctx) return;

    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    ctx.save();
    brushStyle(ctx, 'pen', color, weight * 1.5);
    for (const stroke of strokes) strokeFreehand(ctx, stroke);
    ctx.restore();
  }, [strokes, color, weight]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    return [((event.clientX - rect.left) / rect.width) * PAD_WIDTH, ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT];
  };

  const add = () => {
    const path = createPath(strokes, { color, strokeWidth: weight * 1.5, brush: 'pen', name: 'ลายเซ็น' });

    if (!path) return;

    useEditor.getState().addElements([placeCentered(path, page, page.width * 0.35)]);
    save({ draw: { strokes, color, weight, width: PAD_WIDTH, height: PAD_HEIGHT } }, keep);
  };

  return (
    <div className="flex flex-col gap-5">
      <canvas
        ref={canvas}
        width={PAD_WIDTH}
        height={PAD_HEIGHT}
        role="img"
        aria-label="แผ่นสำหรับเซ็นชื่อ — ลากเมาส์หรือนิ้วเพื่อเขียน"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);

          // จับเส้นไว้ในตัวแปรก่อน — updater ของ setState อาจรันหลังปล่อยนิ้ว (ref เป็น null แล้ว)
          // ถ้าอ่าน ref ในนั้น เส้น null จะหลุดเข้ารายการ แล้วพังตอนวาด ("Cannot read properties of null")
          const stroke = point(event);

          drawing.current = stroke;
          setStrokes((prev) => [...prev, stroke]);
        }}
        onPointerMove={(event) => {
          const current = drawing.current;

          if (!current) return;

          const [x, y] = point(event);
          const stroke = [...current, Math.round(x * 10) / 10, Math.round(y * 10) / 10];

          drawing.current = stroke;
          setStrokes((prev) => [...prev.slice(0, -1), stroke]);
        }}
        onPointerUp={() => (drawing.current = null)}
        onPointerCancel={() => (drawing.current = null)}
        className="aspect-5/3 w-full cursor-crosshair touch-none rounded-2xl border border-line bg-surface-muted"
      />
      <div className="grid grid-cols-2 gap-3">
        <Button disabled={strokes.length === 0} onClick={() => setStrokes((prev) => prev.slice(0, -1))}>
          ย้อนกลับ
        </Button>
        <Button disabled={strokes.length === 0} onClick={() => setStrokes([])}>
          ลบลายเซ็น
        </Button>
      </div>
      <div>
        <label htmlFor={rangeId} className="text-csmju-body font-semibold text-ink">
          น้ำหนัก
        </label>
        <div className="mt-2 flex items-center gap-4">
          <input id={rangeId} type="range" min={1} max={10} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="min-w-0 flex-1 accent-primary" />
          <label htmlFor={numberId} className="sr-only">ค่าน้ำหนัก</label>
          <input
            id={numberId}
            type="number"
            min={1}
            max={10}
            value={weight}
            onChange={(e) => setWeight(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            className="min-h-11 w-16 rounded-xl border border-line-strong bg-surface text-center text-csmju-body text-ink tabular-nums focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <SignatureColor value={color} onChange={setColor} />
      <SaveToggle checked={keep} onChange={setKeep} />
      <Button variant="primary" disabled={strokes.length === 0} onClick={add}>
        เพิ่มลายเซ็น
      </Button>
    </div>
  );
}

function UploadSignature() {
  const page = usePage();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const add = async () => {
    if (!file) return;

    setBusy(true);

    try {
      const asset = await api.upload<Asset>('/assets', file);
      const img = new Image();

      img.onload = () => {
        const el = createImage(page, {
          src: asset.contentUrl,
          assetId: asset.id,
          naturalWidth: img.naturalWidth || 400,
          naturalHeight: img.naturalHeight || 200,
          name: 'ลายเซ็น',
        });

        useEditor.getState().addElements([placeCentered(el, page, page.width * 0.35)]);
      };
      img.src = asset.contentUrl;
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        aria-label="เลือกรูปลายเซ็น"
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;

          setFile(next);
          setPreview(next ? URL.createObjectURL(next) : null);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex min-h-60 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface-muted p-4 text-csmju-body text-body hover:border-primary"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- ตัวอย่างไฟล์ในเครื่องก่อนอัปโหลด
          <img src={preview} alt="ตัวอย่างลายเซ็นที่เลือก" className="max-h-48 max-w-full object-contain" />
        ) : (
          <>
            <Upload aria-hidden className="size-8 text-ink" />
            อัปโหลดรูปภาพลายเซ็น
          </>
        )}
      </button>
      <p className="text-csmju-caption text-muted">PNG พื้นโปร่งใสจะดูเป็นธรรมชาติที่สุด · รูปจะเก็บไว้ในแท็บอัปโหลดของคุณด้วย</p>
      <Button variant="primary" disabled={!file} loading={busy} onClick={() => void add()}>
        เพิ่มลายเซ็น
      </Button>
    </div>
  );
}
