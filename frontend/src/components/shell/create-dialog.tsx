'use client';

import { useQuery } from '@tanstack/react-query';
import { CloudUpload, Lock, LockOpen, Ruler, Search, Sparkles } from 'lucide-react';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  EmptyState,
  FormField,
  IconButton,
  cx,
  errorMessage,
  inputClass,
  useToast,
} from '@/components/csmju/primitives';
import { TemplateCard, TypeTile } from '@/components/designs/cards';
import { Carousel } from '@/components/designs/carousel';
import { TypeArt } from '@/components/designs/type-art';
import { api, qs } from '@/lib/csmju/api';
import { designFromUpload, useCreateDesign } from '@/lib/create-design';
import {
  CUSTOM_TYPE,
  DESIGN_GROUPS,
  DESIGN_TYPES,
  type DesignGroupKey,
  type DesignType,
} from '@/lib/design-types';
import type { DesignTypeUsage, TemplateSummary } from '@/lib/types';

type Tab = 'for-you' | DesignGroupKey | 'custom' | 'upload';

const CreateContext = createContext<((tab?: Tab) => void) | null>(null);

export function useOpenCreate() {
  const open = useContext(CreateContext);

  if (!open) throw new Error('useOpenCreate ต้องอยู่ใต้ <CreateDesignProvider>');

  return open;
}

export function CreateDesignProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab | null>(null);

  return (
    <CreateContext.Provider value={(next = 'for-you') => setTab(next)}>
      {children}
      <CreateDesignDialog tab={tab} onTab={setTab} onClose={() => setTab(null)} />
    </CreateContext.Provider>
  );
}

function CreateDesignDialog({
  tab,
  onTab,
  onClose,
}: {
  tab: Tab | null;
  onTab: (tab: Tab) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const create = useCreateDesign();
  const toast = useToast();

  const startBlank = (type: DesignType) => {
    create.mutate(
      { title: 'ดีไซน์ที่ไม่มีชื่อ', designType: type.key, width: type.width, height: type.height },
      { onSuccess: onClose, onError: (error) => toast(errorMessage(error), 'error') },
    );
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();

    return q ? DESIGN_TYPES.filter((t) => t.label.toLowerCase().includes(q) || t.key.includes(q)) : [];
  }, [query]);

  const tabs: { key: Tab; label: string; icon: ReactNode; available: boolean }[] = [
    { key: 'for-you', label: 'สำหรับคุณ', icon: <Sparkles aria-hidden className="size-6 text-primary" />, available: true },
    ...DESIGN_GROUPS.map((g) => ({
      key: g.key as Tab,
      label: g.label,
      icon: (
        <span className={cx('flex size-6 items-center justify-center rounded-md text-on-inverse', g.tone)}>
          <g.icon aria-hidden className="size-4" />
        </span>
      ),
      available: g.available,
    })),
    { key: 'custom', label: 'กำหนดขนาดเอง', icon: <Ruler aria-hidden className="size-5" />, available: true },
    { key: 'upload', label: 'อัปโหลด', icon: <CloudUpload aria-hidden className="size-5" />, available: true },
  ];

  return (
    <Dialog open={tab !== null} onClose={onClose} title="สร้างดีไซน์" size="xl" bare>
      <div className="flex h-dialog flex-col md:flex-row">
        <div className="shrink-0 border-b border-line px-5 pt-6 pb-3 md:w-72 md:overflow-y-auto md:border-b-0 md:px-6">
        <h2 className="mb-5 text-csmju-h1 font-bold text-ink">สร้างดีไซน์</h2>
        <nav aria-label="หมวดงาน" className="csmju-scroll-x flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setQuery('');
                onTab(t.key);
              }}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cx(
                'flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-left text-csmju-caption',
                tab === t.key ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-surface-muted',
              )}
            >
              {t.icon}
              <span className="whitespace-nowrap">{t.label}</span>
              {!t.available && <span className="ml-auto hidden text-csmju-caption text-muted md:inline">เร็ว ๆ นี้</span>}
            </button>
          ))}
        </nav>
        </div>

        <div key={tab ?? 'none'} className="csmju-fade-in min-w-0 flex-1 overflow-y-auto px-5 pt-6 pb-6 md:pr-16 md:pl-2">
          {tab !== 'custom' && (
          <div className="relative mb-5">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <label className="sr-only" htmlFor="create-search">
              คุณต้องการสร้างอะไร
            </label>
            <input
              id="create-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="คุณต้องการสร้างอะไร เช่น โปสเตอร์ เกียรติบัตร"
              className={cx(inputClass, 'rounded-xl pl-10')}
            />
          </div>
          )}

          {query.trim() ? (
            matches.length > 0 ? (
              <TypeGrid types={matches} onPick={startBlank} busy={create.isPending} />
            ) : (
              <EmptyState title="ไม่พบประเภทงานที่ค้นหา" description="ลองคำอื่น หรือเลือก “กำหนดขนาดเอง”" />
            )
          ) : tab === 'for-you' ? (
            <ForYou onPick={startBlank} busy={create.isPending} onClose={onClose} />
          ) : tab === 'custom' ? (
            <CustomSize onClose={onClose} />
          ) : tab === 'upload' ? (
            <UploadStart onClose={onClose} />
          ) : tab ? (
            <GroupPanel group={tab} onPick={startBlank} busy={create.isPending} />
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function GroupPanel({ group, onPick, busy }: { group: DesignGroupKey; onPick: (t: DesignType) => void; busy: boolean }) {
  const meta = DESIGN_GROUPS.find((g) => g.key === group)!;
  const types = DESIGN_TYPES.filter((t) => t.group === group);

  if (!meta.available) {
    return (
      <EmptyState
        title={`${meta.label} จะเปิดให้ใช้ในช่วงถัดไป`}
        description="ช่วงแรกของ CS Canvas รองรับงานกราฟิกนิ่ง (สไลด์ โพสต์ งานพิมพ์ เอกสาร ไวท์บอร์ด) ก่อน ประเภทงานนี้อยู่ในแผนของช่วงถัดไป"
      />
    );
  }

  return <TypeGrid types={types} onPick={onPick} busy={busy} />;
}

/// ตารางไทล์ประเภทงาน (ภาพประกอบ + ชื่อ + ขนาด) แบบหน้าหมวดในป๊อปอัปของ Canva
export function TypeGrid({ types, onPick, busy }: { types: DesignType[]; onPick: (t: DesignType) => void; busy: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
      {types.map((type) => (
        <li key={type.key}>
          <TypeTile type={type} onClick={() => onPick(type)} disabled={busy} />
          <span className="block text-csmju-caption text-muted tabular-nums">
            {type.width} × {type.height} px
          </span>
        </li>
      ))}
    </ul>
  );
}

function ForYou({ onPick, busy, onClose }: { onPick: (t: DesignType) => void; busy: boolean; onClose: () => void }) {
  const usage = useQuery({
    queryKey: ['design-type-usages'],
    queryFn: () => api.list<DesignTypeUsage>(`/design-type-usages${qs({ limit: 8 })}`),
  });
  const popular = useQuery({
    queryKey: ['templates', 'popular-4'],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ sort: 'popular', limit: 4 })}`),
  });
  const create = useCreateDesign();
  const toast = useToast();

  const frequent = (usage.data?.items ?? [])
    .map((u) => DESIGN_TYPES.find((t) => t.key === u.designType))
    .filter((t): t is DesignType => Boolean(t));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-csmju-body font-semibold text-ink">ใช้บ่อย</h3>
        {frequent.length > 0 ? (
          <Carousel label="ประเภทที่ใช้บ่อย">
            {frequent.map((type) => (
              <li key={type.key} className="w-52 shrink-0 snap-start">
                <TypeTile type={type} onClick={() => onPick(type)} disabled={busy} />
              </li>
            ))}
          </Carousel>
        ) : (
          <p className="text-csmju-caption text-muted">
            {usage.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีสถิติ — ประเภทที่คุณสร้างบ่อยจะขึ้นที่นี่'}
          </p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-csmju-body font-semibold text-ink">เทมเพลตยอดนิยม</h3>
        {(popular.data?.items.length ?? 0) > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {popular.data!.items.map((template) => (
              <li key={template.id}>
                <TemplateCard
                  template={template}
                  onUse={() =>
                    create.mutate(
                      { title: template.title, templateId: template.id },
                      { onSuccess: onClose, onError: (error) => toast(errorMessage(error), 'error') },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-csmju-caption text-muted">{popular.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีเทมเพลต'}</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-csmju-body font-semibold text-ink">ยอดนิยม</h3>
        <Carousel label="ประเภทยอดนิยม">
          {DESIGN_TYPES.filter((t) => ['instagram-post', 'flyer', 'presentation', 'resume', 'poster', 'certificate', 'story', 'whiteboard'].includes(t.key)).map((type) => (
            <li key={type.key} className="w-52 shrink-0 snap-start">
              <TypeTile type={type} onClick={() => onPick(type)} disabled={busy} />
            </li>
          ))}
        </Carousel>
      </section>
    </div>
  );
}

type Unit = 'px' | 'in' | 'cm' | 'mm';

/// พิกเซลต่อหน่วย (กระดาษคิดที่ 96 dpi ให้ตรงกับประเภทงานอื่นในระบบ)
const PX_PER: Record<Unit, number> = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
const UNIT_LABEL: Record<Unit, string> = { px: 'px', in: 'นิ้ว', cm: 'ซม.', mm: 'มม.' };

/// เลย์เอาต์ยอดนิยมตามภาพบรีฟ (กดแล้วเติมขนาดให้ในช่องด้านบน)
const POPULAR_LAYOUTS: { label: string; width: number; height: number; unit: Unit }[] = [
  { label: 'เอกสาร (ไซส์ US แนวตั้ง)', width: 8.5, height: 11, unit: 'in' },
  { label: 'เอกสาร (A4 แนวนอน)', width: 29.7, height: 21, unit: 'cm' },
  { label: 'เอกสาร (โปสเตอร์แนวตั้ง A3)', width: 29.7, height: 42, unit: 'cm' },
  { label: 'เอกสาร (โปสเตอร์แนวนอน A3)', width: 420, height: 297, unit: 'mm' },
  { label: 'เอกสาร (A4 แนวตั้ง)', width: 21, height: 29.7, unit: 'cm' },
];

function CustomSize({ onClose }: { onClose: () => void }) {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [unit, setUnit] = useState<Unit>('px');
  const [locked, setLocked] = useState(false);
  const create = useCreateDesign();
  const toast = useToast();
  const w = Number(width);
  const h = Number(height);
  const pxW = Math.round(w * PX_PER[unit]);
  const pxH = Math.round(h * PX_PER[unit]);
  const filled = width.trim() !== '' && height.trim() !== '';
  const valid = filled && w > 0 && h > 0 && pxW >= 16 && pxH >= 16 && pxW <= 8000 && pxH <= 8000;

  const changeWidth = (value: string) => {
    if (locked && w > 0 && h > 0 && Number(value) > 0) setHeight(String(round(Number(value) * (h / w))));
    setWidth(value);
  };
  const changeHeight = (value: string) => {
    if (locked && w > 0 && h > 0 && Number(value) > 0) setWidth(String(round(Number(value) * (w / h))));
    setHeight(value);
  };
  const changeUnit = (next: Unit) => {
    // แปลงค่าที่กรอกไว้ให้เป็นขนาดเดิมในหน่วยใหม่
    if (w > 0) setWidth(String(round((w * PX_PER[unit]) / PX_PER[next])));
    if (h > 0) setHeight(String(round((h * PX_PER[unit]) / PX_PER[next])));
    setUnit(next);
  };

  const submit = () => {
    if (!valid) return;
    create.mutate(
      { title: 'ดีไซน์ที่ไม่มีชื่อ', designType: CUSTOM_TYPE, width: pxW, height: pxH },
      { onSuccess: onClose, onError: (error) => toast(errorMessage(error), 'error') },
    );
  };

  return (
    <div>
      <h3 className="mb-4 text-csmju-h2 font-bold text-ink">กำหนดขนาดเอง</h3>
      <form
        className="grid grid-cols-2 items-end gap-3 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <FormField label="ความกว้าง">
          {(props) => <input {...props} inputMode="decimal" value={width} onChange={(e) => changeWidth(e.target.value)} className={cx(inputClass, 'rounded-xl')} />}
        </FormField>
        <FormField label="ความยาว">
          {(props) => <input {...props} inputMode="decimal" value={height} onChange={(e) => changeHeight(e.target.value)} className={cx(inputClass, 'rounded-xl')} />}
        </FormField>
        <FormField label="หน่วย">
          {(props) => (
            <select {...props} value={unit} onChange={(e) => changeUnit(e.target.value as Unit)} className={cx(inputClass, 'rounded-xl')}>
              {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
                <option key={u} value={u}>{UNIT_LABEL[u]}</option>
              ))}
            </select>
          )}
        </FormField>
        <IconButton
          label={locked ? 'ปลดล็อกสัดส่วน' : 'ล็อกสัดส่วนกว้าง:ยาว'}
          active={locked}
          aria-pressed={locked}
          onClick={() => setLocked((v) => !v)}
          className="mb-0"
        >
          {locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
        </IconButton>
        <Button type="submit" variant={valid ? 'primary' : 'secondary'} disabled={!valid} loading={create.isPending} className="col-span-2 lg:col-span-1">
          สร้างดีไซน์ใหม่
        </Button>
      </form>
      <p className={cx('mt-2 text-csmju-caption', filled && !valid ? 'text-danger' : 'text-muted')}>
        {filled && !valid
          ? 'ขนาดต้องอยู่ระหว่าง 16–8000 พิกเซล'
          : filled && unit !== 'px'
            ? `= ${pxW.toLocaleString('th-TH')} × ${pxH.toLocaleString('th-TH')} พิกเซล (96 dpi)`
            : 'กรอกความกว้างและความยาว หรือเลือกจากเลย์เอาต์ด้านล่าง'}
      </p>

      <h3 className="mt-8 mb-4 text-csmju-h3 font-bold text-ink">เลย์เอาต์ยอดนิยม</h3>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
        {POPULAR_LAYOUTS.map((layout) => (
          <li key={layout.label}>
            <button
              type="button"
              onClick={() => {
                setUnit(layout.unit);
                setWidth(String(layout.width));
                setHeight(String(layout.height));
              }}
              className="group block w-full text-left"
            >
              <span className="flex aspect-4/3 w-full items-center justify-center rounded-xl bg-surface-muted p-3 transition-colors group-hover:bg-primary-soft">
                <TypeArt type={{ key: 'flyer', width: layout.width, height: layout.height, group: 'print' }} className="h-full w-full" />
              </span>
              <span className="mt-2 block truncate text-csmju-caption text-ink">{layout.label}</span>
              <span className="block text-csmju-caption text-muted tabular-nums">
                {layout.width} × {layout.height} {UNIT_LABEL[layout.unit]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function UploadStart({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const create = useCreateDesign();
  const toast = useToast();

  const onFile = async (file: File | undefined) => {
    if (!file) return;

    setBusy(true);

    try {
      const design = await designFromUpload(file);

      create.mutate(design, { onSuccess: onClose, onError: (error) => toast(errorMessage(error), 'error') });
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <CloudUpload aria-hidden className="size-10 text-primary" />
      <p className="text-csmju-body font-semibold text-ink">อัปโหลดรูปเพื่อเริ่มงานแต่งรูป</p>
      <p className="text-csmju-caption text-muted">PNG, JPEG, WebP, GIF หรือ SVG ไม่เกิน 10 MB · ผืนผ้าใบจะมีขนาดเท่ารูป</p>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        aria-label="เลือกไฟล์รูป"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <Button variant="primary" loading={busy || create.isPending} onClick={() => input.current?.click()}>
        เลือกไฟล์รูป
      </Button>
    </div>
  );
}
