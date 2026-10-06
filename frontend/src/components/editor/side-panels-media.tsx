'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { FONT_SETS } from '@/lib/editor/factory';
import { FONT_FAMILIES, assetIdOfFont, cssFamily, ensureFont, fontLabel, isPopularFont, popularFirst, useUserFonts, type FontFamily, type FontStyle } from '@/lib/editor/fonts';
import { ADJUST_ZERO, FILTER_GROUPS, FILTER_PRESETS, applyAdjust, dominantColors, effectiveAdjust, type FilterPreset } from '@/lib/editor/image-filters';
import { fillCell, isFrameLike, loadImageSource, patchCellImage } from '@/lib/editor/frame-actions';
import { cellImages } from '@/lib/editor/frames';
import { getImage } from '@/lib/editor/render';
import { currentPage, useEditor } from '@/lib/editor/store';
import type { CanvasElement, Crop, ImageAdjust, ImageElement, TextElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import type { Asset } from '@/lib/types';
import { PanelHeader, PresetTile, RangeField, UnderlineTabs } from './controls';
import { FontName } from './font-picker';
import { MyFontsSection } from './my-fonts';
import { ShadowControls } from './side-panels';

function close() {
  useEditorUi.getState().setPanel(null);
}

function useSelected() {
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);

  return useMemo(() => elements.filter((el) => selection.includes(el.id)), [elements, selection]);
}

function patch(ids: string[], values: Partial<CanvasElement> | ((el: CanvasElement) => Partial<CanvasElement>)) {
  useEditor.getState().updateElements(ids, typeof values === 'function' ? values : () => values);
}

/// ค่าของรูปที่แผงแก้ไขรูปเปลี่ยน — ใช้ได้ทั้งรูปเดี่ยวและรูปในกรอบ/กริด
type ImageValues = Partial<Pick<ImageElement, 'adjust' | 'filter' | 'filterIntensity' | 'colorEdits'>>;
type ImageLike = Pick<ImageElement, 'src' | 'adjust' | 'filter' | 'filterIntensity' | 'colorEdits'>;

interface ImageTarget {
  /// element ที่ถือรูป (เงาใส่ที่นี่)
  owner: CanvasElement;
  image: ImageLike;
  /// ช่องของกรอบ/กริด · null = รูปเดี่ยว
  cell: number | null;
  apply: (values: ImageValues) => void;
}

/// รูปที่แผงแก้ไข/แทนที่ทำงานด้วย: รูปเดี่ยวที่เลือก หรือรูปในช่องที่เลือกของกรอบ/กริด
function useImageTarget(): ImageTarget | null {
  const selected = useSelected();
  const frameCell = useEditorUi((s) => s.frameCell);
  const image = selected.find((e): e is ImageElement => e.type === 'image');

  if (image) return { owner: image, image, cell: null, apply: (values) => patch([image.id], values) };

  const holder = selected.length === 1 && isFrameLike(selected[0]) ? selected[0] : null;

  if (!holder) return null;

  const cell = frameCell?.id === holder.id ? frameCell.cell : 0;
  const fill = cellImages(holder)[cell];

  return fill ? { owner: holder, image: fill, cell, apply: (values) => patchCellImage(holder.id, cell, values) } : null;
}

// ── ฟอนต์ ──────────────────────────────────────────────────────────

const STYLE_CHIPS: { key: FontStyle | 'all'; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'handwriting', label: 'ลายมือ' },
  { key: 'display', label: 'ดิสเพลย์' },
  { key: 'sans', label: 'ไม่มีหัว' },
  { key: 'serif', label: 'มีเชิง' },
  { key: 'mono', label: 'โมโนสเปซ' },
];

/// สไตล์ข้อความตามลำดับชั้นของเนื้อหา (แท็บ "สไตล์ข้อความ") — ขนาดเทียบด้านสั้นของหน้า
const TEXT_ROLES: { key: string; label: string; scale: number; weight: 400 | 700 }[] = [
  { key: 'title', label: 'ชื่อเรื่อง', scale: 0.09, weight: 700 },
  { key: 'subtitle', label: 'ชื่อรอง', scale: 0.06, weight: 400 },
  { key: 'heading', label: 'หัวเรื่อง', scale: 0.05, weight: 700 },
  { key: 'subheading', label: 'หัวเรื่องย่อย', scale: 0.035, weight: 700 },
  { key: 'body', label: 'เนื้อเรื่อง', scale: 0.025, weight: 400 },
];

export function FontPanel() {
  const selected = useSelected();
  const texts = selected.filter((el): el is TextElement => el.type === 'text');
  const doc = useEditor((s) => s.doc);
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const [tab, setTab] = useState<'fonts' | 'styles'>('fonts');
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState<FontStyle | 'all'>('all');
  const [script, setScript] = useState<'all' | 'th' | 'en'>('all');
  const [popular, setPopular] = useState(false);
  const userFontNames = useUserFonts((s) => s.names);
  const current = texts[0]?.fontFamily;
  const ids = texts.filter((t) => !t.locked).map((t) => t.id);
  const term = query.trim().toLowerCase();
  const inDoc = useMemo(() => {
    const set = new Set<string>();

    for (const page of doc.pages) for (const el of page.elements) if (el.type === 'text') set.add(el.fontFamily);

    // ฟอนต์ที่อัปโหลดเองที่ใช้ในงานนี้ด้วย (รวมของเจ้าของงานที่แชร์มา)
    const uploaded = [...set].filter((id) => assetIdOfFont(id)).map((id) => ({ id, label: fontLabel(id, userFontNames), uploaded: true }));

    return [...FONT_FAMILIES.filter((f) => set.has(f.id)), ...uploaded];
  }, [doc, userFontNames]);
  const fonts = popularFirst(
    FONT_FAMILIES.filter(
      (f) =>
        (!popular || isPopularFont(f.id)) &&
        (style === 'all' || f.style === style) &&
        (script === 'all' || (f.script ?? 'th') === script) &&
        (!term || f.label.toLowerCase().includes(term) || f.id.toLowerCase().includes(term)),
    ),
  );


  const applyFont = async (id: string) => {
    await Promise.all([ensureFont(id, 400), ensureFont(id, 700)]);
    patch(ids, { fontFamily: id });
  };

  const fontRow = (font: Pick<FontFamily, 'id' | 'label' | 'script'> & { uploaded?: boolean }) => (
    <li key={font.id}>
      <button
        type="button"
        disabled={ids.length === 0}
        onClick={() => void applyFont(font.id)}
        aria-pressed={font.id === current}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-muted disabled:opacity-50"
      >
        <FontName id={font.id} label={font.label} className="flex-1 truncate text-csmju-body text-ink" />
        {font.uploaded ? (
          <span className="text-csmju-caption text-muted">อัปโหลด</span>
        ) : (
          (font.script ?? 'th') === 'en' && <span className="text-csmju-caption text-muted">อังกฤษ</span>
        )}
        {font.id === current && <Check aria-hidden className="size-5 text-ink" />}
      </button>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="ฟอนต์" onClose={close} />
      <UnderlineTabs
        label="ฟอนต์"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'fonts', label: 'ฟอนต์' },
          { key: 'styles', label: 'สไตล์ข้อความ' },
        ]}
      />
      {tab === 'fonts' ? (
        <>
          <div className="shrink-0 px-4 pt-3">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink" />
              <label htmlFor="font-panel-search" className="sr-only">ค้นหาฟอนต์</label>
              <input
                id="font-panel-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='ลองค้นหาว่า "ลายมือ" หรือ "Sarabun"'
                className="min-h-12 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div className="csmju-scroll-x mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                aria-pressed={popular}
                onClick={() => setPopular((v) => !v)}
                className={cx(
                  'min-h-10 shrink-0 rounded-xl border px-3 text-csmju-caption font-semibold',
                  popular ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
                )}
              >
                ยอดนิยม
              </button>
              {(
                [
                  ['th', 'ภาษาไทย'],
                  ['en', 'อังกฤษ'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={script === key}
                  onClick={() => setScript(script === key ? 'all' : key)}
                  className={cx(
                    'min-h-10 shrink-0 rounded-xl border px-3 text-csmju-caption font-semibold',
                    script === key ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
                  )}
                >
                  {label}
                </button>
              ))}
              <span aria-hidden className="mx-1 w-px shrink-0 bg-line" />
              {STYLE_CHIPS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={style === c.key}
                  onClick={() => setStyle(c.key)}
                  className={cx(
                    'min-h-10 shrink-0 rounded-xl border px-3 text-csmju-caption font-semibold',
                    style === c.key ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-6">
            {ids.length === 0 && <p className="px-2 pb-2 text-csmju-caption text-muted">เลือกข้อความก่อน แล้วเปลี่ยนฟอนต์ได้ที่นี่</p>}
            {!term && !popular && style === 'all' && script === 'all' && <MyFontsSection current={current} canApply={ids.length > 0} onApply={(id) => void applyFont(id)} />}
            {!term && !popular && style === 'all' && script === 'all' && inDoc.length > 0 && (
              <>
                <h3 className="px-2 pt-2 pb-1 text-csmju-caption font-bold text-ink">ฟอนต์ในเอกสาร</h3>
                <ul>{inDoc.map(fontRow)}</ul>
              </>
            )}
            <h3 className="px-2 pt-3 pb-1 text-csmju-caption font-bold text-ink">{popular ? 'ฟอนต์ยอดนิยม' : 'ฟอนต์ทั้งหมด'} <span className="font-normal text-muted">· {fonts.length} แบบ</span></h3>
            {fonts.length === 0 ? <p className="px-2 text-csmju-caption text-muted">ไม่พบฟอนต์ที่ค้นหา</p> : <ul>{fonts.map(fontRow)}</ul>}
            <p className="px-2 pt-4 text-csmju-caption text-muted">ฟอนต์ในคลังทั้งหมดเป็นสัญญาอนุญาต OFL หรือ Apache 2.0 เก็บในระบบของคณะ ใช้ได้ฟรีทั้งงานส่วนตัวและงานเผยแพร่ · ฟอนต์ที่อัปโหลดเองเป็นความรับผิดชอบของผู้อัปโหลด</p>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {ids.length === 0 && <p className="pb-3 text-csmju-caption text-muted">เลือกข้อความก่อน แล้วกดสไตล์เพื่อใช้กับข้อความนั้น</p>}
          <ul className="flex flex-col gap-2">
            {TEXT_ROLES.map((role) => (
              <li key={role.key}>
                <button
                  type="button"
                  disabled={ids.length === 0}
                  onClick={() => patch(ids, { fontSize: Math.max(10, Math.round(Math.min(width, height) * role.scale)), fontWeight: role.weight })}
                  className="w-full rounded-2xl border border-line-strong px-4 py-3 text-left text-ink hover:bg-surface-muted disabled:opacity-50"
                  style={{ fontFamily: cssFamily(current ?? 'Noto Sans Thai'), fontWeight: role.weight, fontSize: `${Math.round(role.scale * 360)}px`, lineHeight: 1.3 }}
                >
                  {role.label}
                </button>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 mb-3 text-csmju-body font-bold text-ink">ชุดฟอนต์</h3>
          <ul className="grid grid-cols-2 gap-2">
            {FONT_SETS.map((set) => {
              const line = set.lines[0];

              return (
                <li key={set.key}>
                  <button
                    type="button"
                    disabled={ids.length === 0}
                    onClick={async () => {
                      await ensureFont(line.font, line.weight);
                      patch(ids, { fontFamily: line.font, fontWeight: line.weight, color: line.color, italic: Boolean(line.italic) });
                    }}
                    className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-surface-muted p-2 hover:bg-primary-soft disabled:opacity-50"
                  >
                    <span style={{ fontFamily: cssFamily(line.font), fontWeight: line.weight, color: line.color, fontSize: '22px', lineHeight: 1.1 }} className="truncate">
                      {set.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── แก้ไขรูปภาพ ─────────────────────────────────────────────────────

const ADJUST_GROUPS: { title: string; fields: { key: keyof ImageAdjust; label: string; track?: string; min?: number }[] }[] = [
  {
    title: 'ค่าแสงขาว',
    fields: [
      { key: 'temperature', label: 'อุณหภูมิ', track: 'csmju-track-temperature' },
      { key: 'tint', label: 'เฉดสี', track: 'csmju-track-tint' },
    ],
  },
  {
    title: 'สว่าง',
    fields: [
      { key: 'brightness', label: 'ความสว่าง' },
      { key: 'contrast', label: 'คอนทราสต์' },
      { key: 'highlights', label: 'ไฮไลต์' },
      { key: 'shadows', label: 'เงา' },
      { key: 'whites', label: 'สีขาว' },
      { key: 'blacks', label: 'สีดำ' },
    ],
  },
  {
    title: 'สี',
    fields: [
      { key: 'vibrance', label: 'สีสันสดใส' },
      { key: 'saturation', label: 'ความอิ่มตัวของสี' },
    ],
  },
  {
    title: 'พื้นผิว',
    fields: [
      { key: 'sharpness', label: 'ความคมชัด' },
      { key: 'clarity', label: 'ความชัดเจน' },
      { key: 'vignette', label: 'ขอบมืด', min: 0 },
      { key: 'blur', label: 'เบลอ', min: 0 },
    ],
  },
];

/// ภาพตัวอย่างฟิลเตอร์ — ย่อรูปจริงแล้วประมวลผลด้วยฟิลเตอร์นั้น
function useFilterThumbs(el: Pick<ImageElement, 'src'> | undefined) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const src = el?.src;

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    const run = () => {
      const img = getImage(src);

      if (!img) {
        setTimeout(run, 200);
        return;
      }

      const size = 96;
      const out: Record<string, string> = {};

      for (const preset of [null, ...FILTER_PRESETS] as (FilterPreset | null)[]) {
        const canvas = document.createElement('canvas');
        const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);

        canvas.width = ratio >= 1 ? size : Math.round(size * ratio);
        canvas.height = ratio >= 1 ? Math.round(size / ratio) : size;

        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (preset) {
          try {
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

            applyAdjust(data, effectiveAdjust(null, preset, 100), preset, 100);
            ctx.putImageData(data, 0, 0);
          } catch {
            // อ่านพิกเซลไม่ได้ — แสดงภาพเดิม
          }
        }

        out[preset?.key ?? 'none'] = canvas.toDataURL('image/jpeg', 0.8);
      }

      if (!cancelled) setThumbs(out);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return thumbs;
}

/// แก้ไขสี: เลือกสีเด่นของรูป แล้วหมุนเฉดสี ปรับความอิ่มตัว และความสว่างเฉพาะช่วงสีนั้น
function SelectiveColor({ el, colors, apply }: { el: ImageLike; colors: string[]; apply: (values: ImageValues) => void }) {
  const [picked, setPicked] = useState<string | null>(null);

  if (colors.length === 0) return null;

  const edits = el.colorEdits ?? [];
  const current = picked ? (edits.find((e) => e.color === picked) ?? { color: picked, hue: 0, saturation: 0, lightness: 0 }) : null;
  const set = (key: 'hue' | 'saturation' | 'lightness', value: number) => {
    if (!current) return;

    const next = { ...current, [key]: value };

    apply({ colorEdits: [...edits.filter((e) => e.color !== next.color), next] });
  };

  return (
    <section className="mb-6 flex flex-col gap-3">
      <h3 className="text-csmju-body font-bold text-ink">แก้ไขสี</h3>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const edited = edits.some((e) => e.color === color && (e.hue || e.saturation || e.lightness));

          return (
            <button
              key={color}
              type="button"
              aria-pressed={picked === color}
              aria-label={`แก้ไขช่วงสี ${color}${edited ? ' (แก้แล้ว)' : ''}`}
              title={color}
              onClick={() => setPicked(picked === color ? null : color)}
              className={cx('relative size-10 rounded-full border-2', picked === color ? 'border-primary ring-2 ring-primary-soft' : 'border-line')}
              style={{ background: color }}
            >
              {edited && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-primary" />}
            </button>
          );
        })}
      </div>
      {current ? (
        <div className="flex flex-col gap-4 rounded-xl bg-surface-muted p-3">
          <RangeField label="สี" value={current.hue} min={-100} max={100} trackClassName="csmju-track-hue" onChange={(v) => set('hue', v)} />
          <RangeField label="ความอิ่มตัวของสี" value={current.saturation} min={-100} max={100} trackClassName="csmju-track-sat" onChange={(v) => set('saturation', v)} />
          <RangeField label="ความสว่าง" value={current.lightness} min={-100} max={100} onChange={(v) => set('lightness', v)} />
        </div>
      ) : (
        <p className="text-csmju-caption text-muted">กดสีจากรูปเพื่อปรับเฉพาะส่วนที่เป็นสีนั้น</p>
      )}
    </section>
  );
}

export function ImageEditPanel() {
  const target = useImageTarget();
  const el = target?.image;
  const [view, setView] = useState<'main' | 'adjust' | 'filters'>('main');
  const thumbs = useFilterThumbs(el);
  const colors = useMemo(() => {
    const img = el ? getImage(el.src) : null;

    return img ? dominantColors(img, 6) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- คำนวณใหม่เมื่อเปลี่ยนรูป
  }, [el?.src, thumbs]);

  if (!el || !target) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="แก้ไขรูปภาพ" onClose={close} />
        <p className="px-4 text-csmju-caption text-muted">เลือกรูปบนผืนผ้าใบก่อน</p>
      </div>
    );
  }

  const apply = target.apply;
  const adjust = { ...ADJUST_ZERO, ...(el.adjust ?? {}) };
  const filterThumb = (preset: FilterPreset | null) => (
    <PresetTile key={preset?.key ?? 'none'} label={preset?.label ?? 'ไม่มี'} selected={(el.filter ?? null) === (preset?.key ?? null)} onClick={() => apply({ filter: preset?.key ?? null, filterIntensity: 100 })}>
      {thumbs[preset?.key ?? 'none'] ? (
        // eslint-disable-next-line @next/next/no-img-element -- ภาพตัวอย่างสร้างจาก canvas ในเครื่อง
        <img src={thumbs[preset?.key ?? 'none']} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-csmju-caption text-muted">…</span>
      )}
    </PresetTile>
  );

  if (view === 'adjust') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="ปรับ" onBack={() => setView('main')} onClose={close} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
          {ADJUST_GROUPS.map((group) => (
            <Fragment key={group.title}>
              <section className="mb-6 flex flex-col gap-4">
                <h3 className="text-csmju-body font-bold text-ink">{group.title}</h3>
                {group.fields.map((field) => (
                  <RangeField
                    key={field.key}
                    label={field.label}
                    value={adjust[field.key]}
                    min={field.min ?? -100}
                    max={100}
                    trackClassName={field.track}
                    onChange={(v) => apply({ adjust: { ...(el.adjust ?? {}), [field.key]: v } })}
                  />
                ))}
              </section>
              {group.title === 'สี' && <SelectiveColor el={el} colors={colors} apply={apply} />}
            </Fragment>
          ))}
        </div>
        <div className="shrink-0 border-t border-line p-3">
          <button type="button" onClick={() => apply({ adjust: null, colorEdits: null })} className="min-h-11 w-full rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
            รีเซ็ตการปรับค่า
          </button>
        </div>
      </div>
    );
  }

  if (view === 'filters') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="ฟิลเตอร์" onBack={() => setView('main')} onClose={close} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
          {el.filter && (
            <div className="mb-5">
              <RangeField label="ความแรง" value={el.filterIntensity ?? 100} min={0} max={100} onChange={(v) => apply({ filterIntensity: v })} />
            </div>
          )}
          <div className="mb-5 grid grid-cols-3 gap-3">{filterThumb(null)}</div>
          {FILTER_GROUPS.map((group) => (
            <section key={group.key} className="mb-5">
              <h3 className="mb-3 text-csmju-body font-bold text-ink">{group.label}</h3>
              <div className="grid grid-cols-3 gap-3">{FILTER_PRESETS.filter((f) => f.group === group.key).map(filterThumb)}</div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="แก้ไขรูปภาพ" onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
        <button type="button" onClick={() => setView('adjust')} className="mb-6 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line-strong px-4 text-left text-csmju-body text-ink hover:bg-surface-muted">
          <SlidersHorizontal aria-hidden className="size-5" />
          <span className="flex-1 font-semibold">ปรับ</span>
          <span className="text-csmju-caption text-muted">แสง สี พื้นผิว</span>
          <ChevronRight aria-hidden className="size-5" />
        </button>
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-csmju-body font-bold text-ink">ฟิลเตอร์</h3>
            <button type="button" onClick={() => setView('filters')} className="min-h-9 px-2 text-csmju-caption font-semibold text-ink hover:underline">
              ดูทั้งหมด
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">{[null, FILTER_PRESETS[0], FILTER_PRESETS[1]].map(filterThumb)}</div>
          {el.filter && (
            <div className="mt-4">
              <RangeField label="ความแรงของฟิลเตอร์" value={el.filterIntensity ?? 100} min={0} max={100} onChange={(v) => apply({ filterIntensity: v })} />
            </div>
          )}
        </section>
        <section className="mb-6">
          <h3 className="mb-3 text-csmju-body font-bold text-ink">เงา</h3>
          <ShadowControls els={[target.owner]} />
        </section>
        {colors.length > 0 && (
          <section>
            <h3 className="mb-1 text-csmju-body font-bold text-ink">สีในรูป</h3>
            <p className="mb-3 text-csmju-caption text-muted">กดสีเพื่อใช้เป็นพื้นหลังหน้า</p>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`ใช้ ${c} เป็นพื้นหลังหน้า`}
                  title={c}
                  onClick={() => useEditor.getState().setBackground(c)}
                  className="size-10 rounded-full border border-line-strong"
                  style={{ background: c }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── ครอป ───────────────────────────────────────────────────────────

const RATIOS: { key: string; label: string; ratio: number | null }[] = [
  { key: 'free', label: 'อิสระ', ratio: null },
  { key: 'original', label: 'ต้นฉบับ', ratio: null },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '5:4', label: '5:4', ratio: 5 / 4 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
  { key: '3:2', label: '3:2', ratio: 3 / 2 },
  { key: '2:3', label: '2:3', ratio: 2 / 3 },
];

export function CropPanel() {
  const selected = useSelected();
  const el = selected.find((e): e is ImageElement => e.type === 'image');
  const [initial] = useState(() => (el ? { crop: el.crop ?? null, width: el.width, height: el.height, rotation: el.rotation, x: el.x, y: el.y } : null));
  const [mode, setMode] = useState<string>(el?.crop ? 'free' : 'original');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0.5, y: 0.5 });
  const img = el ? getImage(el.src) : null;

  if (!el || !img) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="ครอปภาพ" onClose={close} />
        <p className="px-4 text-csmju-caption text-muted">{el ? 'กำลังโหลดรูป…' : 'เลือกรูปบนผืนผ้าใบก่อน'}</p>
      </div>
    );
  }

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const crop: Crop = el.crop ?? { x: 0, y: 0, width: 1, height: 1 };

  /// ใช้ครอปใหม่ แล้วปรับความสูงกล่องให้สัดส่วนตรงกับส่วนที่ตัด (ความกว้างคงเดิม · จุดกึ่งกลางคงที่)
  const applyCrop = (next: Crop | null) => {
    const c = next ?? { x: 0, y: 0, width: 1, height: 1 };
    const aspect = (c.width * nw) / Math.max(1, c.height * nh);

    patch([el.id], (e) => {
      const height = e.width / aspect;

      return { crop: next, height, y: e.y + (e.height - height) / 2 };
    });
  };

  const applyRatio = (key: string, z = zoom, p = pan) => {
    const preset = RATIOS.find((r) => r.key === key)!;

    if (key === 'original') return applyCrop(null);
    if (!preset.ratio) return;

    const imgRatio = nw / nh;
    let cw = preset.ratio >= imgRatio ? nw : nh * preset.ratio;
    let ch = preset.ratio >= imgRatio ? nw / preset.ratio : nh;

    cw /= z;
    ch /= z;
    applyCrop({
      x: ((nw - cw) * p.x) / nw,
      y: ((nh - ch) * p.y) / nh,
      width: cw / nw,
      height: ch / nh,
    });
  };

  const setEdge = (edge: 'left' | 'right' | 'top' | 'bottom', pct: number) => {
    const v = pct / 100;
    const right = crop.x + crop.width;
    const bottom = crop.y + crop.height;
    const next = { ...crop };

    if (edge === 'left') {
      next.x = Math.min(v, right - 0.05);
      next.width = right - next.x;
    } else if (edge === 'right') {
      next.width = Math.max(0.05, 1 - v - crop.x);
    } else if (edge === 'top') {
      next.y = Math.min(v, bottom - 0.05);
      next.height = bottom - next.y;
    } else {
      next.height = Math.max(0.05, 1 - v - crop.y);
    }

    applyCrop(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="ครอปภาพ" onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
        <h3 className="mb-3 text-csmju-body font-bold text-ink">อัตราส่วนภาพ</h3>
        <div className="mb-6 grid grid-cols-4 gap-2">
          {RATIOS.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={mode === r.key}
              onClick={() => {
                setMode(r.key);
                setZoom(1);
                setPan({ x: 0.5, y: 0.5 });
                if (r.key !== 'free') applyRatio(r.key, 1, { x: 0.5, y: 0.5 });
              }}
              className={cx(
                'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-csmju-caption text-ink',
                mode === r.key ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <span
                aria-hidden
                className="block rounded-sm border-2 border-current"
                style={r.ratio ? { width: r.ratio >= 1 ? 22 : 22 * r.ratio, height: r.ratio >= 1 ? 22 / r.ratio : 22 } : { width: 20, height: 16, borderStyle: r.key === 'free' ? 'dashed' : 'solid' }}
              />
              {r.label}
            </button>
          ))}
        </div>
        {mode === 'free' ? (
          <div className="mb-6 flex flex-col gap-4">
            <RangeField label="ตัดซ้าย (%)" value={Math.round(crop.x * 100)} min={0} max={95} onChange={(v) => setEdge('left', v)} />
            <RangeField label="ตัดขวา (%)" value={Math.round((1 - crop.x - crop.width) * 100)} min={0} max={95} onChange={(v) => setEdge('right', v)} />
            <RangeField label="ตัดบน (%)" value={Math.round(crop.y * 100)} min={0} max={95} onChange={(v) => setEdge('top', v)} />
            <RangeField label="ตัดล่าง (%)" value={Math.round((1 - crop.y - crop.height) * 100)} min={0} max={95} onChange={(v) => setEdge('bottom', v)} />
          </div>
        ) : mode !== 'original' ? (
          <div className="mb-6 flex flex-col gap-4">
            <RangeField
              label="ซูม (%)"
              value={Math.round(zoom * 100)}
              min={100}
              max={400}
              onChange={(v) => {
                setZoom(v / 100);
                applyRatio(mode, v / 100, pan);
              }}
            />
            <RangeField
              label="เลื่อนแนวนอน"
              value={Math.round(pan.x * 100)}
              min={0}
              max={100}
              onChange={(v) => {
                const next = { ...pan, x: v / 100 };

                setPan(next);
                applyRatio(mode, zoom, next);
              }}
            />
            <RangeField
              label="เลื่อนแนวตั้ง"
              value={Math.round(pan.y * 100)}
              min={0}
              max={100}
              onChange={(v) => {
                const next = { ...pan, y: v / 100 };

                setPan(next);
                applyRatio(mode, zoom, next);
              }}
            />
          </div>
        ) : null}
        <RangeField label="หมุน (องศา)" value={el.rotation > 180 ? el.rotation - 360 : el.rotation} min={-180} max={180} onChange={(v) => patch([el.id], { rotation: (v + 360) % 360 })} />
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-line p-3">
        <button
          type="button"
          onClick={() => {
            if (initial) patch([el.id], initial);
            close();
          }}
          className="min-h-11 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
        >
          ยกเลิก
        </button>
        <button type="button" onClick={close} className="min-h-11 rounded-xl bg-primary text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
          เสร็จแล้ว
        </button>
      </div>
    </div>
  );
}

// ── แทนที่รูป ───────────────────────────────────────────────────────

export function ReplacePanel() {
  const selected = useSelected();
  const el = selected.find((e): e is ImageElement => e.type === 'image');
  const frameCell = useEditorUi((s) => s.frameCell);
  // กรอบ/กริดที่เลือก: แทนที่รูปในช่องที่เลือก (กรอบ = ช่องเดียว)
  const holder = !el && selected.length === 1 && isFrameLike(selected[0]) ? selected[0] : null;
  const holderCell = holder && frameCell?.id === holder.id ? frameCell.cell : 0;
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const assets = useQuery({ queryKey: ['assets', 'replace'], queryFn: () => api.list<Asset>(`/assets${qs({ kind: 'image', limit: 60 })}`) });

  const replace = (asset: Asset) => {
    if (holder) {
      loadImageSource(asset.contentUrl, asset.id, asset.fileName).then(
        (source) => {
          fillCell(holder.id, holderCell, source);
          toast('แทนที่รูปในกรอบแล้ว');
        },
        () => toast('เปิดรูปนี้ไม่ได้', 'error'),
      );
      return;
    }

    if (!el) return;

    const img = new Image();

    img.onload = () => {
      const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);

      patch([el.id], (e) => {
        const height = e.width / aspect;

        return { src: asset.contentUrl, assetId: asset.id, crop: null, name: asset.fileName, height, y: e.y + (e.height - height) / 2 };
      });
      toast('แทนที่รูปแล้ว');
    };
    img.onerror = () => toast('เปิดรูปนี้ไม่ได้', 'error');
    img.src = asset.contentUrl;
  };

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<Asset>('/assets', file),
    onSuccess: (asset) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      replace(asset);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="แทนที่รูป" onClose={close} />
      <div className="shrink-0 px-4 pb-3">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="sr-only"
          aria-label="เลือกรูปที่จะใช้แทน"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) upload.mutate(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={(!el && !holder) || upload.isPending}
          onClick={() => input.current?.click()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-50"
        >
          <Upload aria-hidden className="size-5" /> {upload.isPending ? 'กำลังอัปโหลด…' : 'อัปโหลดรูปใหม่'}
        </button>
        <p className="mt-2 text-csmju-caption text-muted">หรือกดรูปที่เคยอัปโหลดไว้ · ตำแหน่ง ความกว้าง และเอฟเฟกต์ของรูปเดิมยังอยู่</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {!el && !holder ? (
          <p className="text-csmju-caption text-muted">เลือกรูปหรือกรอบบนผืนผ้าใบก่อน</p>
        ) : assets.isLoading ? (
          <Spinner />
        ) : assets.isError ? (
          <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />
        ) : assets.data!.items.length === 0 ? (
          <p className="text-csmju-caption text-muted">ยังไม่มีรูปที่อัปโหลด</p>
        ) : (
          <ul className="columns-2 gap-2">
            {assets.data!.items.map((asset) => (
              <li key={asset.id} className="mb-2 break-inside-avoid">
                <button type="button" onClick={() => replace(asset)} aria-label={`ใช้ ${asset.fileName} แทน`} className="csmju-checker block w-full overflow-hidden rounded-xl border border-line hover:shadow-csmju-md">
                  {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
                  <img src={asset.contentUrl} alt="" className="block w-full" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
