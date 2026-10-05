'use client';

import { ChevronRight } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErrorState, Spinner, cx, errorMessage } from '@/components/csmju/primitives';
import { STICKY_COLORS, createImage, createShape, createSticky, createSvg } from '@/lib/editor/factory';
import { fillSelectedFrame, setImageDragData } from '@/lib/editor/frame-actions';
import {
  designTerms, gradientItems, graphicColor, parseGradientId, rankWords, recommendedGraphics, suggestGraphics, documentText,
  type GradientItem, type GradientShape,
} from '@/lib/editor/graphics-suggest';
import { ICONS, iconSvg } from '@/lib/editor/icons';
import {
  ICON_CATEGORY_TH, iconMarkup, loadIcons, loadPhotos, loadStickers, matchIcon, matchPhoto, matchSticker, photoSrc, photoThumb,
  searchTerms, stickerSrc, type LibraryIcon, type LibraryPhoto,
} from '@/lib/editor/library';
import { parseGradient } from '@/lib/editor/paint';
import { pushRecent, useRecent } from '@/lib/editor/recent';
import { useEditor } from '@/lib/editor/store';
import type { ShapeKind } from '@/lib/editor/types';
import { CHART_PRESETS, FRAME_PRESETS, GRID_PRESETS, TABLE_PRESETS, type ElementPreset } from './element-presets';
import { CategoryTile, type TileKind } from './element-tiles';
import { AudioLibrary, VideoLibrary } from './media-panel';
import { BackHeader, PanelFrame, PanelSearch, SectionHeading, useLibrary, usePageSize } from './panel-parts';
import { LINES, SHAPES, ShapeGlyph } from './tools-palette';

/// แผง "องค์ประกอบ" แบบ Canva (ภาพบรีฟ 245 · 246 · 247)
///
/// หน้าแรก: ช่องค้นหา · ใช้งานล่าสุด · ไทล์หมวด (รูปทรง กราฟิก ภาพถ่าย วิดีโอ เสียง สติกเกอร์ ตาราง ชาร์ต กรอบ กริด …)
/// หมวด "กราฟิก" มีแถว ใช้งานล่าสุด · น่าจะเข้ากับดีไซน์ของคุณ · แนะนำ · การไล่เฉดสี แต่ละแถวมี "ดูทั้งหมด"
/// วิดีโอและเสียงมาจากไฟล์ที่ผู้ใช้อัปโหลดเองเท่านั้น (ไม่มีคลังสำเร็จรูปจากภายนอก)
/// ไม่มีปุ่มสร้างด้วย AI — กราฟิกทั้งหมดมาจากคลังสัญญาอนุญาตเปิดใน public/library

type Category = TileKind;

/// สิ่งที่กดใช้ ("shape:rect" "icon:heart" "tabler:star" "sticker:1f600" "photo:cma-123" "gradient:4:star")
/// เก็บข้อมูลพอสร้างซ้ำได้ใน "ใช้งานล่าสุด"
export interface RecentElement {
  id: string;
  /// เนื้อ SVG ของกราฟิก Tabler
  d?: string;
  /// สีของกราฟิก Tabler (หน้า "กราฟิก" ใส่สีให้ · ไม่มี = สีเข้ม)
  c?: string;
  /// ขนาดภาพของภาพถ่าย
  w?: number;
  h?: number;
}

const INK = 'rgb(15 23 42)';

/// หมวดที่เป็นช่องเสียบชุดสำเร็จรูป — ไทล์แสดงเมื่อมีรายการเท่านั้น
const PRESET_SOURCES: Partial<Record<Category, ElementPreset[]>> = {
  tables: TABLE_PRESETS,
  charts: CHART_PRESETS,
  frames: FRAME_PRESETS,
  grids: GRID_PRESETS,
};

/// ลำดับไทล์ตามภาพบรีฟ 245 (ตัดหมวดที่ระบบยังไม่มีหรือเป็น AI ออก) แล้วตามด้วยหมวดเดิมของระบบ
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'shapes', label: 'รูปทรง' },
  { key: 'graphics', label: 'กราฟิก' },
  { key: 'photos', label: 'ภาพถ่าย' },
  { key: 'videos', label: 'วิดีโอ' },
  { key: 'audio', label: 'เสียง' },
  { key: 'stickers', label: 'สติกเกอร์' },
  { key: 'tables', label: 'ตาราง' },
  { key: 'charts', label: 'ชาร์ต' },
  { key: 'frames', label: 'กรอบ' },
  { key: 'grids', label: 'กริด' },
  { key: 'lines', label: 'เส้น' },
  { key: 'icons', label: 'ไอคอน' },
  { key: 'sticky', label: 'โน้ตแปะ' },
];

function visibleCategories() {
  return CATEGORIES.filter((c) => {
    const presets = PRESET_SOURCES[c.key];

    return !presets || presets.length > 0;
  });
}

function insertImage(page: { width: number; height: number }, src: string, naturalWidth: number, naturalHeight: number, name: string) {
  const source = { src, assetId: null, naturalWidth, naturalHeight, name };

  // กรอบ/ช่องว่างที่เลือกอยู่ = ใส่รูปลงช่องนั้นแทนการเพิ่มรูปใหม่
  if (fillSelectedFrame(source)) return;
  useEditor.getState().addElements([createImage(page, source)]);
}

function addElement(item: RecentElement, page: { width: number; height: number }) {
  const [kind, key] = item.id.split(':');
  const add = useEditor.getState().addElements;

  if (kind === 'shape') {
    const rounded = key === 'rect-rounded';

    add([createShape(page, (rounded ? 'rect' : key) as ShapeKind, { rounded })]);
  } else if (kind === 'icon') {
    const entry = ICONS.find((icon) => icon.name === key);

    if (!entry) return;
    add([createSvg(page, iconSvg(entry), entry.label)]);
  } else if (kind === 'tabler' && item.d) {
    add([{ ...createSvg(page, iconMarkup({ d: item.d }), key.replace(/-/g, ' ')), color: item.c ?? INK }]);
  } else if (kind === 'gradient') {
    const gradient = parseGradientId(item.id);

    if (!gradient) return;

    const rounded = gradient.shape === 'rect-rounded';

    add([{ ...createShape(page, rounded ? 'rect' : (gradient.shape as ShapeKind), { rounded }), fill: gradient.paint, name: 'กราฟิกไล่เฉดสี' }]);
  } else if (kind === 'sticker') {
    insertImage(page, stickerSrc(key), 128, 128, 'สติกเกอร์');
  } else if (kind === 'photo' && item.w && item.h) {
    insertImage(page, photoSrc(key), item.w, item.h, 'ภาพถ่าย');
  } else if (kind === 'sticky') {
    add(createSticky(page, key));
  } else {
    return;
  }

  pushRecent<RecentElement>('elements', item);
}

const GRADIENT_SHAPE_TH: Record<GradientShape, string> = {
  ellipse: 'วงกลม',
  'rect-rounded': 'สี่เหลี่ยมมุมโค้ง',
  star: 'ดาว',
  hexagon: 'หกเหลี่ยม',
  diamond: 'ข้าวหลามตัด',
  triangle: 'สามเหลี่ยม',
};

function elementLabel(id: string): string {
  const [kind, key] = id.split(':');

  if (kind === 'shape') return key === 'rect-rounded' ? 'สี่เหลี่ยมมุมโค้ง' : SHAPES.find((s) => s.kind === key && !s.rounded)?.label ?? LINES.find((l) => l.kind === key)?.label ?? key;
  if (kind === 'icon') return ICONS.find((icon) => icon.name === key)?.label ?? key;
  if (kind === 'sticky') return `โน้ตสี${STICKY_COLORS.find((c) => c.key === key)?.label ?? ''}`;
  if (kind === 'tabler') return `กราฟิก ${key.replace(/-/g, ' ')}`;
  if (kind === 'gradient') {
    const gradient = parseGradientId(id);

    return gradient ? `${GRADIENT_SHAPE_TH[gradient.shape]}ไล่เฉดสี` : 'กราฟิกไล่เฉดสี';
  }
  if (kind === 'sticker') return 'สติกเกอร์';
  if (kind === 'photo') return 'ภาพถ่าย';

  return id;
}

function ElementGlyph({ item, className = 'size-10' }: { item: RecentElement; className?: string }) {
  const [kind, key] = item.id.split(':');

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

  if (kind === 'tabler' && item.d) {
    return <GraphicGlyph d={item.d} color={item.c} className={className} />;
  }

  if (kind === 'gradient') {
    const gradient = parseGradientId(item.id);

    return gradient ? <GradientGlyph paint={gradient.paint} shape={gradient.shape} className={className} /> : null;
  }

  if (kind === 'sticker') {
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ SVG ในคลังของระบบ
    return <img src={stickerSrc(key)} alt="" className={className} loading="lazy" />;
  }

  if (kind === 'photo') {
    // eslint-disable-next-line @next/next/no-img-element -- ภาพย่อในคลังของระบบ
    return <img src={photoThumb(key)} alt="" className="size-full object-cover" loading="lazy" />;
  }

  const sticky = STICKY_COLORS.find((c) => c.key === key);

  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2z" style={{ fill: sticky?.fill }} />
      <path d="M14 21v-5a2 2 0 0 1 2-2h5z" style={{ fill: sticky?.swatch }} />
    </svg>
  );
}

/// กราฟิกเส้น Tabler (SVG จากคลังในระบบ ไม่ใช่ข้อมูลจากผู้ใช้) · ไม่ใส่สี = สีตัวอักษรของธีม
function GraphicGlyph({ d, color, className = 'size-7' }: { d: string; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(className, 'block [&>svg]:size-full', !color && 'text-ink')}
      style={color ? { color } : undefined}
      dangerouslySetInnerHTML={{ __html: iconMarkup({ d }, 1.6) }}
    />
  );
}

/// รูปทรงไล่เฉดสีวาดด้วย SVG gradient ให้ตรงกับที่จะวาดลงผืนผ้าใบ
function GradientGlyph({ paint, shape, className = 'size-12' }: { paint: string; shape: GradientShape; className?: string }) {
  // id ของ gradient ต้องไม่ชนกันระหว่างไทล์ และใช้ใน url(#…) ได้ตรง ๆ
  const id = `g${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const g = parseGradient(paint);

  if (!g) return null;

  const stops = g.stops.map((s, i) => <stop key={i} offset={`${Math.round(s.at * 100)}%`} stopColor={s.color} />);
  const rad = ((g.angle - 90) * Math.PI) / 180;
  const props = { fill: `url(#${id})` };

  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <defs>
        {g.type === 'radial' ? (
          <radialGradient id={id} cx="50%" cy="50%" r="70%">
            {stops}
          </radialGradient>
        ) : (
          <linearGradient id={id} x1={0.5 - Math.cos(rad) / 2} y1={0.5 - Math.sin(rad) / 2} x2={0.5 + Math.cos(rad) / 2} y2={0.5 + Math.sin(rad) / 2}>
            {stops}
          </linearGradient>
        )}
      </defs>
      {shape === 'ellipse' && <circle cx={12} cy={12} r={10.5} {...props} />}
      {shape === 'rect-rounded' && <rect x={1.5} y={1.5} width={21} height={21} rx={5} {...props} />}
      {shape === 'star' && <path d="m12 1 3.4 7 7.6 1.1-5.5 5.4 1.3 7.6L12 18.5l-6.8 3.6 1.3-7.6L1 9.1 8.6 8Z" {...props} />}
      {shape === 'hexagon' && <path d="M6.5 2.5h11L23 12l-5.5 9.5h-11L1 12Z" {...props} />}
      {shape === 'diamond' && <path d="M12 1 23 12 12 23 1 12Z" {...props} />}
      {shape === 'triangle' && <path d="M12 2 23 21.5H1Z" {...props} />}
    </svg>
  );
}

// ── หน้าแรกของแผง ─────────────────────────────────────────────────

export function ElementsPanel() {
  const page = usePageSize();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const recent = useRecent<RecentElement>('elements');
  const term = q.trim();
  const add = (item: RecentElement) => addElement(item, page);
  const back = () => setCategory(null);

  if (category === 'graphics') return <GraphicsPage onBack={back} onPick={add} />;

  if (category) {
    const meta = CATEGORIES.find((c) => c.key === category)!;
    const presets = PRESET_SOURCES[category];

    return (
      <PanelFrame header={<BackHeader title={meta.label} onBack={back} />}>
        {presets ? (
          <PresetGrid presets={presets} />
        ) : category === 'stickers' ? (
          <StickersBrowser onPick={add} />
        ) : category === 'photos' ? (
          <PhotosBrowser onPick={add} />
        ) : category === 'videos' ? (
          <VideoLibrary />
        ) : category === 'audio' ? (
          <AudioLibrary />
        ) : (
          <ElementGrid items={basicItems(category)} onPick={add} columns={category === 'icons' ? 4 : 3} />
        )}
        {category === 'icons' && <p className="mt-3 text-csmju-caption text-muted">ไอคอนจาก Lucide (สัญญาอนุญาต ISC) ใช้ได้ฟรี</p>}
      </PanelFrame>
    );
  }

  return (
    <PanelFrame header={<PanelSearch id="elements-search" label="ค้นหาองค์ประกอบ เช่น หัวใจ ดอกไม้ ทะเล" value={q} onChange={setQ} />}>
      {term ? (
        <ElementSearch query={term} onPick={add} onMore={setCategory} />
      ) : (
        <>
          {recent.length > 0 && (
            <section className="mb-6">
              <SectionHeading>ใช้งานล่าสุด</SectionHeading>
              <ScrollRow label="ใช้งานล่าสุด">
                {recent.map((item) => (
                  <li key={item.id} className="shrink-0">
                    <RecentTile item={item} onPick={add} />
                  </li>
                ))}
              </ScrollRow>
            </section>
          )}
          <section className="mb-6">
            <SectionHeading>เลือกดูหมวดหมู่</SectionHeading>
            <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
              {visibleCategories().map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className="group flex w-full flex-col items-center gap-2 rounded-xl py-1 text-csmju-caption text-ink focus-visible:bg-surface-muted"
                  >
                    <CategoryTile kind={c.key} />
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <StickerPreviewRow onPick={add} onMore={() => setCategory('stickers')} />
          <PhotoPreviewRow onPick={add} onMore={() => setCategory('photos')} />
          <p className="text-csmju-caption text-muted">
            กราฟิก สติกเกอร์ และภาพถ่ายในคลังเป็นของที่สัญญาอนุญาตให้ใช้ได้ฟรี (Tabler Icons · Noto Emoji · Cleveland Museum of Art CC0) เก็บในระบบของคณะ ·
            วิดีโอและเสียงใช้ไฟล์ที่คุณอัปโหลดเอง
          </p>
        </>
      )}
    </PanelFrame>
  );
}

function RecentTile({ item, onPick }: { item: RecentElement; onPick: (item: RecentElement) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      aria-label={`เพิ่ม ${elementLabel(item.id)}`}
      title={elementLabel(item.id)}
      className="flex size-22 items-center justify-center overflow-hidden rounded-xl bg-surface-muted hover:bg-primary-soft"
    >
      <ElementGlyph item={item} />
    </button>
  );
}

/// แถวเลื่อนแนวนอน + ปุ่มลูกศรเลื่อนไปทางขวา (แบบแถวในหน้ากราฟิกของ Canva)
function ScrollRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);

  return (
    <div className="group/row relative">
      <ul ref={ref} aria-label={label} className="csmju-scroll-x -mx-1 flex gap-2 overflow-x-auto scroll-smooth px-1 pb-1">
        {children}
      </ul>
      <button
        type="button"
        aria-label={`เลื่อนดู${label}ถัดไป`}
        onClick={() => {
          const el = ref.current;

          if (!el) return;
          // ถึงท้ายแถวแล้วกลับไปต้นแถว
          el.scrollTo({ left: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 ? 0 : el.scrollLeft + el.clientWidth * 0.8 });
        }}
        className="absolute top-1/2 right-0 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-csmju-md hover:bg-surface-muted"
      >
        <ChevronRight aria-hidden className="size-5" />
      </button>
    </div>
  );
}

const basicItems = (category: Category): RecentElement[] => {
  switch (category) {
    case 'shapes':
      return SHAPES.map((s) => ({ id: s.rounded ? 'shape:rect-rounded' : `shape:${s.kind}` })).concat({ id: 'shape:arrow' });
    case 'lines':
      return LINES.map((l) => ({ id: `shape:${l.kind}` })).concat({ id: 'shape:arrow' });
    case 'icons':
      return ICONS.map((icon) => ({ id: `icon:${icon.name}` }));
    case 'sticky':
      return STICKY_COLORS.map((c) => ({ id: `sticky:${c.key}` }));
    default:
      return [];
  }
};

/// ช่องเสียบชุดสำเร็จรูป (ตาราง ชาร์ต กรอบ กริด) — รายการมาจาก element-presets.tsx
function PresetGrid({ presets }: { presets: ElementPreset[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {presets.map((preset) => (
        <li key={preset.key}>
          <button type="button" onClick={preset.insert} aria-label={`เพิ่ม${preset.label}`} className="group flex w-full flex-col items-center gap-1.5 text-csmju-caption text-ink">
            <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted p-3 transition-colors group-hover:bg-primary-soft">
              {preset.glyph}
            </span>
            <span className="leading-tight">{preset.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── หน้า "กราฟิก" (ภาพบรีฟ 247) ──────────────────────────────────

type GraphicsList = 'recent' | 'suggested' | 'recommended' | 'gradients';

const LIST_TITLES: Record<GraphicsList, string> = {
  recent: 'ใช้งานล่าสุด',
  suggested: 'น่าจะเข้ากับดีไซน์ของคุณ',
  recommended: 'แนะนำ',
  gradients: 'การไล่เฉดสี',
};

const ROW_LIMIT = 12;

function GraphicsPage({ onBack, onPick }: { onBack: () => void; onPick: (item: RecentElement) => void }) {
  const icons = useLibrary('icons', loadIcons);
  // selector คืนข้อความล้วน: ลาก/ย่อชิ้นงานไม่ทำให้คำนวณใหม่ เปลี่ยนเฉพาะเมื่อข้อความในงานเปลี่ยน
  const text = useEditor((s) => documentText(s.doc));
  const title = useEditor((s) => s.title);
  const designType = useEditor((s) => s.designType);
  const recent = useRecent<RecentElement>('elements');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState<GraphicsList | null>(null);
  const terms = useMemo(() => designTerms(rankWords(text, title), designType), [text, title, designType]);
  const suggested = useMemo(() => suggestGraphics(icons.data ?? [], terms), [icons.data, terms]);
  const recommended = useMemo(() => recommendedGraphics(icons.data ?? []), [icons.data]);
  const recentGraphics = recent.filter((item) => item.id.startsWith('tabler:') || item.id.startsWith('gradient:'));
  const gradients = useMemo(() => ({ featured: gradientItems(true), all: gradientItems() }), []);
  const graphicItem = (icon: LibraryIcon): RecentElement => ({ id: `tabler:${icon.n}`, d: icon.d, c: graphicColor(icon.n) });
  const gradientItem = (g: GradientItem): RecentElement => ({ id: g.id });

  if (list) {
    const items =
      list === 'recent'
        ? recentGraphics
        : list === 'suggested'
          ? suggested.map(graphicItem)
          : list === 'recommended'
            ? recommended.map(graphicItem)
            : gradients.all.map(gradientItem);

    return (
      <PanelFrame header={<BackHeader title={LIST_TITLES[list]} onBack={() => setList(null)} />}>
        <ul className="grid grid-cols-4 gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <GraphicTile item={item} onPick={onPick} />
            </li>
          ))}
        </ul>
        {list === 'suggested' && <p className="mt-3 text-csmju-caption text-muted">เลือกจากคำในข้อความ ชื่องาน และประเภทงานของคุณ (คำนวณในเครื่อง)</p>}
      </PanelFrame>
    );
  }

  const row = (key: GraphicsList, items: RecentElement[]) =>
    items.length > 0 && (
      <section className="mb-6">
        <SectionHeading onSeeAll={() => setList(key)}>{LIST_TITLES[key]}</SectionHeading>
        <ScrollRow label={LIST_TITLES[key]}>
          {items.slice(0, ROW_LIMIT).map((item) => (
            <li key={item.id} className="w-22 shrink-0">
              <GraphicTile item={item} onPick={onPick} />
            </li>
          ))}
        </ScrollRow>
      </section>
    );

  return (
    <PanelFrame
      header={
        <>
          <BackHeader title="กราฟิก" onBack={onBack} />
          <PanelSearch
            id="graphics-search"
            label="ค้นหากราฟิก เช่น ดาว หนังสือ กาแฟ"
            value={draft}
            onChange={(value) => {
              setDraft(value);
              if (!value.trim()) setQ('');
            }}
            onSubmit={() => setQ(draft.trim())}
          />
        </>
      }
    >
      {q ? (
        <GraphicsBrowser key={q} onPick={onPick} initialQuery={q} />
      ) : icons.isLoading ? (
        <Spinner label="กำลังโหลดกราฟิก…" />
      ) : icons.isError ? (
        <ErrorState message={errorMessage(icons.error)} onRetry={() => void icons.refetch()} />
      ) : (
        <>
          {row('recent', recentGraphics)}
          {row('suggested', suggested.map(graphicItem))}
          {row('recommended', recommended.map(graphicItem))}
          {row('gradients', gradients.featured.map(gradientItem))}
          <section>
            <SectionHeading>กราฟิกทั้งหมด</SectionHeading>
            <GraphicsBrowser onPick={onPick} />
          </section>
        </>
      )}
    </PanelFrame>
  );
}

function GraphicTile({ item, onPick }: { item: RecentElement; onPick: (item: RecentElement) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      aria-label={`เพิ่ม${elementLabel(item.id)}`}
      title={elementLabel(item.id)}
      className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted p-2 hover:bg-primary-soft"
    >
      <ElementGlyph item={item} className="size-12" />
    </button>
  );
}

// ── แถวตัวอย่างในหน้าแรก ──────────────────────────────────────────

function StickerPreviewRow({ onPick, onMore }: { onPick: (item: RecentElement) => void; onMore: () => void }) {
  const stickers = useLibrary('stickers', loadStickers);

  if (!stickers.data?.length) return null;

  return (
    <section className="mb-6">
      <SectionHeading onSeeAll={onMore}>สติกเกอร์</SectionHeading>
      <div className="grid grid-cols-4 gap-2">
        {stickers.data.slice(0, 8).map((s) => (
          <LibraryTile key={s.id} label={`สติกเกอร์ ${s.ch}`} onClick={() => onPick({ id: `sticker:${s.id}` })}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ SVG ในคลังของระบบ */}
            <img src={stickerSrc(s.id)} alt="" className="size-12" loading="lazy" />
          </LibraryTile>
        ))}
      </div>
    </section>
  );
}

function PhotoPreviewRow({ onPick, onMore }: { onPick: (item: RecentElement) => void; onMore: () => void }) {
  const photos = useLibrary('photos', loadPhotos);

  if (!photos.data?.length) return null;

  return (
    <section className="mb-6">
      <SectionHeading onSeeAll={onMore}>ภาพถ่าย</SectionHeading>
      <PhotoGrid photos={photos.data.slice(0, 6)} onPick={onPick} />
    </section>
  );
}

function LibraryTile({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={`เพิ่ม${label}`} title={label} className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted p-2 hover:bg-primary-soft">
      {children}
    </button>
  );
}

const PAGE_STEP = 96;

/// กราฟิกเส้น (Tabler) — เลือกหมวดด้วยชิป · แสดงทีละ 96 ชิ้น
function GraphicsBrowser({ onPick, initialQuery = '' }: { onPick: (item: RecentElement) => void; initialQuery?: string }) {
  const icons = useLibrary('icons', loadIcons);
  const [cat, setCat] = useState<string>('all');
  const [limit, setLimit] = useState(PAGE_STEP);
  const terms = searchTerms(initialQuery);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();

    for (const i of icons.data ?? []) counts.set(i.c, (counts.get(i.c) ?? 0) + 1);

    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [icons.data]);
  const list = (icons.data ?? []).filter((i) => (cat === 'all' || i.c === cat) && (terms.length === 0 || matchIcon(i, terms)));

  if (icons.isLoading) return <Spinner label="กำลังโหลดกราฟิก…" />;
  if (icons.isError) return <ErrorState message={errorMessage(icons.error)} onRetry={() => void icons.refetch()} />;

  return (
    <div>
      {!initialQuery && (
        <div className="csmju-scroll-x -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => {
                setCat(c);
                setLimit(PAGE_STEP);
              }}
              className={cx('min-h-9 shrink-0 rounded-lg border px-3 text-csmju-caption', cat === c ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-line-strong text-ink hover:bg-surface-muted')}
            >
              {c === 'all' ? 'ทั้งหมด' : (ICON_CATEGORY_TH[c] ?? c)}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p className="text-csmju-caption text-muted">ไม่พบกราฟิก{initialQuery ? `ที่ตรงกับ “${initialQuery}” ลองคำอื่น เช่น ดาว หัวใจ ต้นไม้` : ''}</p>
      ) : (
        <>
          <ul className="grid grid-cols-5 gap-1">
            {list.slice(0, limit).map((icon) => (
              <li key={icon.n}>
                <LibraryTile label={`กราฟิก ${icon.n.replace(/-/g, ' ')}`} onClick={() => onPick({ id: `tabler:${icon.n}`, d: icon.d })}>
                  <GraphicGlyph d={icon.d} />
                </LibraryTile>
              </li>
            ))}
          </ul>
          {list.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE_STEP)} className="mt-3 min-h-11 w-full rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
              แสดงเพิ่ม ({list.length - limit} ชิ้น)
            </button>
          )}
        </>
      )}
      <p className="mt-3 text-csmju-caption text-muted">กราฟิกจาก Tabler Icons (MIT) เปลี่ยนสีได้จากแถบเครื่องมือด้านบน</p>
    </div>
  );
}

function StickersBrowser({ onPick }: { onPick: (item: RecentElement) => void }) {
  const stickers = useLibrary('stickers', loadStickers);

  if (stickers.isLoading) return <Spinner label="กำลังโหลดสติกเกอร์…" />;
  if (stickers.isError) return <ErrorState message={errorMessage(stickers.error)} onRetry={() => void stickers.refetch()} />;

  const groups = [...new Set(stickers.data!.map((s) => s.g))];

  return (
    <div>
      {groups.map((g) => (
        <section key={g} className="mb-5">
          <h3 className="mb-2 text-csmju-caption font-bold text-ink">{g}</h3>
          <ul className="grid grid-cols-5 gap-1">
            {stickers.data!.filter((s) => s.g === g).map((s) => (
              <li key={s.id}>
                <LibraryTile label={`สติกเกอร์ ${s.ch}`} onClick={() => onPick({ id: `sticker:${s.id}` })}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ SVG ในคลังของระบบ */}
                  <img src={stickerSrc(s.id)} alt="" className="size-10" loading="lazy" />
                </LibraryTile>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-csmju-caption text-muted">สติกเกอร์จาก Noto Emoji ของ Google (Apache 2.0)</p>
    </div>
  );
}

function PhotoGrid({ photos, onPick }: { photos: LibraryPhoto[]; onPick: (item: RecentElement) => void }) {
  return (
    <ul className="columns-2 gap-2">
      {photos.map((p) => (
        <li key={p.id} className="mb-2 break-inside-avoid">
          <button
            type="button"
            draggable
            onDragStart={(event) => setImageDragData(event.dataTransfer, { src: photoSrc(p.id), assetId: null, naturalWidth: p.w, naturalHeight: p.h, name: 'ภาพถ่าย' })}
            onClick={() => onPick({ id: `photo:${p.id}`, w: p.w, h: p.h })}
            aria-label={`เพิ่มภาพ ${p.title}`}
            title={`${p.title} — ${p.credit} (Cleveland Museum of Art, CC0)`}
            className="block w-full overflow-hidden rounded-xl bg-surface-muted hover:shadow-csmju-md"
            style={{ aspectRatio: `${p.w} / ${p.h}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ภาพย่อในคลังของระบบ */}
            <img src={photoThumb(p.id)} alt="" className="size-full object-cover" loading="lazy" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PhotosBrowser({ onPick }: { onPick: (item: RecentElement) => void }) {
  const photos = useLibrary('photos', loadPhotos);

  if (photos.isLoading) return <Spinner label="กำลังโหลดภาพ…" />;
  if (photos.isError) return <ErrorState message={errorMessage(photos.error)} onRetry={() => void photos.refetch()} />;

  const groups = [...new Set(photos.data!.map((p) => p.g))];

  return (
    <div>
      {groups.map((g) => (
        <section key={g} className="mb-5">
          <h3 className="mb-2 text-csmju-caption font-bold text-ink">{g}</h3>
          <PhotoGrid photos={photos.data!.filter((p) => p.g === g)} onPick={onPick} />
        </section>
      ))}
      <p className="text-csmju-caption text-muted">ภาพผลงานสาธารณสมบัติจาก Cleveland Museum of Art Open Access (CC0) · ชี้ที่ภาพเพื่อดูชื่อผลงานและผู้สร้าง</p>
    </div>
  );
}

/// ผลค้นหาข้ามคลัง: กราฟิก · สติกเกอร์ · ภาพถ่าย · รูปทรงและไอคอน
function ElementSearch({ query, onPick, onMore }: { query: string; onPick: (item: RecentElement) => void; onMore: (c: Category) => void }) {
  const icons = useLibrary('icons', loadIcons);
  const stickers = useLibrary('stickers', loadStickers);
  const photos = useLibrary('photos', loadPhotos);
  const terms = searchTerms(query);
  const lower = query.toLowerCase();
  const graphicHits = (icons.data ?? []).filter((i) => matchIcon(i, terms));
  const stickerHits = (stickers.data ?? []).filter((s) => matchSticker(s, terms));
  const photoHits = (photos.data ?? []).filter((p) => matchPhoto(p, terms));
  const basicHits = [...basicItems('shapes'), ...basicItems('lines'), ...basicItems('sticky'), ...basicItems('icons')]
    .filter((item, i, all) => all.findIndex((x) => x.id === item.id) === i)
    .filter((item) => elementLabel(item.id).toLowerCase().includes(lower) || item.id.includes(lower));
  const categoryHits = visibleCategories().filter((c) => c.label.includes(query));
  const nothing = graphicHits.length + stickerHits.length + photoHits.length + basicHits.length + categoryHits.length === 0;

  if (icons.isLoading || stickers.isLoading || photos.isLoading) return <Spinner label="กำลังค้นหา…" />;

  return (
    <div>
      {nothing && <p className="text-csmju-caption text-muted">ไม่พบองค์ประกอบที่ตรงกับ “{query}” ลองคำอื่น เช่น หัวใจ ดาว ต้นไม้ ทะเล</p>}
      {categoryHits.length > 0 && (
        <section className="mb-5">
          <SectionHeading>หมวดหมู่</SectionHeading>
          <ul className="flex flex-wrap gap-2">
            {categoryHits.map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => onMore(c.key)} className="min-h-11 rounded-xl border border-line-strong px-4 text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {basicHits.length > 0 && (
        <section className="mb-5">
          <SectionHeading>รูปทรงและไอคอน</SectionHeading>
          <ElementGrid items={basicHits.slice(0, 12)} onPick={onPick} columns={4} />
        </section>
      )}
      {graphicHits.length > 0 && (
        <section className="mb-5">
          <SectionHeading>กราฟิก ({graphicHits.length})</SectionHeading>
          <GraphicsBrowser onPick={onPick} initialQuery={query} />
        </section>
      )}
      {stickerHits.length > 0 && (
        <section className="mb-5">
          <SectionHeading onSeeAll={() => onMore('stickers')}>สติกเกอร์</SectionHeading>
          <ul className="grid grid-cols-5 gap-1">
            {stickerHits.slice(0, 20).map((s) => (
              <li key={s.id}>
                <LibraryTile label={`สติกเกอร์ ${s.ch}`} onClick={() => onPick({ id: `sticker:${s.id}` })}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ SVG ในคลังของระบบ */}
                  <img src={stickerSrc(s.id)} alt="" className="size-10" loading="lazy" />
                </LibraryTile>
              </li>
            ))}
          </ul>
        </section>
      )}
      {photoHits.length > 0 && (
        <section className="mb-5">
          <SectionHeading onSeeAll={() => onMore('photos')}>ภาพถ่าย</SectionHeading>
          <PhotoGrid photos={photoHits.slice(0, 10)} onPick={onPick} />
        </section>
      )}
    </div>
  );
}

function ElementGrid({ items, onPick, columns }: { items: RecentElement[]; onPick: (item: RecentElement) => void; columns: 3 | 4 }) {
  return (
    <ul className={cx('grid gap-2', columns === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onPick(item)}
            aria-label={`เพิ่ม ${elementLabel(item.id)}`}
            title={elementLabel(item.id)}
            className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-muted hover:bg-primary-soft"
          >
            <ElementGlyph item={item} className={columns === 4 ? 'size-8' : 'size-12'} />
          </button>
        </li>
      ))}
    </ul>
  );
}
