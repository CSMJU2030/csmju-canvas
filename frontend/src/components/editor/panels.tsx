'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, Circle, CloudUpload, Copy, Eye, EyeOff, Files, Layers, LayoutTemplate, Lock, LockOpen,
  Minus, MoveRight, Plus, Search, Shapes, Square, Star, Trash2, Triangle, Type, Upload,
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
import { TemplateCard } from '@/components/designs/cards';
import { designTypeLabel } from '@/lib/design-types';
import { fitTemplate } from '@/lib/editor/fit-template';
import { normalizeDocument } from '@/lib/editor/types';
import type { Asset, Template, TemplateSummary } from '@/lib/types';

export type PanelKey = 'design' | 'elements' | 'text' | 'uploads' | 'layers' | 'pages';

/// แท็บเครื่องมือด้านซ้ายเรียงแบบ Canva: ออกแบบ · องค์ประกอบ · ข้อความ · อัปโหลด · เลเยอร์ · หน้า
export const PANELS: { key: PanelKey; label: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }[] = [
  { key: 'design', label: 'ออกแบบ', icon: LayoutTemplate },
  { key: 'elements', label: 'องค์ประกอบ', icon: Shapes },
  { key: 'text', label: 'ข้อความ', icon: Type },
  { key: 'uploads', label: 'อัปโหลด', icon: CloudUpload },
  { key: 'layers', label: 'เลเยอร์', icon: Layers },
  { key: 'pages', label: 'หน้า', icon: Files },
];

export function PanelContent({ panel }: { panel: PanelKey }) {
  switch (panel) {
    case 'design':
      return <DesignPanel />;
    case 'elements':
      return <ElementsPanel />;
    case 'text':
      return <TextPanel />;
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
      <button type="button" onClick={() => add([createText(page, 'body')])} className="min-h-11 rounded-xl bg-primary px-4 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
        <Type aria-hidden className="mr-2 inline size-4" />เพิ่มกล่องข้อความ
      </button>
      <h3 className="mt-3 text-csmju-body font-semibold text-ink">สไตล์ข้อความเริ่มต้น</h3>
      {presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => add([createText(page, preset.key)])}
          className={cx('min-h-14 rounded-xl border border-line-strong px-4 py-3 text-left text-ink hover:border-primary hover:bg-primary-soft', preset.className)}
        >
          {textPresetLabel(preset.key)}
        </button>
      ))}
    </div>
  );
}

/// ช่องค้นหาบนสุดของแผง (แบบ Canva)
function PanelSearch({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mb-4">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} className={cx(inputClass, 'rounded-xl bg-surface-muted pl-10')} />
    </div>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-csmju-body font-semibold text-ink">{children}</h3>;
}

function ElementsPanel() {
  const [q, setQ] = useState('');

  return (
    <div>
      <PanelSearch id="elements-search" label="ค้นหาองค์ประกอบ เช่น ดาว หนังสือ" value={q} onChange={setQ} />
      {!q.trim() && (
        <section className="mb-6">
          <PanelHeading>รูปทรงและเส้น</PanelHeading>
          <ShapesPanel />
        </section>
      )}
      <section>
        <PanelHeading>ไอคอน</PanelHeading>
        <IconsPanel query={q} />
      </section>
    </div>
  );
}

/// แผง "ออกแบบ": เทมเพลตที่ใช้กับงานนี้ได้ทันที (ประเภทเดียวกันขึ้นก่อน)
function DesignPanel() {
  const designType = useEditor((s) => s.designType);
  const [q, setQ] = useState('');
  const toast = useToast();
  const sameType = useQuery({
    queryKey: ['templates', 'editor', designType],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ designType, limit: 20 })}`),
  });
  const all = useQuery({
    queryKey: ['templates', 'editor-all', q.trim()],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ q: q.trim(), sort: 'popular', limit: 30 })}`),
  });

  const apply = async (template: TemplateSummary) => {
    if (!window.confirm(`ใช้เทมเพลต “${template.title}” แทนงานทั้งหมดในหน้านี้? (ย้อนกลับได้ด้วย Ctrl+Z)`)) return;

    try {
      const full = await api.get<Template>(`/templates/${template.id}`);
      const state = useEditor.getState();
      const doc = fitTemplate(normalizeDocument(full.document), { width: full.width, height: full.height }, { width: state.width, height: state.height });

      state.replaceDocument(doc);
      toast(`ใช้เทมเพลต “${template.title}” แล้ว`);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const others = (all.data?.items ?? []).filter((t) => q.trim() || t.designType !== designType);

  return (
    <div>
      <PanelSearch id="design-search" label="ค้นหาเทมเพลต" value={q} onChange={setQ} />
      {!q.trim() && (sameType.data?.items.length ?? 0) > 0 && (
        <section className="mb-6">
          <PanelHeading>สำหรับ{designTypeLabel(designType).replace(/\s*\(.*\)$/, '')}</PanelHeading>
          <ul className="grid grid-cols-2 gap-3">
            {sameType.data!.items.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} onUse={() => void apply(t)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <PanelHeading>{q.trim() ? 'ผลการค้นหา' : 'เทมเพลตทั้งหมด'}</PanelHeading>
        {all.isLoading ? (
          <Spinner />
        ) : all.isError ? (
          <ErrorState message={errorMessage(all.error)} onRetry={() => void all.refetch()} />
        ) : others.length === 0 ? (
          <p className="text-csmju-caption text-muted">ไม่พบเทมเพลต</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {others.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} onUse={() => void apply(t)} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-csmju-caption text-muted">เทมเพลตต่างขนาดจะถูกย่อ/ขยายให้พอดีผืนผ้าใบนี้</p>
      </section>
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
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl bg-surface-muted text-csmju-caption text-ink hover:bg-primary-soft"
          >
            {shape.icon}
            {shape.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function IconsPanel({ query }: { query: string }) {
  const page = usePageSize();
  const add = useEditor((s) => s.addElements);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return term ? ICONS.filter((icon) => icon.label.includes(term) || icon.name.includes(term)) : ICONS;
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
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
