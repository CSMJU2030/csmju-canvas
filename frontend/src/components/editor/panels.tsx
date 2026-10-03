'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, Circle, Copy, Eye, EyeOff, Image as ImageIcon, Lock, LockOpen, Minus, MoveRight,
  Plus, Square, Star, Trash2, Triangle, Type, Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button, EmptyState, ErrorState, IconButton, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { createImage, createShape, createSvg, createText, layerLabel, textPresetLabel, type TextPreset } from '@/lib/editor/factory';
import { ICONS, iconSvg } from '@/lib/editor/icons';
import { renderPageToCanvas } from '@/lib/editor/render';
import { currentPage, useEditor } from '@/lib/editor/store';
import type { ShapeKind } from '@/lib/editor/types';
import { formatBytes } from '@/lib/format';
import type { Asset } from '@/lib/types';

export type PanelKey = 'text' | 'shapes' | 'icons' | 'uploads' | 'layers' | 'pages';

export const PANELS: { key: PanelKey; label: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }[] = [
  { key: 'text', label: 'ข้อความ', icon: Type },
  { key: 'shapes', label: 'รูปทรง', icon: Square },
  { key: 'icons', label: 'ไอคอน', icon: Star },
  { key: 'uploads', label: 'อัปโหลด', icon: Upload },
  { key: 'layers', label: 'เลเยอร์', icon: Copy },
  { key: 'pages', label: 'หน้า', icon: ImageIcon },
];

export function PanelContent({ panel }: { panel: PanelKey }) {
  switch (panel) {
    case 'text':
      return <TextPanel />;
    case 'shapes':
      return <ShapesPanel />;
    case 'icons':
      return <IconsPanel />;
    case 'uploads':
      return <UploadsPanel />;
    case 'layers':
      return <LayersPanel />;
    case 'pages':
      return <PagesPanel />;
  }
}

function usePageSize() {
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);

  return { width, height };
}

function TextPanel() {
  const page = usePageSize();
  const add = useEditor((s) => s.addElements);
  const presets: { key: TextPreset; className: string }[] = [
    { key: 'heading', className: 'text-csmju-h2 font-bold' },
    { key: 'subheading', className: 'text-csmju-h3 font-semibold' },
    { key: 'body', className: 'text-csmju-body' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-csmju-caption text-muted">กดเพื่อเพิ่มกล่องข้อความ แล้วดับเบิลคลิกที่ผืนผ้าใบเพื่อพิมพ์</p>
      {presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => add([createText(page, preset.key)])}
          className={cx('min-h-14 rounded-xl border border-line px-4 py-3 text-left text-ink hover:bg-surface-muted', preset.className)}
        >
          {textPresetLabel(preset.key)}
        </button>
      ))}
    </div>
  );
}

function ShapesPanel() {
  const page = usePageSize();
  const add = useEditor((s) => s.addElements);
  const shapes: { kind: ShapeKind; label: string; icon: React.ReactNode }[] = [
    { kind: 'rect', label: 'สี่เหลี่ยม', icon: <Square aria-hidden className="size-8" /> },
    { kind: 'ellipse', label: 'วงกลม', icon: <Circle aria-hidden className="size-8" /> },
    { kind: 'triangle', label: 'สามเหลี่ยม', icon: <Triangle aria-hidden className="size-8" /> },
    { kind: 'star', label: 'ดาว', icon: <Star aria-hidden className="size-8" /> },
    { kind: 'line', label: 'เส้นตรง', icon: <Minus aria-hidden className="size-8" /> },
    { kind: 'arrow', label: 'ลูกศร', icon: <MoveRight aria-hidden className="size-8" /> },
  ];

  return (
    <ul className="grid grid-cols-3 gap-2">
      {shapes.map((shape) => (
        <li key={shape.kind}>
          <button
            type="button"
            onClick={() => add([createShape(page, shape.kind)])}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-line text-csmju-caption text-ink hover:bg-surface-muted"
          >
            {shape.icon}
            {shape.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function IconsPanel() {
  const page = usePageSize();
  const add = useEditor((s) => s.addElements);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return term ? ICONS.filter((icon) => icon.label.includes(term) || icon.name.includes(term)) : ICONS;
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="icon-search" className="sr-only">ค้นหาไอคอน</label>
      <input id="icon-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาไอคอน เช่น ดาว หนังสือ" className={inputClass} />
      {filtered.length === 0 ? (
        <p className="text-csmju-caption text-muted">ไม่พบไอคอน</p>
      ) : (
        <ul className="grid grid-cols-4 gap-1">
          {filtered.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                title={entry.label}
                aria-label={`เพิ่มไอคอน ${entry.label}`}
                onClick={() => add([createSvg(page, iconSvg(entry), entry.label)])}
                className="flex aspect-square w-full items-center justify-center rounded-xl text-ink hover:bg-surface-muted"
              >
                <entry.icon aria-hidden className="size-7" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-csmju-caption text-muted">ไอคอนจาก Lucide (สัญญาอนุญาต ISC) ใช้ได้ฟรี</p>
    </div>
  );
}

function UploadsPanel() {
  const page = usePageSize();
  const add = useEditor((s) => s.addElements);
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const assets = useQuery({ queryKey: ['assets', 'library'], queryFn: () => api.list<Asset>(`/assets${qs({ limit: 60 })}`) });

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<Asset>('/assets', file),
    onSuccess: (asset) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      insert(asset);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const trash = useMutation({
    mutationFn: (id: string) => api.patch(`/assets/${id}`, { trashed: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast('ย้ายรูปไปถังขยะแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const insert = (asset: Asset) => {
    const img = new Image();

    img.onload = () =>
      add([
        createImage(page, {
          src: asset.contentUrl,
          assetId: asset.id,
          naturalWidth: img.naturalWidth || 400,
          naturalHeight: img.naturalHeight || 400,
          name: asset.fileName,
        }),
      ]);
    img.onerror = () => toast('เปิดรูปนี้ไม่ได้', 'error');
    img.src = asset.contentUrl;
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        aria-label="เลือกรูปที่จะอัปโหลด"
        onChange={(event) => {
          for (const file of Array.from(event.target.files ?? [])) upload.mutate(file);
          event.target.value = '';
        }}
      />
      <Button variant="primary" loading={upload.isPending} onClick={() => input.current?.click()}>
        <Upload aria-hidden className="size-4" /> อัปโหลดรูป
      </Button>
      <p className="text-csmju-caption text-muted">PNG, JPEG, WebP, GIF, SVG ไม่เกิน 10 MB · รูปของคุณเห็นได้เฉพาะคุณ</p>
      {assets.isLoading ? (
        <Spinner />
      ) : assets.isError ? (
        <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />
      ) : assets.data!.items.length === 0 ? (
        <EmptyState title="ยังไม่มีรูป" description="รูปที่อัปโหลดจะเก็บไว้ที่นี่ ใช้ซ้ำในงานอื่นได้" />
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {assets.data!.items.map((asset) => (
            <li key={asset.id} className="group relative">
              <button
                type="button"
                onClick={() => insert(asset)}
                aria-label={`ใส่รูป ${asset.fileName}`}
                className="csmju-checker flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-line"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
                <img src={asset.contentUrl} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              </button>
              <p className="truncate text-csmju-caption text-muted" title={asset.fileName}>
                {formatBytes(asset.sizeBytes)}
              </p>
              <IconButton
                label={`ย้าย ${asset.fileName} ไปถังขยะ`}
                onClick={() => trash.mutate(asset.id)}
                className="absolute top-1 right-1 bg-surface/90 text-danger"
              >
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LayersPanel() {
  const elements = useEditor((s) => currentPage(s).elements);
  const selection = useEditor((s) => s.selection);
  const state = useEditor.getState;
  const [dragging, setDragging] = useState<string | null>(null);
  const ordered = [...elements].reverse();

  if (elements.length === 0) {
    return <EmptyState title="หน้านี้ยังว่าง" description="เพิ่มข้อความ รูปทรง ไอคอน หรือรูป แล้วจะเห็นเป็นเลเยอร์ที่นี่" />;
  }

  return (
    <div>
      <p className="mb-2 text-csmju-caption text-muted">บนสุดอยู่ด้านบน · ลากเพื่อเรียงใหม่</p>
      <ul className="flex flex-col gap-1">
        {ordered.map((el) => {
          const active = selection.includes(el.id);
          const index = elements.indexOf(el);

          return (
            <li
              key={el.id}
              draggable
              onDragStart={() => setDragging(el.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging && dragging !== el.id) state().moveLayer(dragging, index);
                setDragging(null);
              }}
              className={cx('flex items-center gap-1 rounded-xl border px-2', active ? 'border-primary bg-primary-soft' : 'border-line')}
            >
              <button
                type="button"
                onClick={(event) => state().select(event.shiftKey ? [...selection, el.id] : [el.id])}
                aria-pressed={active}
                className={cx('min-h-11 min-w-0 flex-1 truncate text-left text-csmju-caption', el.hidden ? 'text-muted line-through' : 'text-ink')}
              >
                {layerLabel(el)}
                {el.groupId && <span className="ml-1 text-muted">(กลุ่ม)</span>}
              </button>
              <IconButton label={el.hidden ? `แสดง ${layerLabel(el)}` : `ซ่อน ${layerLabel(el)}`} onClick={() => state().updateElements([el.id], () => ({ hidden: !el.hidden }))}>
                {el.hidden ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              </IconButton>
              <IconButton label={el.locked ? `ปลดล็อก ${layerLabel(el)}` : `ล็อก ${layerLabel(el)}`} onClick={() => state().updateElements([el.id], () => ({ locked: !el.locked }))}>
                {el.locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
              </IconButton>
              <IconButton label={`ยก ${layerLabel(el)} ขึ้น`} disabled={index === elements.length - 1} onClick={() => state().moveLayer(el.id, index + 1)}>
                <ArrowUp aria-hidden className="size-4" />
              </IconButton>
              <IconButton label={`ส่ง ${layerLabel(el)} ลง`} disabled={index === 0} onClick={() => state().moveLayer(el.id, index - 1)}>
                <ArrowDown aria-hidden className="size-4" />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PagesPanel() {
  const pages = useEditor((s) => s.doc.pages);
  const pageIndex = useEditor((s) => s.pageIndex);
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const state = useEditor.getState;

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => state().addPage()}>
        <Plus aria-hidden className="size-4" /> เพิ่มหน้า
      </Button>
      <ol className="flex flex-col gap-2">
        {pages.map((page, index) => (
          <li key={page.id} className={cx('rounded-xl border p-2', index === pageIndex ? 'border-primary bg-primary-soft' : 'border-line')}>
            <button type="button" onClick={() => state().setPageIndex(index)} className="block w-full text-left" aria-current={index === pageIndex ? 'page' : undefined}>
              <PagePreview pageId={page.id} width={width} height={height} />
              <span className="mt-1 block text-csmju-caption font-medium text-ink">หน้า {index + 1}</span>
            </button>
            <div className="mt-1 flex">
              <IconButton label={`เลื่อนหน้า ${index + 1} ขึ้น`} disabled={index === 0} onClick={() => state().movePage(index, index - 1)}>
                <ArrowUp aria-hidden className="size-4" />
              </IconButton>
              <IconButton label={`เลื่อนหน้า ${index + 1} ลง`} disabled={index === pages.length - 1} onClick={() => state().movePage(index, index + 1)}>
                <ArrowDown aria-hidden className="size-4" />
              </IconButton>
              <IconButton label={`ทำสำเนาหน้า ${index + 1}`} onClick={() => state().duplicatePage(index)}>
                <Copy aria-hidden className="size-4" />
              </IconButton>
              <IconButton
                label={`ลบหน้า ${index + 1}`}
                disabled={pages.length <= 1}
                onClick={() => {
                  if (window.confirm(`ลบหน้า ${index + 1}? (ย้อนกลับได้ด้วย Ctrl+Z)`)) state().deletePage(index);
                }}
                className="text-danger"
              >
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/// ภาพย่อของหน้า — วาดใหม่เมื่อเนื้อหาของหน้านั้นเปลี่ยน
function PagePreview({ pageId, width, height }: { pageId: string; width: number; height: number }) {
  const page = useEditor((s) => s.doc.pages.find((p) => p.id === pageId));
  const { data } = useQuery({
    queryKey: ['page-preview', pageId, page, width, height],
    queryFn: async () => {
      const canvas = await renderPageToCanvas(page!, { width, height }, Math.min(1, 240 / Math.max(width, height)), {
        background: page!.background ? undefined : 'rgb(255 255 255)',
      });

      return canvas.toDataURL('image/png');
    },
    enabled: Boolean(page),
    staleTime: Infinity,
    gcTime: 10_000,
  });

  return (
    <span className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element -- ภาพย่อสร้างจาก canvas ในเครื่อง
        <img src={data} alt="" className="max-h-full max-w-full shadow-csmju-sm" />
      ) : (
        <span className="text-csmju-caption text-muted">…</span>
      )}
    </span>
  );
}
