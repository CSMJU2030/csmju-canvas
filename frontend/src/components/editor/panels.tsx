'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, Ellipsis, Eye, EyeOff, Folder as FolderIcon, FolderOpen, ImageIcon,
  LayoutPanelLeft, Lock, LockOpen, PenLine, Plus, Search, Shapes, Smile, Spline, Star, StickyNote, Trash2, Type, CloudUpload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, EmptyState, ErrorState, IconButton, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { Thumbnail } from '@/components/designs/cards';
import { api, qs } from '@/lib/csmju/api';
import {
  FONT_SETS, STICKY_COLORS, createFontSet, createImage, createShape, createSticky, createSvg, createText, layerLabel,
  textPresetText, type FontSet, type TextPreset,
} from '@/lib/editor/factory';
import { fitTemplate } from '@/lib/editor/fit-template';
import { cssFamily, ensureFont } from '@/lib/editor/fonts';
import { ICONS, iconSvg } from '@/lib/editor/icons';
import { pushRecent, useRecent } from '@/lib/editor/recent';
import { measureTextHeight, renderPageToCanvas } from '@/lib/editor/render';
import { currentPage, useEditor } from '@/lib/editor/store';
import { normalizeDocument, type ShapeKind } from '@/lib/editor/types';
import type { Asset, Template, TemplateSummary } from '@/lib/types';
import { matchFonts, usePreloadFonts } from './font-picker';
import { ProjectsPanel } from './project-panel';
import { SignaturePanel } from './signature-panel';
import { LINES, SHAPES, ShapeGlyph } from './tools-palette';

/// แผงด้านซ้ายของหน้าแก้ไข — เรียงตาม Canva (ภาพบรีฟชุด "พรีเซนเทชั่น" ใช้กับดีไซน์ทุกประเภท)
///
/// แถบซ้าย: เทมเพลต · องค์ประกอบ · ข้อความ · อัปโหลด · เครื่องมือ · โปรเจกต์ · (ล่างสุด) ติดดาวแล้ว
/// "เครื่องมือ" ไม่ใช่แผง แต่เปิดแถบเครื่องมือลอย (tools-palette.tsx)
/// เลเยอร์และหน้า เปิดจากแถบล่าง · ลายเซ็นเปิดจากแถบเครื่องมือ

export type PanelKey = 'templates' | 'elements' | 'text' | 'uploads' | 'projects' | 'starred' | 'signature' | 'layers' | 'pages';
export type RailKey = 'templates' | 'elements' | 'text' | 'uploads' | 'tools' | 'projects';

type IconType = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean; strokeWidth?: number }>;

/// รายการบนแถบซ้าย · `tone` คือสีไอคอนตอนเลือก (แบบไอคอนสีของ Canva)
export const RAIL: { key: RailKey; label: string; icon: IconType; tone: string }[] = [
  { key: 'templates', label: 'เทมเพลต', icon: LayoutPanelLeft, tone: 'text-type-teal' },
  { key: 'elements', label: 'องค์ประกอบ', icon: Shapes, tone: 'text-type-purple' },
  { key: 'text', label: 'ข้อความ', icon: Type, tone: 'text-type-magenta' },
  { key: 'uploads', label: 'อัปโหลด', icon: CloudUpload, tone: 'text-type-orange' },
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
  signature: 'สร้างลายเซ็น',
  layers: 'เลเยอร์',
  pages: 'หน้า',
};

export function PanelContent({
  panel,
  onNavigate,
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
      return <ElementsPanel onNavigate={onNavigate} />;
    case 'text':
      return <TextPanel />;
    case 'uploads':
      return <UploadsPanel />;
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
  }
}

/// ส่วนหัวของแผงอยู่กับที่ เนื้อหาเลื่อนได้ (แบบ Canva ที่ช่องค้นหาไม่เลื่อนหายไป)
function PanelFrame({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-3">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </div>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-csmju-body font-bold text-ink">{children}</h2>;
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="-ml-2 inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-muted">
        <ArrowLeft aria-hidden className="size-5" />
      </button>
      <h2 className="text-csmju-body font-bold text-ink">{title}</h2>
    </div>
  );
}

function usePageSize() {
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);

  return { width, height };
}

/// ช่องค้นหาบนสุดของแผง (กรอบขาวมุมมน แบบ Canva)
function PanelSearch({ id, label, value, onChange, onSubmit }: { id: string; label: string; value: string; onChange: (v: string) => void; onSubmit?: () => void }) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className="relative"
    >
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink" />
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="min-h-14 w-full rounded-2xl border border-line-strong bg-surface pr-4 pl-12 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none"
      />
    </form>
  );
}

function SectionHeading({ children, onSeeAll, seeAllLabel = 'ดูทั้งหมด' }: { children: ReactNode; onSeeAll?: () => void; seeAllLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-csmju-body font-bold text-ink">{children}</h3>
      {onSeeAll && (
        <button type="button" onClick={onSeeAll} className="min-h-11 px-2 text-csmju-caption font-semibold text-ink hover:underline">
          {seeAllLabel}
        </button>
      )}
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
  const recent = useRecent<RecentTemplate>('templates');
  const toast = useToast();
  const sameType = useQuery({
    queryKey: ['templates', 'editor', designType],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ designType, sort: 'popular', limit: 30 })}`),
  });
  const all = useQuery({
    queryKey: ['templates', 'editor-all', q],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ q: q || undefined, sort: 'popular', limit: 40 })}`),
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
          <PanelSearch id="template-search" label="ค้นหาเทมเพลต" value={draft} onChange={setDraft} onSubmit={() => setQ(draft.trim())} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setQ(draft.trim())}
              className="min-h-12 flex-1 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover"
            >
              ค้นหา
            </button>
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  setDraft('');
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
      {!q && recent.length > 0 && (
        <section className="mb-6">
          <SectionHeading onSeeAll={recent.length > 2 ? () => setShowAllRecent((v) => !v) : undefined} seeAllLabel={showAllRecent ? 'ย่อ' : 'ดูทั้งหมด'}>
            ใช้งานล่าสุด
          </SectionHeading>
          <TemplateGrid items={showAllRecent ? recent : recent.slice(0, 2)} onPick={(t) => void apply(t)} />
        </section>
      )}
      <section>
        <SectionHeading>{q ? `ผลการค้นหา “${q}”` : 'เทมเพลตอื่นๆ ที่เหมาะกับคุณ'}</SectionHeading>
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

// ── องค์ประกอบ ─────────────────────────────────────────────────────

type Category = 'shapes' | 'lines' | 'graphics' | 'sticky';

/// id ของสิ่งที่กดใช้ ("shape:rect" "icon:heart" ฯลฯ) — ใช้ทั้งเพิ่มลงหน้าและเก็บใน "ใช้งานล่าสุด"
interface RecentElement {
  id: string;
}

function addElementById(id: string, page: { width: number; height: number }) {
  const [kind, key] = id.split(':');
  const add = useEditor.getState().addElements;

  if (kind === 'shape') {
    const rounded = key === 'rect-rounded';

    add([createShape(page, (rounded ? 'rect' : key) as ShapeKind, { rounded })]);
  } else if (kind === 'icon') {
    const entry = ICONS.find((icon) => icon.name === key);

    if (!entry) return;
    add([createSvg(page, iconSvg(entry), entry.label)]);
  } else if (kind === 'sticky') {
    add(createSticky(page, key));
  } else {
    return;
  }

  pushRecent<RecentElement>('elements', { id });
}

function elementLabel(id: string): string {
  const [kind, key] = id.split(':');

  if (kind === 'shape') return key === 'rect-rounded' ? 'สี่เหลี่ยมมุมโค้ง' : SHAPES.find((s) => s.kind === key && !s.rounded)?.label ?? LINES.find((l) => l.kind === key)?.label ?? key;
  if (kind === 'icon') return ICONS.find((icon) => icon.name === key)?.label ?? key;
  if (kind === 'sticky') return `โน้ตสี${STICKY_COLORS.find((c) => c.key === key)?.label ?? ''}`;

  return id;
}

function ElementGlyph({ id, className = 'size-10' }: { id: string; className?: string }) {
  const [kind, key] = id.split(':');

  if (kind === 'shape') {
    const line = LINES.find((l) => l.kind === key);

    if (line) {
      return (
        <svg aria-hidden viewBox="0 0 24 24" className={cx(className, 'text-ink')} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d={line.path} />
        </svg>
      );
    }

    return <ShapeGlyph kind={(key === 'rect-rounded' ? 'rect' : key) as ShapeKind} rounded={key === 'rect-rounded'} className={cx(className, 'text-type-teal')} />;
  }

  if (kind === 'icon') {
    const entry = ICONS.find((icon) => icon.name === key);

    return entry ? <entry.icon aria-hidden className={cx(className, 'text-ink')} /> : null;
  }

  const sticky = STICKY_COLORS.find((c) => c.key === key);

  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2z" style={{ fill: sticky?.fill }} />
      <path d="M14 21v-5a2 2 0 0 1 2-2h5z" style={{ fill: sticky?.swatch }} />
    </svg>
  );
}

const CATEGORIES: { key: Category | 'photos'; label: string; icon: IconType; tone: string; soft: string }[] = [
  { key: 'shapes', label: 'รูปทรง', icon: Shapes, tone: 'bg-type-teal', soft: 'bg-type-teal/35' },
  { key: 'graphics', label: 'กราฟิก', icon: Smile, tone: 'bg-type-orange', soft: 'bg-type-orange/35' },
  { key: 'photos', label: 'รูปของฉัน', icon: ImageIcon, tone: 'bg-type-blue', soft: 'bg-type-blue/35' },
  { key: 'lines', label: 'เส้น', icon: Spline, tone: 'bg-type-indigo', soft: 'bg-type-indigo/35' },
  { key: 'sticky', label: 'โน้ตแปะ', icon: StickyNote, tone: 'bg-type-pink', soft: 'bg-type-pink/35' },
];

function categoryItems(category: Category): string[] {
  switch (category) {
    case 'shapes':
      return SHAPES.map((s) => (s.rounded ? 'shape:rect-rounded' : `shape:${s.kind}`)).concat('shape:arrow');
    case 'lines':
      return LINES.map((l) => `shape:${l.kind}`).concat('shape:arrow');
    case 'graphics':
      return ICONS.map((icon) => `icon:${icon.name}`);
    case 'sticky':
      return STICKY_COLORS.map((c) => `sticky:${c.key}`);
  }
}

function ElementsPanel({ onNavigate }: { onNavigate: (panel: PanelKey) => void }) {
  const page = usePageSize();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const recent = useRecent<RecentElement>('elements');
  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return [];

    const all = [...categoryItems('shapes'), ...categoryItems('lines'), ...categoryItems('sticky'), ...categoryItems('graphics')];

    return [...new Set(all)].filter((id) => elementLabel(id).toLowerCase().includes(term) || id.includes(term));
  }, [term]);

  if (category) {
    const meta = CATEGORIES.find((c) => c.key === category)!;

    return (
      <PanelFrame header={<BackHeader title={meta.label} onBack={() => setCategory(null)} />}>
        <ElementGrid ids={categoryItems(category)} onPick={(id) => addElementById(id, page)} columns={category === 'graphics' ? 4 : 3} />
        {category === 'graphics' && <p className="mt-3 text-csmju-caption text-muted">กราฟิกจาก Lucide (สัญญาอนุญาต ISC) ใช้ได้ฟรี</p>}
      </PanelFrame>
    );
  }

  return (
    <PanelFrame header={<PanelSearch id="elements-search" label="ค้นหาองค์ประกอบ" value={q} onChange={setQ} />}>
      {term ? (
        <section>
          <SectionHeading>ผลการค้นหา</SectionHeading>
          {results.length === 0 ? <p className="text-csmju-caption text-muted">ไม่พบองค์ประกอบที่ค้นหา</p> : <ElementGrid ids={results} onPick={(id) => addElementById(id, page)} columns={4} />}
        </section>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="mb-6">
              <SectionHeading>ใช้งานล่าสุด</SectionHeading>
              <ul className="csmju-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {recent.map((item) => (
                  <li key={item.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => addElementById(item.id, page)}
                      aria-label={`เพิ่ม ${elementLabel(item.id)}`}
                      title={elementLabel(item.id)}
                      className="flex size-22 items-center justify-center rounded-xl bg-surface-muted hover:bg-primary-soft"
                    >
                      <ElementGlyph id={item.id} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <SectionHeading>เลือกดูหมวดหมู่</SectionHeading>
            <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
              {CATEGORIES.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => (c.key === 'photos' ? onNavigate('uploads') : setCategory(c.key))}
                    className="group flex w-full flex-col items-center gap-2 text-csmju-caption text-ink"
                  >
                    <span className="relative flex size-20 items-center justify-center">
                      <span aria-hidden className={cx('absolute inset-1 translate-x-1 rotate-6 rounded-2xl', c.soft)} />
                      <span className={cx('relative flex size-18 items-center justify-center rounded-2xl text-on-inverse shadow-csmju-md transition-transform group-hover:-translate-y-0.5', c.tone)}>
                        <c.icon aria-hidden className="csmju-wiggle size-9" strokeWidth={2.2} />
                      </span>
                    </span>
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </PanelFrame>
  );
}

function ElementGrid({ ids, onPick, columns }: { ids: string[]; onPick: (id: string) => void; columns: 3 | 4 }) {
  return (
    <ul className={cx('grid gap-2', columns === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {ids.map((id) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => onPick(id)}
            aria-label={`เพิ่ม ${elementLabel(id)}`}
            title={elementLabel(id)}
            className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-muted hover:bg-primary-soft"
          >
            <ElementGlyph id={id} className={columns === 4 ? 'size-8' : 'size-12'} />
          </button>
        </li>
      ))}
    </ul>
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

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

function UploadsPanel() {
  const page = usePageSize();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'library' | 'options'>('library');
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const assets = useQuery({
    queryKey: ['assets', 'library', q.trim()],
    queryFn: () => api.list<Asset>(`/assets${qs({ q: q.trim() || undefined, limit: 60 })}`),
  });

  // อัปโหลดทั้งโฟลเดอร์ต้องใช้ attribute ที่ React ไม่รู้จัก — ตั้งตรงที่ DOM
  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, [view]);

  const insert = (asset: Asset) => {
    const img = new Image();

    img.onload = () =>
      useEditor.getState().addElements([
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

  const upload = useMutation({
    mutationFn: async ({ files, insertFirst }: { files: File[]; insertFirst: boolean }) => {
      const done: Asset[] = [];

      for (const file of files) done.push(await api.upload<Asset>('/assets', file));

      return { done, insertFirst };
    },
    onSuccess: ({ done, insertFirst }) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      if (insertFirst && done.length === 1) insert(done[0]);
      else toast(`อัปโหลดแล้ว ${done.length} รูป`);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast(errorMessage(error), 'error');
    },
  });
  const trash = useMutation({
    mutationFn: (id: string) => api.patch(`/assets/${id}`, { trashed: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast('ย้ายรูปไปถังขยะแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const pickFiles = (list: FileList | null, fromFolder: boolean) => {
    const files = Array.from(list ?? []);
    const images = files.filter((file) => ACCEPTED.includes(file.type));

    if (images.length === 0) {
      if (files.length > 0) toast('ไม่พบไฟล์รูปที่รองรับ (PNG, JPEG, WebP, GIF, SVG)', 'error');
      return;
    }

    if (fromFolder && images.length < files.length) toast(`ข้าม ${files.length - images.length} ไฟล์ที่ไม่ใช่รูป`);
    upload.mutate({ files: images, insertFirst: !fromFolder });
    setView('library');
  };

  const inputs = (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED.join(',')}
        className="sr-only"
        aria-label="เลือกรูปที่จะอัปโหลด"
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

  if (view === 'options') {
    return (
      <PanelFrame header={<BackHeader title="ตัวเลือกการอัปโหลด" onBack={() => setView('library')} />}>
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
      </PanelFrame>
    );
  }

  return (
    <PanelFrame
      header={
        <>
          <PanelSearch id="upload-search" label="ค้นหาชื่อไฟล์" value={q} onChange={setQ} />
          {inputs}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={upload.isPending}
              onClick={() => input.current?.click()}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-60"
            >
              {upload.isPending ? 'กำลังอัปโหลด…' : 'อัปโหลดไฟล์'}
            </button>
            <button
              type="button"
              onClick={() => setView('options')}
              aria-label="ตัวเลือกการอัปโหลด"
              title="ตัวเลือกการอัปโหลด"
              className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-on-inverse hover:bg-primary-hover"
            >
              <Ellipsis aria-hidden className="size-6" />
            </button>
          </div>
        </>
      }
    >
      <p className="mb-3 text-csmju-caption text-muted">PNG, JPEG, WebP, GIF, SVG ไม่เกิน 10 MB · รูปของคุณเห็นได้เฉพาะคุณ</p>
      {assets.isLoading ? (
        <Spinner />
      ) : assets.isError ? (
        <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />
      ) : assets.data!.items.length === 0 ? (
        q.trim() ? (
          <p className="text-csmju-caption text-muted">ไม่พบรูปที่ค้นหา</p>
        ) : (
          <EmptyState title="ยังไม่มีรูป" description="รูปที่อัปโหลดจะเก็บไว้ที่นี่ ใช้ซ้ำในงานอื่นได้" />
        )
      ) : (
        <ul className="columns-2 gap-2">
          {assets.data!.items.map((asset) => (
            <li key={asset.id} className="group relative mb-2 break-inside-avoid">
              <button
                type="button"
                onClick={() => insert(asset)}
                aria-label={`ใส่รูป ${asset.fileName}`}
                title={asset.fileName}
                className="csmju-checker block w-full overflow-hidden rounded-xl border border-line hover:shadow-csmju-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
                <img src={asset.contentUrl} alt="" className="block w-full" loading="lazy" />
              </button>
              <IconButton
                label={`ย้าย ${asset.fileName} ไปถังขยะ`}
                onClick={() => trash.mutate(asset.id)}
                className="absolute top-1 right-1 bg-surface/90 text-danger opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              >
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
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
