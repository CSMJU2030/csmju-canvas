'use client';

import { useQuery } from '@tanstack/react-query';
import { CloudUpload, Ruler, Search, Sparkles } from 'lucide-react';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  EmptyState,
  FormField,
  cx,
  errorMessage,
  inputClass,
  useToast,
} from '@/components/csmju/primitives';
import { TemplateCard, TypeTile } from '@/components/designs/cards';
import { Carousel } from '@/components/designs/carousel';
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
    <Dialog open={tab !== null} onClose={onClose} title="สร้างดีไซน์" size="xl">
      <div className="flex flex-col gap-4 md:flex-row">
        <nav aria-label="หมวดงาน" className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col md:overflow-visible">
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

        <div className="min-w-0 flex-1">
          <div className="relative mb-4">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <label className="sr-only" htmlFor="create-search">
              คุณต้องการสร้างอะไร
            </label>
            <input
              id="create-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="คุณต้องการสร้างอะไร เช่น โปสเตอร์ เกียรติบัตร"
              className={cx(inputClass, 'pl-10')}
            />
          </div>

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

function CustomSize({ onClose }: { onClose: () => void }) {
  const [width, setWidth] = useState('1080');
  const [height, setHeight] = useState('1080');
  const create = useCreateDesign();
  const toast = useToast();
  const w = Number(width);
  const h = Number(height);
  const valid = Number.isInteger(w) && Number.isInteger(h) && w >= 16 && h >= 16 && w <= 8000 && h <= 8000;

  return (
    <form
      className="flex max-w-sm flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        create.mutate(
          { title: 'ดีไซน์ที่ไม่มีชื่อ', designType: CUSTOM_TYPE, width: w, height: h },
          { onSuccess: onClose, onError: (error) => toast(errorMessage(error), 'error') },
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="กว้าง (px)">
          {(props) => <input {...props} type="number" min={16} max={8000} value={width} onChange={(e) => setWidth(e.target.value)} className={inputClass} />}
        </FormField>
        <FormField label="สูง (px)">
          {(props) => <input {...props} type="number" min={16} max={8000} value={height} onChange={(e) => setHeight(e.target.value)} className={inputClass} />}
        </FormField>
      </div>
      {!valid && <p className="text-csmju-caption text-danger">ขนาดต้องเป็นจำนวนเต็ม 16–8000 พิกเซล</p>}
      <Button type="submit" variant="primary" disabled={!valid} loading={create.isPending}>
        สร้างดีไซน์ใหม่
      </Button>
    </form>
  );
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
