'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Palette, Plus, Shuffle, Trash2, Type, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { Button, EmptyState, ErrorState, FormField, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { notifyAction } from '@/lib/editor/action-toast';
import { documentColors } from '@/lib/editor/color';
import { DESIGN_STYLES, applyStyleFonts, paletteMapping, recolorDocument, rotateAccents } from '@/lib/editor/design-styles';
import { createImage, createText } from '@/lib/editor/factory';
import { currentPage, useEditor } from '@/lib/editor/store';
import type { CanvasElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import type { Asset, BrandKit } from '@/lib/types';
import { ColorPicker } from './color-picker';
import { PanelHeader, UnderlineTabs } from './controls';
import { FontName, FontPicker } from './font-picker';

/// แผง "แบรนด์" (ชุดแบรนด์ของฉัน: สี ฟอนต์ โลโก้ เก็บที่หลังบ้าน) และแผง "สไตล์" (ชุดสี+ฟอนต์ที่เปลี่ยนทั้งงานในคลิกเดียว)

function close() {
  useEditorUi.getState().setPanel(null);
}

const KITS_KEY = ['brand-kits'];

function useBrandKits() {
  return useQuery({ queryKey: KITS_KEY, queryFn: () => api.list<BrandKit>('/brand-kits?limit=10') });
}

/// ใส่สีให้ชิ้นที่เลือก (ข้อความ = สีตัวอักษร · รูปทรง = สีพื้น · ไอคอน/เส้นวาด = สีเส้น) · ไม่ได้เลือก = สีพื้นหลังหน้า
function applyColor(color: string) {
  const state = useEditor.getState();
  const picked = currentPage(state).elements.filter((el) => state.selection.includes(el.id) && !el.locked);

  if (picked.length === 0) {
    state.setBackground(color);
    notifyAction('ใส่สีพื้นหลังหน้าแล้ว');
    return;
  }

  state.updateElements(
    picked.map((el) => el.id),
    (el): Partial<CanvasElement> => {
      if (el.type === 'text' || el.type === 'svg' || el.type === 'path') return { color };
      if (el.type === 'shape') return { fill: color };
      if (el.type === 'table') return { headerFill: color };

      return {};
    },
  );
  notifyAction(`ใส่สีให้ ${picked.length} ชิ้น`);
}

function applyWholeDesign(colors: string[] | null, fonts: { heading: string; body: string } | null) {
  const state = useEditor.getState();
  let doc = state.doc;

  if (colors && colors.length >= 2) doc = recolorDocument(doc, paletteMapping(doc, colors, { width: state.baseWidth, height: state.baseHeight }), { width: state.baseWidth, height: state.baseHeight });
  if (fonts) doc = applyStyleFonts(doc, fonts.heading, fonts.body);
  if (doc !== state.doc) state.updateDocument(doc);
}

// ── แบรนด์ ─────────────────────────────────────────────────────────

export function BrandPanel() {
  const kits = useBrandKits();
  const [chosen, setChosen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const items = kits.data?.items ?? [];
  const kit = items.find((k) => k.id === chosen) ?? items[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="ชุดแบรนด์" onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
        {kits.isPending ? (
          <Spinner label="กำลังโหลดชุดแบรนด์…" />
        ) : kits.isError ? (
          <ErrorState message={errorMessage(kits.error)} onRetry={() => void kits.refetch()} />
        ) : creating || items.length === 0 ? (
          items.length === 0 && !creating ? (
            <EmptyState
              icon={<Palette aria-hidden className="size-8" />}
              title="ยังไม่มีชุดแบรนด์"
              description="เก็บสี ฟอนต์ และโลโก้ของชมรม สาขา หรือโปรเจกต์ไว้ใช้ซ้ำได้ทุกงาน"
              action={<Button variant="primary" onClick={() => setCreating(true)}><Plus aria-hidden className="size-4" /> สร้างชุดแบรนด์</Button>}
            />
          ) : (
            <CreateKit onDone={(id) => { setCreating(false); if (id) setChosen(id); }} canCancel={items.length > 0} />
          )
        ) : (
          kit && (
            <>
              <div className="mb-4 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FormField label="ชุดแบรนด์">
                    {(field) => (
                      <select {...field} value={kit.id} onChange={(event) => setChosen(event.target.value)} className={inputClass}>
                        {items.map((k) => (
                          <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                      </select>
                    )}
                  </FormField>
                </div>
                <Button onClick={() => setCreating(true)} disabled={items.length >= 10} title={items.length >= 10 ? 'สร้างได้ไม่เกิน 10 ชุด' : undefined}>
                  <Plus aria-hidden className="size-4" /> ใหม่
                </Button>
              </div>
              <KitEditor key={kit.id} kit={kit} onDeleted={() => setChosen(null)} />
            </>
          )
        )}
      </div>
    </div>
  );
}

function CreateKit({ onDone, canCancel }: { onDone: (id: string | null) => void; canCancel: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [fromDesign, setFromDesign] = useState(true);
  const create = useMutation({
    mutationFn: () =>
      api.post<BrandKit>('/brand-kits', {
        name: name.trim(),
        colors: fromDesign ? documentColors(useEditor.getState().doc, 8) : [],
      }),
    onSuccess: (kit) => {
      void queryClient.invalidateQueries({ queryKey: KITS_KEY });
      toast(`สร้างชุดแบรนด์ “${kit.name}” แล้ว`);
      onDone(kit.id);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <FormField label="ชื่อชุดแบรนด์">
        {(field) => <input {...field} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="เช่น ชมรมคอมพิวเตอร์" className={inputClass} />}
      </FormField>
      <label className="flex min-h-10 items-center gap-3 text-csmju-caption text-ink">
        <input type="checkbox" checked={fromDesign} onChange={(event) => setFromDesign(event.target.checked)} className="size-5 accent-primary" />
        เริ่มด้วยสีที่ใช้อยู่ในงานนี้
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>สร้าง</Button>
        {canCancel && <Button onClick={() => onDone(null)}>ยกเลิก</Button>}
      </div>
    </form>
  );
}

function KitEditor({ kit, onDeleted }: { kit: BrandKit; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'colors' | 'fonts' | 'logos'>('colors');
  const [name, setName] = useState(kit.name);
  const update = useMutation({
    mutationFn: (body: Partial<{ name: string; colors: string[]; headingFont: string | null; bodyFont: string | null; logoAssetIds: string[] }>) => api.patch<BrandKit>(`/brand-kits/${kit.id}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KITS_KEY }),
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/brand-kits/${kit.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KITS_KEY });
      toast(`ลบชุดแบรนด์ “${kit.name}” แล้ว`);
      onDeleted();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <div className="flex flex-col gap-4">
      <FormField label="ชื่อ">
        {(field) => (
          <input
            {...field}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => name.trim() && name.trim() !== kit.name && update.mutate({ name: name.trim() })}
            className={inputClass}
          />
        )}
      </FormField>
      <UnderlineTabs
        label="ส่วนของชุดแบรนด์"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'colors', label: 'สี' },
          { key: 'fonts', label: 'ฟอนต์' },
          { key: 'logos', label: 'โลโก้' },
        ]}
      />
      {tab === 'colors' && <KitColors kit={kit} onSave={(colors) => update.mutate({ colors })} />}
      {tab === 'fonts' && <KitFonts kit={kit} onSave={(fonts) => update.mutate(fonts)} />}
      {tab === 'logos' && <KitLogos kit={kit} onSave={(logoAssetIds) => update.mutate({ logoAssetIds })} />}
      <button
        type="button"
        onClick={() => window.confirm(`ลบชุดแบรนด์ “${kit.name}”? (โลโก้ในคลังรูปยังอยู่)`) && remove.mutate()}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-csmju-caption font-semibold text-danger hover:bg-danger-bg"
      >
        <Trash2 aria-hidden className="size-4" /> ลบชุดแบรนด์นี้
      </button>
    </div>
  );
}

function KitColors({ kit, onSave }: { kit: BrandKit; onSave: (colors: string[]) => void }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const [draft, setDraft] = useState('rgb(0 76 153)');
  const full = kit.colors.length >= 24;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-csmju-caption text-muted">คลิกสีเพื่อใส่ให้ชิ้นที่เลือก (ไม่ได้เลือก = สีพื้นหลังหน้า)</p>
      <div className="flex flex-wrap gap-2">
        {kit.colors.map((color) => (
          <span key={color} className="group relative">
            <button
              type="button"
              onClick={() => applyColor(color)}
              aria-label={`ใส่สี ${color}`}
              title={color}
              className="size-11 rounded-full ring-1 ring-line-strong ring-offset-2 ring-offset-surface hover:scale-105"
              style={{ background: color }}
            />
            <button
              type="button"
              onClick={() => onSave(kit.colors.filter((c) => c !== color))}
              aria-label={`เอาสี ${color} ออกจากชุด`}
              className="absolute -top-1 -right-1 hidden size-6 items-center justify-center rounded-full bg-surface text-ink shadow-csmju-sm ring-1 ring-line group-focus-within:flex group-hover:flex"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
        <button
          ref={anchorRef}
          type="button"
          disabled={full}
          onClick={() => setOpen(!open)}
          aria-label="เพิ่มสีในชุด"
          title={full ? 'ใส่ได้ไม่เกิน 24 สี' : 'เพิ่มสี'}
          className="inline-flex size-11 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-ink hover:bg-surface-muted disabled:opacity-40"
        >
          <Plus aria-hidden className="size-5" />
        </button>
      </div>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label="เพิ่มสีในชุดแบรนด์" className="w-72 rounded-2xl border border-line bg-surface p-3 shadow-csmju-lg">
        <ColorPicker value={draft} onChange={setDraft} />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button variant="primary" onClick={() => { onSave([...kit.colors, draft]); setOpen(false); }}>เพิ่มสีนี้</Button>
        </div>
      </FloatingPanel>
      <div className="flex flex-col gap-2">
        <Button disabled={full} onClick={() => onSave([...kit.colors, ...documentColors(useEditor.getState().doc, 24)].slice(0, 24))}>
          เพิ่มสีที่ใช้ในงานนี้
        </Button>
        <Button variant="primary" disabled={kit.colors.length < 2} onClick={() => { applyWholeDesign(kit.colors, null); notifyAction('ใช้สีแบรนด์กับทั้งงานแล้ว'); }}>
          ใช้สีแบรนด์กับทั้งงาน
        </Button>
      </div>
    </div>
  );
}

function KitFonts({ kit, onSave }: { kit: BrandKit; onSave: (fonts: { headingFont?: string | null; bodyFont?: string | null }) => void }) {
  const add = (preset: 'heading' | 'body') => {
    const state = useEditor.getState();
    const font = (preset === 'heading' ? kit.headingFont : kit.bodyFont) ?? undefined;

    state.addElements([createText({ width: state.width, height: state.height }, preset, { fontFamily: font, color: kit.colors[1] ?? undefined })]);
  };

  return (
    <div className="flex flex-col gap-4">
      <FontPicker label="ฟอนต์หัวข้อ" value={kit.headingFont ?? 'Noto Sans Thai'} onChange={(id) => onSave({ headingFont: id })} />
      <FontPicker label="ฟอนต์เนื้อหา" value={kit.bodyFont ?? 'Noto Sans Thai'} onChange={(id) => onSave({ bodyFont: id })} />
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => add('heading')}><Type aria-hidden className="size-4" /> ใส่หัวข้อ</Button>
        <Button onClick={() => add('body')}><Type aria-hidden className="size-4" /> ใส่เนื้อหา</Button>
      </div>
      <Button
        variant="primary"
        disabled={!kit.headingFont && !kit.bodyFont}
        onClick={() => {
          applyWholeDesign(null, { heading: kit.headingFont ?? kit.bodyFont!, body: kit.bodyFont ?? kit.headingFont! });
          notifyAction('ใช้ฟอนต์แบรนด์กับทั้งงานแล้ว');
        }}
      >
        ใช้ฟอนต์แบรนด์กับทั้งงาน
      </Button>
    </div>
  );
}

function KitLogos({ kit, onSave }: { kit: BrandKit; onSave: (ids: string[]) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);
  const selectedImage = elements.find((el) => selection.includes(el.id) && el.type === 'image' && el.assetId);
  const ids = kit.logos.map((l) => l.id);
  const full = ids.length >= 12;

  const insert = (logo: BrandKit['logos'][number]) => {
    const img = new Image();

    img.onload = () => {
      const state = useEditor.getState();

      state.addElements([
        createImage({ width: state.width, height: state.height }, { src: logo.contentUrl, assetId: logo.id, naturalWidth: img.naturalWidth || 400, naturalHeight: img.naturalHeight || 400, name: logo.fileName, mimeType: logo.mimeType }),
      ]);
    };
    img.onerror = () => toast('เปิดโลโก้นี้ไม่ได้', 'error');
    img.src = logo.contentUrl;
  };

  const upload = async (file: File) => {
    setUploading(true);

    try {
      const asset = await api.upload<Asset>('/assets', file);

      onSave([...ids, asset.id]);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {kit.logos.length === 0 ? (
        <p className="text-csmju-caption text-muted">ยังไม่มีโลโก้ · อัปโหลดไฟล์ หรือเลือกรูปในงานแล้วกด “ใช้รูปที่เลือกเป็นโลโก้”</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {kit.logos.map((logo) => (
            <span key={logo.id} className="group relative">
              <button type="button" onClick={() => insert(logo)} aria-label={`ใส่โลโก้ ${logo.fileName}`} className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-muted p-2 hover:ring-2 hover:ring-primary">
                {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ของผู้ใช้ผ่าน session ของระบบ */}
                <img src={logo.contentUrl} alt="" className="max-h-full max-w-full object-contain" />
              </button>
              <button
                type="button"
                onClick={() => onSave(ids.filter((id) => id !== logo.id))}
                aria-label={`เอา ${logo.fileName} ออกจากชุด`}
                className="absolute -top-1 -right-1 hidden size-6 items-center justify-center rounded-full bg-surface text-ink shadow-csmju-sm ring-1 ring-line group-focus-within:flex group-hover:flex"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ''; if (f) void upload(f); }} />
      <Button disabled={full} loading={uploading} onClick={() => input.current?.click()}>
        <Plus aria-hidden className="size-4" /> อัปโหลดโลโก้
      </Button>
      <Button disabled={full || !selectedImage || ids.includes((selectedImage as { assetId: string }).assetId)} onClick={() => selectedImage && onSave([...ids, (selectedImage as { assetId: string }).assetId])}>
        <ImageIcon aria-hidden className="size-4" /> ใช้รูปที่เลือกเป็นโลโก้
      </Button>
    </div>
  );
}

// ── สไตล์ ──────────────────────────────────────────────────────────

type StyleScope = 'all' | 'colors' | 'fonts';

export function StylesPanel() {
  const [scope, setScope] = useState<StyleScope>('all');
  const [applied, setApplied] = useState<{ colors: string[]; heading: string; body: string; step: number } | null>(null);
  const kits = useBrandKits();
  const brandStyles = (kits.data?.items ?? []).filter((k) => k.colors.length >= 2 || k.headingFont || k.bodyFont);

  const apply = (colors: string[], heading: string, body: string, label: string) => {
    applyWholeDesign(scope === 'fonts' ? null : colors, scope === 'colors' ? null : { heading, body });
    setApplied({ colors, heading, body, step: 0 });
    notifyAction(`ใช้สไตล์ “${label}” แล้ว`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="สไตล์" onClose={close} />
      <UnderlineTabs
        label="ส่วนที่จะเปลี่ยน"
        value={scope}
        onChange={setScope}
        tabs={[
          { key: 'all', label: 'สีและฟอนต์' },
          { key: 'colors', label: 'เฉพาะสี' },
          { key: 'fonts', label: 'เฉพาะฟอนต์' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
        <p className="mb-3 text-csmju-caption text-muted">เปลี่ยนทั้งงานในคลิกเดียว (กด Ctrl+Z เพื่อย้อนกลับ) · ชิ้นที่ล็อกไม่เปลี่ยน</p>
        <Button
          className="mb-4 w-full"
          disabled={!applied || scope === 'fonts'}
          onClick={() => {
            if (!applied) return;

            const step = applied.step + 1;

            applyWholeDesign(rotateAccents(applied.colors, step), null);
            setApplied({ ...applied, step });
          }}
        >
          <Shuffle aria-hidden className="size-4" /> สลับสีเน้นของสไตล์ล่าสุด
        </Button>
        {brandStyles.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-csmju-body font-bold text-ink">ชุดแบรนด์ของฉัน</h3>
            <div className="grid grid-cols-2 gap-3">
              {brandStyles.map((k) => (
                <StyleCard
                  key={k.id}
                  name={k.name}
                  colors={k.colors.slice(0, 5)}
                  heading={k.headingFont ?? k.bodyFont ?? 'Noto Sans Thai'}
                  onClick={() => apply(k.colors, k.headingFont ?? k.bodyFont ?? 'Noto Sans Thai', k.bodyFont ?? k.headingFont ?? 'Noto Sans Thai', k.name)}
                />
              ))}
            </div>
          </section>
        )}
        <h3 className="mb-2 text-csmju-body font-bold text-ink">สไตล์สำเร็จรูป</h3>
        <div className="grid grid-cols-2 gap-3">
          {DESIGN_STYLES.map((style) => (
            <StyleCard key={style.id} name={style.name} colors={style.colors} heading={style.heading} onClick={() => apply(style.colors, style.heading, style.body, style.name)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StyleCard({ name, colors, heading, onClick }: { name: string; colors: string[]; heading: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col overflow-hidden rounded-xl text-left ring-1 ring-line hover:ring-2 hover:ring-primary">
      <span className="flex h-16 items-center justify-center text-csmju-h3" style={{ background: colors[0], color: colors[1] }}>
        <FontName id={heading} label="Aa" />
      </span>
      <span className="flex h-3">
        {colors.slice(2).map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </span>
      <span className={cx('px-2 py-1.5 text-csmju-caption text-ink')}>{name}</span>
    </button>
  );
}
