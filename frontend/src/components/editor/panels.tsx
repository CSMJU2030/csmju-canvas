'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, ChevronDown, Copy, Ellipsis, Eye, EyeOff, Folder as FolderIcon, FolderInput, FolderMinus,
  FolderOpen, FolderPlus, Globe, LayoutPanelLeft, Lock, LockOpen, PenLine, Pencil, Plus, Shapes,
  SlidersHorizontal, Star, Trash2, Type, Download, X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { Button, EmptyState, ErrorState, IconButton, Menu, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { Thumbnail } from '@/components/designs/cards';
import { UploadIcon, useUploadActivity } from '@/components/shell/upload-icon';
import { api, qs } from '@/lib/csmju/api';
import {
  FONT_SETS, createFontSet, createImage, createText, layerLabel,
  textPresetText, type FontSet, type TextPreset,
} from '@/lib/editor/factory';
import { COLOR_FILTERS, colorFilterOf } from '@/lib/editor/color';
import { fitTemplate } from '@/lib/editor/fit-template';
import { fillSelectedFrame, setImageDragData } from '@/lib/editor/frame-actions';
import { originOfAsset } from '@/lib/editor/image-sources';
import { cssFamily, ensureFont } from '@/lib/editor/fonts';
import { loadPhotos, matchPhoto, photoSrc, photoThumb, searchTerms, type LibraryPhoto } from '@/lib/editor/library';
import { pushRecent, useRecent } from '@/lib/editor/recent';
import { measureTextHeight, renderPageToCanvas } from '@/lib/editor/render';
import { currentPage, useEditor } from '@/lib/editor/store';
import { normalizeDocument } from '@/lib/editor/types';
import { useEditorUi, type PanelKey } from '@/lib/editor/ui-store';
import { download, safeFileName } from '@/lib/editor/export';
import { ACCEPT, mediaKindOf, uploadProblem, type MediaKind } from '@/lib/editor/media';
import type { Asset, AssetFolder, Template, TemplateSummary } from '@/lib/types';
import { ColorPicker, RainbowSwatch, Swatch } from './color-picker';
import { matchFonts, usePreloadFonts } from './font-picker';
import { CreateFolderDialog, ProjectsPanel } from './project-panel';
import { AnimatePanel, ColorPanel, EffectsPanel, PositionPanel } from './side-panels';
import { ChartDataPanel } from './chart-panel';
import { PanelHeader, UnderlineTabs } from './controls';
import { CropPanel, FontPanel, ImageEditPanel, ReplacePanel } from './side-panels-media';
import { SignaturePanel } from './signature-panel';
import { BgRemovePanel } from './bg-remove-panel';
import { ElementsPanel } from './elements-panel';
import { UploadDropZone } from './file-import';
import { ImageSourcesBrowser, ImportedImagesBrowser } from './image-sources-panel';
import { AudioLibrary, VideoLibrary, useInsertMedia } from './media-panel';
import { BackHeader, PanelFrame, PanelSearch, PanelTitle, SectionHeading, useLibrary, usePageSize } from './panel-parts';

/// แผงด้านซ้ายของหน้าแก้ไข — เรียงตาม Canva (ภาพบรีฟชุด "พรีเซนเทชั่น" ใช้กับดีไซน์ทุกประเภท)
///
/// แถบซ้าย: เทมเพลต · องค์ประกอบ · ข้อความ · อัปโหลด · เครื่องมือ · โปรเจกต์ · (ล่างสุด) ติดดาวแล้ว
/// "เครื่องมือ" ไม่ใช่แผง แต่เปิดแถบเครื่องมือลอย (tools-palette.tsx)
/// เลเยอร์และหน้า เปิดจากแถบล่าง · ลายเซ็นเปิดจากแถบเครื่องมือ

export type { PanelKey };
export type RailKey = 'templates' | 'elements' | 'text' | 'uploads' | 'tools' | 'projects';

type IconType = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean; strokeWidth?: number }>;

/// รายการบนแถบซ้าย · `tone` คือสีไอคอนตอนเลือก (แบบไอคอนสีของ Canva)
export const RAIL: { key: RailKey; label: string; icon: IconType; tone: string }[] = [
  { key: 'templates', label: 'เทมเพลต', icon: LayoutPanelLeft, tone: 'text-type-teal' },
  { key: 'elements', label: 'องค์ประกอบ', icon: Shapes, tone: 'text-type-purple' },
  { key: 'text', label: 'ข้อความ', icon: Type, tone: 'text-type-magenta' },
  { key: 'uploads', label: 'อัปโหลด', icon: UploadIcon, tone: 'text-type-orange' },
  { key: 'tools', label: 'เครื่องมือ', icon: PenLine, tone: 'text-type-green' },
  { key: 'projects', label: 'โปรเจกต์', icon: FolderOpen, tone: 'text-type-blue' },
];

export const PANEL_LABELS: Record<PanelKey, string> = {
  templates: 'เทมเพลต',
  elements: 'องค์ประกอบ',
  text: 'ข้อความ',
  uploads: 'อัปโหลด',
  projects: 'โปรเจกต์',
  starred: 'ติดดาวแล้ว',
  background: 'แบ็กกราวด์',
  signature: 'สร้างลายเซ็น',
  layers: 'เลเยอร์',
  pages: 'หน้า',
  notes: 'สมุดโน้ต',
  position: 'ตำแหน่ง',
  color: 'สี',
  effects: 'เอฟเฟกต์',
  animate: 'แอนิเมต',
  font: 'ฟอนต์',
  'image-edit': 'แก้ไขรูปภาพ',
  crop: 'ครอปภาพ',
  'bg-remove': 'ลบพื้นหลัง',
  replace: 'แทนที่รูป',
  'chart-data': 'แก้ไขข้อมูลชาร์ต',
};

export function PanelContent({
  panel,
  onBackToTools,
  onClose,
}: {
  panel: PanelKey;
  onNavigate: (panel: PanelKey) => void;
  onBackToTools: () => void;
  onClose: () => void;
}) {
  switch (panel) {
    case 'templates':
      return <TemplatesPanel />;
    case 'elements':
      return <ElementsPanel />;
    case 'text':
      return <TextPanel />;
    case 'uploads':
      return (
        <UploadDropZone>
          <UploadsPanel />
        </UploadDropZone>
      );
    case 'projects':
      return <ProjectsPanel key="projects" />;
    case 'starred':
      return <ProjectsPanel key="starred" initialView="starred" />;
    case 'signature':
      return <SignaturePanel onBack={onBackToTools} onClose={onClose} />;
    case 'layers':
      return (
        <PanelFrame header={<PanelTitle>เลเยอร์</PanelTitle>}>
          <LayersPanel />
        </PanelFrame>
      );
    case 'pages':
      return (
        <PanelFrame header={<PanelTitle>หน้า</PanelTitle>}>
          <PagesPanel />
        </PanelFrame>
      );
    case 'notes':
      return <NotesPanel onClose={onClose} />;
    case 'background':
      return <BackgroundPanel />;
    case 'position':
      return <PositionPanel />;
    case 'color':
      return <ColorPanel />;
    case 'effects':
      return <EffectsPanel />;
    case 'animate':
      return <AnimatePanel />;
    case 'font':
      return <FontPanel />;
    case 'image-edit':
      return <ImageEditPanel />;
    case 'crop':
      return <CropPanel />;
    case 'bg-remove':
      return <BgRemovePanel />;
    case 'replace':
      return <ReplacePanel />;
    case 'chart-data':
      return <ChartDataPanel />;
  }
}

const NOTE_SIZES = [
  { key: 14, label: 'เล็ก (14 พิกเซล)' },
  { key: 20, label: 'กลาง (20 พิกเซล)' },
  { key: 32, label: 'ใหญ่ (32 พิกเซล)' },
  { key: 40, label: 'ใหญ่พิเศษ (40 พิกเซล)' },
];

/// สมุดโน้ตของผู้พรีเซนต์ ต่อหน้า (ภาพบรีฟ "สมุดโน้ต") — แสดงในหน้าต่างผู้พรีเซนต์ด้วย
function NotesPanel({ onClose }: { onClose: () => void }) {
  const pageIndex = useEditor((s) => s.pageIndex);
  const page = useEditor((s) => currentPage(s));
  const title = useEditor((s) => s.title);
  const [size, setSize] = useState(20);
  const notes = page.notes ?? '';
  const id = useId();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-2">
        <h2 className="min-w-0 flex-1 truncate pl-1 text-csmju-caption font-bold text-ink">
          หน้า {pageIndex + 1} - {page.name || <span className="font-normal text-muted">เพิ่มชื่อหน้า</span>}
        </h2>
        <label htmlFor={`${id}-size`} className="sr-only">ขนาดตัวอักษรของโน้ต</label>
        <select
          id={`${id}-size`}
          value={size}
          onChange={(event) => setSize(Number(event.target.value))}
          className="min-h-9 rounded-lg border border-line-strong bg-surface px-1 text-csmju-caption text-ink"
        >
          {NOTE_SIZES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <IconButton
          label="ดาวน์โหลดโน้ตทุกหน้า"
          onClick={() => {
            const doc = useEditor.getState().doc;
            const text = doc.pages
              .map((p, i) => `หน้า ${i + 1}${p.name ? ` - ${p.name}` : ''}\n${p.notes?.trim() || '(ไม่มีโน้ต)'}`)
              .join('\n\n');

            download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeFileName(title)}-โน้ต.txt`);
          }}
        >
          <Download aria-hidden className="size-4" />
        </IconButton>
        <IconButton label="ปิดสมุดโน้ต" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </IconButton>
      </div>
      <label htmlFor={id} className="sr-only">โน้ตของหน้านี้</label>
      <textarea
        id={id}
        value={notes}
        maxLength={5000}
        onFocus={() => useEditor.getState().beginGesture()}
        onBlur={() => useEditor.getState().endGesture()}
        onChange={(event) => useEditor.getState().updatePage(pageIndex, { notes: event.target.value })}
        placeholder="เพิ่มหมายเหตุไปยังดีไซน์ของคุณ"
        className="mx-3 min-h-0 flex-1 resize-none rounded-xl border border-transparent bg-transparent p-2 text-ink placeholder:text-muted focus:border-line-strong focus:outline-none"
        style={{ fontSize: `${size}px`, lineHeight: 1.6 }}
      />
      <p className="shrink-0 px-4 py-2 text-right text-csmju-caption text-muted tabular-nums">{notes.length}/5000</p>
    </div>
  );
}

// ── เทมเพลต ────────────────────────────────────────────────────────

type RecentTemplate = Pick<TemplateSummary, 'id' | 'title' | 'thumbnail' | 'width' | 'height' | 'designType'>;

/// แผง "เทมเพลต": ใช้งานล่าสุด + เทมเพลตอื่น ๆ ที่เหมาะกับคุณ (ประเภทเดียวกับงานขึ้นก่อน)
function TemplatesPanel() {
  const designType = useEditor((s) => s.designType);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [filters, setFilters] = useState<TemplateFilters>(NO_FILTERS);
  const recent = useRecent<RecentTemplate>('templates');
  const toast = useToast();
  const filterParams = { colors: filters.colors.join(',') || undefined, language: filters.language || undefined };
  const filtering = Boolean(q || filterParams.colors || filterParams.language);
  const sameType = useQuery({
    queryKey: ['templates', 'editor', designType, filterParams],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ designType, sort: 'popular', limit: 30, ...filterParams })}`),
  });
  const all = useQuery({
    queryKey: ['templates', 'editor-all', q, filterParams],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ q: q || undefined, sort: 'popular', limit: 40, ...filterParams })}`),
  });

  const apply = async (template: RecentTemplate) => {
    if (!window.confirm(`ใช้เทมเพลต “${template.title}” แทนงานทั้งหมดในหน้านี้? (ย้อนกลับได้ด้วย Ctrl+Z)`)) return;

    try {
      const full = await api.get<Template>(`/templates/${template.id}`);
      const state = useEditor.getState();
      const doc = fitTemplate(normalizeDocument(full.document), { width: full.width, height: full.height }, { width: state.width, height: state.height });

      state.replaceDocument(doc);
      pushRecent<RecentTemplate>('templates', {
        id: full.id,
        title: full.title,
        thumbnail: full.thumbnail,
        width: full.width,
        height: full.height,
        designType: full.designType,
      });
      toast(`ใช้เทมเพลต “${template.title}” แล้ว`);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  // ประเภทเดียวกับงานขึ้นก่อน แล้วตามด้วยเทมเพลตยอดนิยมอื่น ๆ (ไม่ซ้ำ)
  const suggested = useMemo(() => {
    if (q) return all.data?.items ?? [];

    const first = sameType.data?.items ?? [];
    const ids = new Set(first.map((t) => t.id));

    return [...first, ...(all.data?.items ?? []).filter((t) => !ids.has(t.id))];
  }, [q, sameType.data, all.data]);

  return (
    <PanelFrame
      header={
        <>
          <PanelSearch
            id="template-search"
            label="ค้นหาเทมเพลต"
            value={draft}
            onChange={setDraft}
            onSubmit={() => setQ(draft.trim())}
            trailing={<TemplateFilterButton value={filters} onApply={setFilters} />}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setQ(draft.trim())}
              className="min-h-12 flex-1 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover"
            >
              ค้นหา
            </button>
            {filtering && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  setDraft('');
                  setFilters(NO_FILTERS);
                }}
                className="min-h-12 rounded-xl border border-line-strong px-4 text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
              >
                ล้าง
              </button>
            )}
          </div>
        </>
      }
    >
      {!filtering && recent.length > 0 && (
        <section className="mb-6">
          <SectionHeading onSeeAll={recent.length > 2 ? () => setShowAllRecent((v) => !v) : undefined} seeAllLabel={showAllRecent ? 'ย่อ' : 'ดูทั้งหมด'}>
            ใช้งานล่าสุด
          </SectionHeading>
          <TemplateGrid items={showAllRecent ? recent : recent.slice(0, 2)} onPick={(t) => void apply(t)} />
        </section>
      )}
      <section>
        <SectionHeading>{q ? `ผลการค้นหา “${q}”` : filtering ? 'เทมเพลตตามตัวกรอง' : 'เทมเพลตอื่นๆ ที่เหมาะกับคุณ'}</SectionHeading>
        {all.isLoading || sameType.isLoading ? (
          <Spinner />
        ) : all.isError ? (
          <ErrorState message={errorMessage(all.error)} onRetry={() => void all.refetch()} />
        ) : suggested.length === 0 ? (
          <p className="text-csmju-caption text-muted">ไม่พบเทมเพลต</p>
        ) : (
          <TemplateGrid items={suggested} onPick={(t) => void apply(t)} />
        )}
        <p className="mt-3 text-csmju-caption text-muted">เทมเพลตต่างขนาดจะถูกย่อ/ขยายให้พอดีผืนผ้าใบนี้</p>
      </section>
    </PanelFrame>
  );
}

function TemplateGrid({ items, onPick }: { items: RecentTemplate[]; onPick: (t: RecentTemplate) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {items.map((t) => (
        <li key={t.id}>
          <button type="button" onClick={() => onPick(t)} aria-label={`ใช้เทมเพลต ${t.title}`} title={t.title} className="group block w-full overflow-hidden rounded-lg">
            <Thumbnail src={t.thumbnail} width={t.width} height={t.height} designType={t.designType} alt="" />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface TemplateFilters {
  colors: string[];
  language: '' | 'th' | 'en';
}

const NO_FILTERS: TemplateFilters = { colors: [], language: '' };

/// ปุ่มตัวกรองในช่องค้นหาเทมเพลต (ภาพบรีฟ "พรีเซนเทชั่น 1.1"): สี · ภาษา · ล้างทั้งหมด · นำไปใช้
///
/// สีและภาษาคำนวณจากงานจริงของเทมเพลตแต่ละชิ้นที่หลังบ้าน (colorTags · languageTags)
function TemplateFilterButton({ value, onApply }: { value: TemplateFilters; onApply: (next: TemplateFilters) => void }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const [draft, setDraft] = useState<TemplateFilters>(value);
  const [custom, setCustom] = useState(false);
  const [customColor, setCustomColor] = useState('rgb(0 76 153)');
  const languageId = useId();
  const active = value.colors.length + (value.language ? 1 : 0);
  const count = draft.colors.length + (draft.language ? 1 : 0);
  const toggleColor = (key: string) =>
    setDraft((d) => ({ ...d, colors: d.colors.includes(key) ? d.colors.filter((c) => c !== key) : [...d.colors, key] }));

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={active ? `ตัวกรอง (ใช้อยู่ ${active})` : 'ตัวกรอง'}
        title="ตัวกรอง"
        aria-expanded={open}
        onClick={() => {
          setDraft(value);
          setCustom(false);
          setOpen((v) => !v);
        }}
        className={cx('relative inline-flex size-11 items-center justify-center rounded-full text-ink', open || active ? 'bg-surface-muted' : 'hover:bg-surface-muted')}
      >
        <SlidersHorizontal aria-hidden className="size-5" />
        {active > 0 && (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-csmju-caption leading-none font-bold text-on-inverse">
            {active}
          </span>
        )}
      </button>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label="ตัวกรองเทมเพลต" className="w-96 max-w-full rounded-2xl border border-line bg-surface shadow-csmju-lg">
        <div className="p-5">
          <h3 className="mb-3 text-csmju-body font-bold text-ink">สี</h3>
          {custom ? (
            <div className="flex flex-col gap-3">
              <ColorPicker value={customColor} onChange={setCustomColor} />
              <div className="flex gap-2">
                <Button onClick={() => setCustom(false)}>ยกเลิก</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const key = colorFilterOf(customColor);

                    setDraft((d) => (d.colors.includes(key) ? d : { ...d, colors: [...d.colors, key] }));
                    setCustom(false);
                  }}
                >
                  ใช้สีนี้ (กลุ่ม{COLOR_FILTERS.find((c) => c.key === colorFilterOf(customColor))?.label})
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              <RainbowSwatch label="เลือกสีเอง" onClick={() => setCustom(true)} />
              {COLOR_FILTERS.map((color) => (
                <Swatch key={color.key} color={color.swatch} label={`สี${color.label}`} selected={draft.colors.includes(color.key)} onClick={() => toggleColor(color.key)} />
              ))}
            </div>
          )}
          <label htmlFor={languageId} className="mt-5 mb-2 block text-csmju-body font-bold text-ink">
            ภาษา
          </label>
          <div className="relative">
            <Globe aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink" />
            <select
              id={languageId}
              value={draft.language}
              onChange={(event) => setDraft((d) => ({ ...d, language: event.target.value as TemplateFilters['language'] }))}
              className="min-h-12 w-full appearance-none rounded-xl border border-line-strong bg-surface pr-10 pl-11 text-csmju-body text-ink focus:border-primary focus:outline-none"
            >
              <option value="">ทุกภาษา</option>
              <option value="th">ไทย</option>
              <option value="en">อังกฤษ</option>
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink" />
          </div>
        </div>
        <div className="flex gap-3 border-t border-line p-4">
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setDraft(NO_FILTERS)}
            className="min-h-12 flex-1 rounded-xl border border-line-strong text-csmju-body font-semibold text-ink hover:bg-surface-muted disabled:text-muted"
          >
            ล้างทั้งหมด ({count})
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
            className="min-h-12 flex-1 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover"
          >
            นำไปใช้
          </button>
        </div>
      </FloatingPanel>
    </>
  );
}

/// แผงแบ็กกราวด์: แท็บสี (สีพื้น/ไล่สี) กับแท็บภาพ (ภาพสาธารณสมบัติจากคลัง)
function BackgroundPanel() {
  const [tab, setTab] = useState<'color' | 'photo'>('color');
  const close = () => useEditorUi.getState().setPanel(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="แบ็กกราวด์" onClose={close} />
      <UnderlineTabs
        label="แบ็กกราวด์"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'color', label: 'สี' },
          { key: 'photo', label: 'ภาพ' },
        ]}
      />
      {tab === 'color' ? (
        <ColorPanel target="background" embedded />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
          <BackgroundPhotos />
        </div>
      )}
    </div>
  );
}

/// ภาพพื้นหลังจากคลัง (แผงแบ็กกราวด์) — ใส่รูปเต็มหน้า ล็อก และย้ายไปล่างสุด
function BackgroundPhotos() {
  const photos = useLibrary('photos', loadPhotos);
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const [q, setQ] = useState('');
  const terms = searchTerms(q);
  const list = (photos.data ?? []).filter((p) => terms.length === 0 || matchPhoto(p, terms));

  const apply = (p: LibraryPhoto) => {
    const state = useEditor.getState();
    const aspect = p.w / p.h;
    const w = aspect > width / height ? height * aspect : width;
    const h = w / aspect;
    const el = { ...createImage({ width, height }, { src: photoSrc(p.id), assetId: null, naturalWidth: p.w, naturalHeight: p.h, name: 'แบ็กกราวด์' }), x: (width - w) / 2, y: (height - h) / 2, width: w, height: h, locked: true };

    state.addBehind(el);
  };

  return (
    <section className="mt-2">
      <SectionHeading>ภาพแบ็กกราวด์</SectionHeading>
      <label htmlFor="bg-photo-search" className="sr-only">ค้นหาแบ็กกราวด์</label>
      <input
        id="bg-photo-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาแบ็กกราวด์ เช่น ทะเล ดอกไม้"
        className="mb-3 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-csmju-caption text-ink placeholder:text-muted focus:border-primary focus:outline-none"
      />
      {photos.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="text-csmju-caption text-muted">ไม่พบภาพ</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => apply(p)} aria-label={`ใช้ ${p.title} เป็นแบ็กกราวด์`} title={`${p.title} — ${p.credit} (CC0)`} className="block aspect-square w-full overflow-hidden rounded-lg hover:ring-2 hover:ring-primary">
                {/* eslint-disable-next-line @next/next/no-img-element -- ภาพย่อในคลังของระบบ */}
                <img src={photoThumb(p.id)} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-csmju-caption text-muted">ภาพจะวางเต็มหน้า ล็อก และอยู่หลังสุด · ปลดล็อกได้ที่แผงตำแหน่ง → เลเยอร์</p>
    </section>
  );
}

// ── ข้อความ ────────────────────────────────────────────────────────

interface RecentFontSet {
  id: string;
}

function TextPanel() {
  const page = usePageSize();
  const [q, setQ] = useState('');
  const recent = useRecent<RecentFontSet>('fontsets');
  const term = q.trim().toLowerCase();
  const fonts = term ? matchFonts(term) : [];
  const sets = term ? FONT_SETS.filter((s) => s.label.includes(term) || s.lines.some((l) => l.text.toLowerCase().includes(term) || l.font.toLowerCase().includes(term))) : FONT_SETS;
  const recentSets = recent.map((r) => FONT_SETS.find((s) => s.key === r.id)).filter((s): s is FontSet => Boolean(s));
  const add = useEditor((s) => s.addElements);

  usePreloadFonts([...new Set(FONT_SETS.flatMap((s) => s.lines.map((l) => l.font)))]);

  const addSet = async (set: FontSet) => {
    await Promise.all(set.lines.map((line) => ensureFont(line.font, line.weight)));
    add(createFontSet(page, set, measureTextHeight));
    pushRecent<RecentFontSet>('fontsets', { id: set.key });
  };

  /// เลือกฟอนต์จากผลค้นหา: มีข้อความที่เลือกอยู่ = เปลี่ยนฟอนต์ · ไม่มี = เพิ่มกล่องข้อความด้วยฟอนต์นั้น
  const applyFont = async (fontId: string) => {
    await ensureFont(fontId, 400);

    const state = useEditor.getState();
    const textIds = currentPage(state).elements.filter((el) => state.selection.includes(el.id) && el.type === 'text').map((el) => el.id);

    if (textIds.length > 0) state.updateElements(textIds, () => ({ fontFamily: fontId }));
    else add([createText(page, 'body', { fontFamily: fontId })]);
  };

  const presets: { key: TextPreset; className: string; label: string }[] = [
    { key: 'heading', className: 'text-csmju-display font-bold', label: textPresetText('heading') },
    { key: 'subheading', className: 'text-csmju-h3 font-bold', label: 'เพิ่มหัวเรื่องย่อย' },
    { key: 'body', className: 'text-csmju-caption', label: textPresetText('body') },
  ];

  return (
    <PanelFrame
      header={
        <>
          <PanelSearch id="text-search" label="ค้นหาฟอนต์และเซ็ตฟอนต์" value={q} onChange={setQ} />
          <button
            type="button"
            onClick={() => add([createText(page, 'body')])}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover"
          >
            <Type aria-hidden className="size-5" /> เพิ่มกล่องข้อความ
          </button>
        </>
      }
    >
      {term ? (
        <>
          <section className="mb-6">
            <SectionHeading>ฟอนต์</SectionHeading>
            {fonts.length === 0 ? (
              <p className="text-csmju-caption text-muted">ไม่พบฟอนต์ที่ค้นหา</p>
            ) : (
              <ul className="flex flex-col">
                {fonts.map((font) => (
                  <li key={font.id}>
                    <button
                      type="button"
                      onClick={() => void applyFont(font.id)}
                      className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-csmju-body text-ink hover:bg-surface-muted"
                      style={{ fontFamily: cssFamily(font.id) }}
                    >
                      {font.label} <span className="ml-2 text-muted">ตัวอย่าง</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <SectionHeading>เซ็ตฟอนต์</SectionHeading>
            {sets.length === 0 ? <p className="text-csmju-caption text-muted">ไม่พบเซ็ตฟอนต์ที่ค้นหา</p> : <FontSetGrid sets={sets} onPick={(s) => void addSet(s)} />}
          </section>
        </>
      ) : (
        <>
          <section className="mb-6">
            <SectionHeading>สไตล์ข้อความเริ่มต้น</SectionHeading>
            <div className="flex flex-col gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => add([createText(page, preset.key, { text: preset.label })])}
                  className={cx('min-h-14 rounded-2xl border border-line-strong px-4 py-3 text-left text-ink hover:bg-surface-muted', preset.className)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>
          {recentSets.length > 0 && (
            <section className="mb-6">
              <SectionHeading>ใช้งานล่าสุด</SectionHeading>
              <FontSetGrid sets={recentSets.slice(0, 4)} onPick={(s) => void addSet(s)} />
            </section>
          )}
          <section>
            <SectionHeading>เซ็ตฟอนต์</SectionHeading>
            <FontSetGrid sets={sets} onPick={(s) => void addSet(s)} />
          </section>
        </>
      )}
    </PanelFrame>
  );
}

function FontSetGrid({ sets, onPick }: { sets: FontSet[]; onPick: (set: FontSet) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {sets.map((set) => (
        <li key={set.key}>
          <button
            type="button"
            onClick={() => onPick(set)}
            aria-label={`เพิ่มเซ็ตฟอนต์ ${set.label}`}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-surface-muted p-3 hover:bg-primary-soft"
          >
            {set.lines.map((line, i) => (
              <span
                key={i}
                aria-hidden
                className="block max-w-full text-center whitespace-pre-line"
                style={{
                  fontFamily: cssFamily(line.font),
                  fontWeight: line.weight,
                  fontStyle: line.italic ? 'italic' : undefined,
                  fontSize: `${Math.max(9, Math.round(line.scale * 360))}px`,
                  lineHeight: 1.15,
                  letterSpacing: line.letterSpacing ? `${line.letterSpacing}px` : undefined,
                  color: line.color,
                }}
              >
                {line.text}
              </span>
            ))}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── อัปโหลด ────────────────────────────────────────────────────────

const ACCEPTED = [ACCEPT.image, ACCEPT.video, ACCEPT.audio].join(',');

type UploadView = { kind: 'library' } | { kind: 'options' } | { kind: 'imported' } | { kind: 'folder'; folder: AssetFolder };

/// แผง "อัปโหลด" (ภาพบรีฟ "พรีเซนเทชั่น 3"): แท็บรูป · โฟลเดอร์ · ปุ่ม "…" = ตัวเลือกการอัปโหลด
function UploadsPanel() {
  const page = usePageSize();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'images' | 'videos' | 'audio' | 'folders'>('images');
  const [view, setView] = useState<UploadView>({ kind: 'library' });
  const [creating, setCreating] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const folders = useQuery({ queryKey: ['asset-folders'], queryFn: () => api.list<AssetFolder>('/asset-folders?limit=100') });
  const targetFolder = view.kind === 'folder' ? view.folder.id : undefined;

  // อัปโหลดทั้งโฟลเดอร์ต้องใช้ attribute ที่ React ไม่รู้จัก — ตั้งตรงที่ DOM
  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, [view]);

  const insertMedia = useInsertMedia();

  const insert = (asset: Asset) => {
    if (mediaKindOf(asset.mimeType) !== 'image') {
      void insertMedia(asset);
      return;
    }

    const img = new Image();

    img.onload = () => {
      const source = {
        src: asset.contentUrl,
        assetId: asset.id,
        naturalWidth: img.naturalWidth || 400,
        naturalHeight: img.naturalHeight || 400,
        name: asset.fileName,
        origin: originOfAsset(asset),
      };

      // กรอบ/ช่องว่างที่เลือกอยู่ = ใส่รูปลงช่องนั้นแทนการเพิ่มรูปใหม่
      if (fillSelectedFrame(source)) return;
      useEditor.getState().addElements([createImage(page, source)]);
    };
    img.onerror = () => toast('เปิดรูปนี้ไม่ได้', 'error');
    img.src = asset.contentUrl;
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['asset-folders'] });
  };

  const upload = useMutation({
    // อัปโหลดขณะเปิดโฟลเดอร์อยู่ = ใส่รูปไว้ในโฟลเดอร์นั้นเลย
    mutationFn: async ({ files, insertFirst, folderId }: { files: File[]; insertFirst: boolean; folderId?: string }) => {
      const done: Asset[] = [];

      useUploadActivity.getState().begin(files.length);

      try {
        for (const file of files) {
          const asset = await api.upload<Asset>('/assets', file);

          done.push(folderId ? await api.patch<Asset>(`/assets/${asset.id}`, { folderId }) : asset);
          useUploadActivity.getState().end();
        }
      } finally {
        useUploadActivity.getState().end(files.length - done.length);
      }

      return { done, insertFirst };
    },
    onSuccess: ({ done, insertFirst }) => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      if (insertFirst && done.length === 1) insert(done[0]);
      else toast(`อัปโหลดแล้ว ${done.length} ไฟล์`);
    },
    onError: (error) => {
      refresh();
      toast(errorMessage(error), 'error');
    },
  });

  const pickFiles = (list: FileList | null, fromFolder: boolean) => {
    const files = Array.from(list ?? []);
    // จากโฟลเดอร์รับเฉพาะรูป (โฟลเดอร์รูป) · ปุ่มอัปโหลดไฟล์รับรูป วิดีโอ และเสียง
    const kinds: MediaKind[] = fromFolder || targetFolder ? ['image'] : ['image', 'video', 'audio'];
    const problems = files.map((file) => uploadProblem(file, kinds)).filter((p): p is string => Boolean(p));
    const images = files.filter((file) => !uploadProblem(file, kinds));

    if (images.length === 0) {
      if (files.length > 0) toast(problems[0] ?? 'ไม่พบไฟล์ที่รองรับ', 'error');
      return;
    }

    if (fromFolder && images.length < files.length) toast(`ข้าม ${files.length - images.length} ไฟล์ที่ไม่ใช่รูป`);
    else if (problems.length) toast(problems[0], 'error');
    upload.mutate({ files: images, insertFirst: !fromFolder, folderId: targetFolder });
    if (view.kind === 'options') setView({ kind: 'library' });
  };

  const inputs = (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED}
        className="sr-only"
        aria-label="เลือกรูป วิดีโอ หรือเสียงที่จะอัปโหลด"
        onChange={(event) => {
          pickFiles(event.target.files, false);
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="sr-only"
        aria-label="เลือกโฟลเดอร์ที่จะอัปโหลด"
        onChange={(event) => {
          pickFiles(event.target.files, true);
          event.target.value = '';
        }}
      />
    </>
  );

  const uploadButtons = (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
        className="group inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-60"
      >
        <UploadIcon className="size-5" /> {upload.isPending ? 'กำลังอัปโหลด…' : 'อัปโหลดไฟล์'}
      </button>
      <button
        type="button"
        onClick={() => setView({ kind: 'options' })}
        aria-label="ตัวเลือกการอัปโหลด"
        title="ตัวเลือกการอัปโหลด"
        className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-on-inverse hover:bg-primary-hover"
      >
        <Ellipsis aria-hidden className="size-6" />
      </button>
    </div>
  );

  if (view.kind === 'options') {
    return (
      <PanelFrame header={<BackHeader title="ตัวเลือกการอัปโหลด" onBack={() => setView({ kind: 'library' })} />}>
        {inputs}
        <button
          type="button"
          onClick={() => folderInput.current?.click()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover"
        >
          <FolderIcon aria-hidden className="size-5" /> อัปโหลดโฟลเดอร์
        </button>
        <p className="mt-3 text-csmju-caption text-muted">อัปโหลดรูปทุกไฟล์ในโฟลเดอร์ที่เลือก (ไฟล์ที่ไม่ใช่รูปจะถูกข้าม)</p>
        <p className="mt-2 text-csmju-caption text-muted">CS Canvas ไม่เชื่อมต่อแอปภายนอก เพื่อไม่ให้ไฟล์ของคุณออกนอกระบบของคณะ</p>
        <section aria-label="แหล่งภาพ" className="mt-6 border-t border-line pt-4">
          <h3 className="mb-3 text-csmju-body font-bold text-ink">แหล่งภาพ</h3>
          <ImageSourcesBrowser onShowImported={() => setView({ kind: 'imported' })} />
        </section>
      </PanelFrame>
    );
  }

  if (view.kind === 'imported') {
    return (
      <PanelFrame header={<BackHeader title="ภาพที่นำเข้า" onBack={() => setView({ kind: 'options' })} />}>
        <ImportedImagesBrowser onOpenSources={() => setView({ kind: 'options' })} />
      </PanelFrame>
    );
  }

  if (view.kind === 'folder') {
    return (
      <PanelFrame
        header={
          <>
            <BackHeader title={view.folder.name} onBack={() => setView({ kind: 'library' })} />
            {inputs}
            {uploadButtons}
          </>
        }
      >
        <AssetGrid q="" folderId={view.folder.id} folders={folders.data?.items ?? []} onInsert={insert} emptyText="โฟลเดอร์นี้ยังว่าง — อัปโหลดตอนเปิดโฟลเดอร์อยู่ หรือย้ายรูปเข้ามาจากเมนู … ของรูป" />
      </PanelFrame>
    );
  }

  return (
    <PanelFrame
      header={
        <>
          <PanelSearch id="upload-search" label="ค้นหาชื่อไฟล์" value={q} onChange={setQ} />
          {inputs}
          {uploadButtons}
          <div role="tablist" aria-label="ชนิดไฟล์อัปโหลด" className="flex gap-6">
            {(
              [
                ['images', 'รูป'],
                ['videos', 'วิดีโอ'],
                ['audio', 'เสียง'],
                ['folders', 'โฟลเดอร์'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cx(
                  'min-h-11 border-b-4 px-1 text-csmju-body transition-colors',
                  tab === key ? 'border-primary font-semibold text-ink' : 'border-transparent text-body hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      }
    >
      {tab === 'images' ? (
        <>
          <p className="mb-3 text-csmju-caption text-muted">รูป PNG, JPEG, WebP, GIF, SVG ไม่เกิน 10 MB · วิดีโอและเสียงไม่เกิน 50 MB · ไฟล์ของคุณเห็นได้เฉพาะคุณ · ลากรูปไปวางบนกรอบหรือกริดเพื่อใส่รูปในช่อง</p>
          <AssetGrid q={q.trim()} folders={folders.data?.items ?? []} onInsert={insert} emptyText={q.trim() ? 'ไม่พบรูปที่ค้นหา' : null} />
        </>
      ) : tab === 'videos' ? (
        <VideoLibrary q={q.trim()} showUpload={false} />
      ) : tab === 'audio' ? (
        <AudioLibrary q={q.trim()} showUpload={false} />
      ) : folders.isLoading ? (
        <Spinner />
      ) : folders.isError ? (
        <ErrorState message={errorMessage(folders.error)} onRetry={() => void folders.refetch()} />
      ) : folders.data!.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-6 py-8 text-center">
          <span className="relative flex size-24 items-center justify-center">
            <span aria-hidden className="absolute inset-2 rotate-6 rounded-3xl bg-type-teal/30" />
            <span className="relative flex size-18 items-center justify-center rounded-2xl bg-pastel-aqua text-type-teal shadow-csmju-md">
              <FolderOpen aria-hidden className="size-9" />
            </span>
          </span>
          <h3 className="text-csmju-body font-bold text-ink">จัดระเบียบรายการอัปโหลดของคุณ</h3>
          <p className="text-csmju-caption text-body">ทำให้รายการอัปโหลดของคุณเป็นระเบียบโดยย้ายไปที่โฟลเดอร์</p>
          <Button onClick={() => setCreating(true)}>
            <FolderPlus aria-hidden className="size-5" /> สร้างโฟลเดอร์
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          <li>
            <button type="button" onClick={() => setCreating(true)} className="flex min-h-18 w-full items-center gap-4 rounded-2xl px-2 text-left hover:bg-surface-muted">
              <span className="inline-flex size-16 items-center justify-center rounded-2xl border border-dashed border-line-strong text-ink">
                <Plus aria-hidden className="size-6" />
              </span>
              <span className="text-csmju-body font-bold text-ink">สร้างโฟลเดอร์</span>
            </button>
          </li>
          {folders.data!.items.map((folder) => (
            <li key={folder.id} className="flex items-center gap-1">
              <button type="button" onClick={() => setView({ kind: 'folder', folder })} className="flex min-h-18 min-w-0 flex-1 items-center gap-4 rounded-2xl px-2 text-left hover:bg-surface-muted">
                <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-2xl bg-pastel-aqua text-ink">
                  <FolderIcon aria-hidden className="size-6" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-csmju-body font-bold text-ink">{folder.name}</span>
                  <span className="block text-csmju-caption text-muted">{folder.assetCount} รูป</span>
                </span>
              </button>
              <AssetFolderMenu folder={folder} />
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateFolderDialog endpoint="/asset-folders" queryKey="asset-folders" onClose={() => setCreating(false)} />}
    </PanelFrame>
  );
}

/// เมนูของโฟลเดอร์รูป: เปลี่ยนชื่อ · ลบ (รูปข้างในยังอยู่)
function AssetFolderMenu({ folder }: { folder: AssetFolder }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['asset-folders'] });
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
  };

  return (
    <Menu
      label={`ตัวเลือกของโฟลเดอร์ ${folder.name}`}
      trigger={<Ellipsis aria-hidden className="size-5" />}
      triggerClassName="bg-transparent shadow-none hover:bg-surface-muted"
      items={[
        {
          label: 'เปลี่ยนชื่อ',
          icon: <Pencil aria-hidden className="size-4" />,
          onSelect: () => {
            const name = window.prompt('ชื่อโฟลเดอร์ใหม่', folder.name)?.trim();

            if (!name || name === folder.name) return;
            api.patch(`/asset-folders/${folder.id}`, { name: name.slice(0, 80) }).then(refresh, (error: unknown) => toast(errorMessage(error), 'error'));
          },
        },
        {
          label: 'ลบโฟลเดอร์ (รูปยังอยู่)',
          icon: <Trash2 aria-hidden className="size-4" />,
          danger: true,
          onSelect: () => {
            if (!window.confirm(`ลบโฟลเดอร์ “${folder.name}”? รูปข้างในจะยังอยู่ในแท็บรูป`)) return;
            api.del(`/asset-folders/${folder.id}`).then(
              () => {
                refresh();
                toast(`ลบโฟลเดอร์ “${folder.name}” แล้ว`);
              },
              (error: unknown) => toast(errorMessage(error), 'error'),
            );
          },
        },
      ]}
    />
  );
}

/// ตารางรูปแบบก่ออิฐ (สูงตามสัดส่วนรูป) + เมนู … ของแต่ละรูป: ย้ายไปโฟลเดอร์ · ถังขยะ
function AssetGrid({
  q,
  folderId,
  folders,
  onInsert,
  emptyText,
}: {
  q: string;
  folderId?: string;
  folders: AssetFolder[];
  onInsert: (asset: Asset) => void;
  emptyText: string | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const assets = useQuery({
    queryKey: ['assets', 'library', q, folderId ?? ''],
    queryFn: () => api.list<Asset>(`/assets${qs({ q: q || undefined, folderId, kind: 'image', limit: 60 })}`),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { trashed?: boolean; folderId?: string | null } }) => api.patch<Asset>(`/assets/${id}`, body),
    onSuccess: (_asset, { body }) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['asset-folders'] });
      toast(body.trashed ? 'ย้ายรูปไปถังขยะแล้ว' : body.folderId ? `ย้ายไป “${folders.find((f) => f.id === body.folderId)?.name ?? 'โฟลเดอร์'}” แล้ว` : 'เอาออกจากโฟลเดอร์แล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (assets.isLoading) return <Spinner />;
  if (assets.isError) return <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />;

  if (assets.data!.items.length === 0) {
    return emptyText ? (
      <p className="text-csmju-caption text-muted">{emptyText}</p>
    ) : (
      <EmptyState title="ยังไม่มีรูป" description="รูปที่อัปโหลดจะเก็บไว้ที่นี่ ใช้ซ้ำในงานอื่นได้" />
    );
  }

  return (
    <ul className="columns-2 gap-2">
      {assets.data!.items.map((asset) => (
        <li key={asset.id} className="group relative mb-2 break-inside-avoid">
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              const img = event.currentTarget.querySelector('img');

              setImageDragData(event.dataTransfer, {
                src: asset.contentUrl,
                assetId: asset.id,
                naturalWidth: img?.naturalWidth || 400,
                naturalHeight: img?.naturalHeight || 400,
                name: asset.fileName,
                origin: originOfAsset(asset),
              });
            }}
            onClick={() => onInsert(asset)}
            aria-label={`ใส่รูป ${asset.fileName}`}
            title={asset.fileName}
            className="csmju-checker block w-full overflow-hidden rounded-xl border border-line hover:shadow-csmju-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
            <img src={asset.contentUrl} alt="" className="block w-full" loading="lazy" />
          </button>
          <div className="absolute top-1 right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100">
            <Menu
              label={`ตัวเลือกของรูป ${asset.fileName}`}
              trigger={<Ellipsis aria-hidden className="size-5" />}
              items={[
                ...folders
                  .filter((f) => f.id !== asset.folderId)
                  .map((f) => ({
                    label: `ย้ายไป “${f.name}”`,
                    icon: <FolderInput aria-hidden className="size-4" />,
                    onSelect: () => patch.mutate({ id: asset.id, body: { folderId: f.id } }),
                  })),
                ...(asset.folderId
                  ? [{ label: 'เอาออกจากโฟลเดอร์', icon: <FolderMinus aria-hidden className="size-4" />, onSelect: () => patch.mutate({ id: asset.id, body: { folderId: null } }) }]
                  : []),
                { label: 'ย้ายไปถังขยะ', icon: <Trash2 aria-hidden className="size-4" />, danger: true, onSelect: () => patch.mutate({ id: asset.id, body: { trashed: true } }) },
              ]}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── เลเยอร์ ────────────────────────────────────────────────────────

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

// ── หน้า ───────────────────────────────────────────────────────────

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

/// ไอคอนดาวของรายการ "ติดดาวแล้ว" ที่ปักไว้ล่างสุดของแถบซ้าย
export const StarredIcon = Star;
