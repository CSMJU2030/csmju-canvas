'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Aperture, BookOpen, Camera, ClipboardPaste, Eraser, ExternalLink, Image as ImageIcon, Images, Info, Library, Lightbulb, MousePointer2,
  PanelRight, Quote, Rocket, Search, ShieldAlert, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, FormField, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { createImage } from '@/lib/editor/factory';
import { fillSelectedFrame, setImageDragData } from '@/lib/editor/frame-actions';
import {
  IMAGE_SOURCES, IMPORTED_GROUPS, SITE_LABELS, SOURCE_WINDOW_NAME, canCredit, createCreditText, hostOf, needsPermission, originOfAsset,
  sideWindowFeatures, sourceUrl, useImportHint, useSourceIntent, type ImageSourceSite, type KnownSite, type SourceSite,
} from '@/lib/editor/image-sources';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import type { ImageElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import type { Asset } from '@/lib/types';
import { SectionHeading } from './panel-parts';

/// "แหล่งภาพ" (ตามที่ PL ตัดสิน): ทางลัดไปเว็บคลังภาพที่เปิดข้างจอ · ผู้ใช้คัดลอก/ลากภาพกลับมาเองอย่างถูกสิทธิ์
/// ไม่มี iframe ไม่ดึงภาพจากเว็บอื่นฝั่งเซิร์ฟเวอร์ ไม่มี API key · ไอคอนเป็นไอคอนทั่วไปของ lucide ไม่ใช่โลโก้ของเว็บนั้น

const SOURCE_ICONS: Record<KnownSite, LucideIcon> = {
  unsplash: Camera,
  pexels: Aperture,
  pixabay: ImageIcon,
  openverse: Library,
  wikimedia: BookOpen,
  nasa: Rocket,
  pinterest: Lightbulb,
  google: Search,
};

// ── เปิดหน้าต่างข้างจอ ───────────────────────────────────────────

function useOpenSource() {
  const toast = useToast();

  return (source: ImageSourceSite, q: string) => {
    useSourceIntent.getState().remember(source.key);

    const screenInfo = window.screen as Screen & { availLeft?: number; availTop?: number };
    const win = window.open(sourceUrl(source, q), SOURCE_WINDOW_NAME, sideWindowFeatures(screenInfo));

    if (!win) {
      toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาตป๊อปอัปสำหรับ CS Canvas หรือกด “เปิดในแท็บใหม่”', 'error');
      return;
    }

    // ตัดการเข้าถึงหน้าแก้ไขจากหน้าต่างเว็บภายนอก (เปิดซ้ำแล้วหน้าต่างเป็นของเว็บอื่นแล้ว ตั้งค่าไม่ได้ ไม่เป็นไร)
    try {
      win.opener = null;
    } catch {
      /* หน้าต่างเดิมเป็นของเว็บอื่นแล้ว */
    }

    win.focus();
  };
}

export function ImageSourcesBrowser({ onShowImported }: { onShowImported?: () => void }) {
  const free = IMAGE_SOURCES.filter((s) => s.group === 'free');
  const inspiration = IMAGE_SOURCES.filter((s) => s.group === 'inspiration');

  return (
    <div className="flex flex-col gap-5">
      <p className="text-csmju-caption text-body">
        เปิดเว็บคลังภาพไว้ข้างจอ แล้วคัดลอกหรือลากภาพกลับมาใส่งาน — CS Canvas ไม่ฝังหรือดึงภาพจากเว็บเหล่านี้เอง และไม่ส่งข้อมูลของคุณไปให้ (คำค้นที่พิมพ์จะไปที่เว็บนั้นโดยตรง)
      </p>
      <p className="flex gap-2 rounded-xl bg-info-bg px-3 py-2 text-csmju-caption text-body">
        <PanelRight aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>“เปิดข้างจอ” จะเปิดเว็บไว้ครึ่งขวาของจอ · CS Canvas ย่อหน้าต่างตัวเองไม่ได้ ให้จัดหน้าต่างนี้ไปครึ่งซ้ายเอง (Windows: กด Win + ←)</span>
      </p>

      <ImportGuide />

      <section aria-label="คลังภาพสัญญาอนุญาตเสรี">
        <h3 className="mb-2 text-csmju-body font-bold text-ink">คลังภาพสัญญาอนุญาตเสรี</h3>
        <ul className="flex flex-col gap-3">
          {free.map((source) => (
            <li key={source.key}>
              <SourceCard source={source} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="หาไอเดียเท่านั้น">
        <h3 className="mb-2 text-csmju-body font-bold text-ink">หาไอเดียเท่านั้น</h3>
        <ul className="flex flex-col gap-3">
          {inspiration.map((source) => (
            <li key={source.key}>
              <SourceCard source={source} />
            </li>
          ))}
        </ul>
      </section>

      {onShowImported && (
        <Button onClick={onShowImported}>
          <Images aria-hidden className="size-4" /> ดูภาพที่นำเข้าแล้ว (แยกตามแหล่ง)
        </Button>
      )}
    </div>
  );
}

function ImportGuide() {
  return (
    <section aria-label="วิธีนำภาพเข้า" className="rounded-2xl border border-line bg-surface-muted p-3">
      <h3 className="mb-1 text-csmju-body font-bold text-ink">วิธีนำภาพเข้า</h3>
      <ol className="flex flex-col gap-1.5 text-csmju-caption text-body">
        <li className="flex gap-2">
          <ClipboardPaste aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>คลิกขวาที่ภาพ → “คัดลอกรูปภาพ” → กลับมาที่ CS Canvas แล้วกด Ctrl+V</span>
        </li>
        <li className="flex gap-2">
          <MousePointer2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>หรือลากภาพจากหน้าต่างนั้นมาวางบนหน้างาน</span>
        </li>
        <li className="flex gap-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>ถ้าเว็บไม่ยอมให้ดึงภาพ ให้บันทึกไฟล์ลงเครื่องก่อน แล้วลากไฟล์มาวาง · ภาพที่นำเข้าจะอยู่ในหมวด “ภาพที่นำเข้า” แยกตามแหล่ง</span>
        </li>
      </ol>
    </section>
  );
}

function SourceCard({ source }: { source: ImageSourceSite }) {
  const [q, setQ] = useState('');
  const open = useOpenSource();
  const Icon = SOURCE_ICONS[source.key];
  const warn = source.group === 'inspiration';
  const href = sourceUrl(source, q);

  return (
    <article className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-xl', warn ? 'bg-warning-bg text-warning' : 'bg-primary-soft text-primary')}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h4 className="text-csmju-body font-bold text-ink">{source.name}</h4>
          <p className="text-csmju-caption text-body">{source.description}</p>
        </div>
      </div>
      <p className={cx('mt-2 flex gap-1.5 rounded-lg px-2 py-1 text-csmju-caption', warn ? 'bg-warning-bg text-warning' : 'text-muted')}>
        {warn && <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span>{source.licence}</span>
      </p>
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          open(source, q);
        }}
      >
        <FormField label={`ค้นใน ${source.name} (ไม่ใส่ก็ได้)`}>
          {(field) => <input {...field} type="search" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} className={inputClass} />}
        </FormField>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
            <PanelRight aria-hidden className="size-4" /> เปิดข้างจอ
          </button>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => useSourceIntent.getState().remember(source.key)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-csmju-caption font-medium text-ink hover:bg-surface-muted"
          >
            <ExternalLink aria-hidden className="size-4" /> เปิดในแท็บใหม่
          </a>
        </div>
      </form>
    </article>
  );
}

// ── ภาพที่นำเข้า (แยกตามแหล่ง) ──────────────────────────────────

const PREVIEW_PER_GROUP = 6;
const PAGE_LIMIT = 40;

function loadImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 400 });
    img.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้'));
    img.src = src;
  });
}

/// ใส่ภาพที่นำเข้าลงหน้า (หรือลงกรอบที่เลือกอยู่) · คืน id ของชิ้นรูปใหม่ (ใส่ลงกรอบ = null)
async function insertImported(asset: Asset): Promise<string | null> {
  const size = await loadImage(asset.contentUrl);
  const source = { src: asset.contentUrl, assetId: asset.id, naturalWidth: size.width, naturalHeight: size.height, name: asset.fileName, origin: originOfAsset(asset) };

  if (fillSelectedFrame(source)) return null;

  const state = useEditor.getState();
  const image = createImage({ width: state.width, height: state.height }, source);

  state.addElements([image]);

  return image.id;
}

/// เลือกรูปแล้วเปิดแผง "ลบพื้นหลัง" (แผงทำงานกับรูปที่เลือกอยู่)
export function openBgRemoveFor(id: string) {
  useEditor.getState().select([id]);
  useEditorUi.getState().setPanel('bg-remove');
  useImportHint.getState().clear();
}

/// ใส่ข้อความเครดิตใต้รูป จากแหล่งที่มาที่บันทึกไว้จริงเท่านั้น
export function insertCreditFor(el: ImageElement): boolean {
  const state = useEditor.getState();

  if (!el.origin || !canCredit(el.origin.site) || !canEditDoc(state)) return false;

  state.addElements([createCreditText({ width: state.width, height: state.height }, el, el.origin)]);

  return true;
}

export function ImportedImagesBrowser({ onOpenSources }: { onOpenSources?: () => void }) {
  const [site, setSite] = useState<SourceSite | null>(null);

  if (site) return <ImportedSiteList site={site} onBack={() => setSite(null)} />;

  return <ImportedOverview onSeeAll={setSite} onOpenSources={onOpenSources} />;
}

function ImportedOverview({ onSeeAll, onOpenSources }: { onSeeAll: (site: SourceSite) => void; onOpenSources?: () => void }) {
  const imported = useQuery({
    queryKey: ['assets', 'imported'],
    queryFn: () => api.list<Asset>(`/assets${qs({ kind: 'image', imported: true, limit: 100 })}`),
  });

  if (imported.isLoading) return <Spinner />;
  if (imported.isError) return <ErrorState message={errorMessage(imported.error)} onRetry={() => void imported.refetch()} />;

  const items = imported.data!.items;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Images aria-hidden className="size-8" />}
        title="ยังไม่มีภาพที่นำเข้า"
        description="เปิดแหล่งภาพไว้ข้างจอ แล้วคัดลอก (Ctrl+V) หรือลากภาพมาวาง ภาพจะมาอยู่ที่นี่โดยแยกตามแหล่ง"
        action={onOpenSources ? <Button variant="primary" onClick={onOpenSources}>เปิดแหล่งภาพ</Button> : undefined}
      />
    );
  }

  const groups = IMPORTED_GROUPS.map((key) => ({ key, assets: items.filter((a) => (a.sourceSite ?? 'other') === key) })).filter((g) => g.assets.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-csmju-caption text-muted">ภาพที่คุณคัดลอกหรือลากมาจากเว็บอื่น · กดเพื่อใส่ลงหน้า · ลากไปวางบนกรอบได้ · เก็บในพื้นที่ของคุณเท่านั้น</p>
      {groups.map((group) => (
        <section key={group.key} aria-label={`ภาพจาก ${SITE_LABELS[group.key]}`}>
          <SectionHeading onSeeAll={() => onSeeAll(group.key)}>
            {SITE_LABELS[group.key]} <span className="font-normal text-muted">· {group.assets.length}{group.assets.length >= 100 ? '+' : ''} ภาพ</span>
          </SectionHeading>
          <ImportedGrid assets={group.assets.slice(0, PREVIEW_PER_GROUP)} />
        </section>
      ))}
      {onOpenSources && (
        <Button onClick={onOpenSources}>
          <PanelRight aria-hidden className="size-4" /> เปิดแหล่งภาพเพิ่ม
        </Button>
      )}
    </div>
  );
}

function ImportedSiteList({ site, onBack }: { site: SourceSite; onBack: () => void }) {
  const [limit, setLimit] = useState(PAGE_LIMIT);
  const list = useQuery({
    queryKey: ['assets', 'imported', site, limit],
    queryFn: () => api.list<Asset>(`/assets${qs({ kind: 'image', source: site, limit: Math.min(100, limit) })}`),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-csmju-body font-bold text-ink">ภาพจาก {SITE_LABELS[site]}</h3>
        <button type="button" onClick={onBack} className="min-h-11 px-2 text-csmju-caption font-semibold text-ink hover:underline">
          ทุกแหล่ง
        </button>
      </div>
      {needsPermission(site) && (
        <p className="flex gap-1.5 rounded-lg bg-warning-bg px-2 py-1 text-csmju-caption text-warning">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> ภาพส่วนใหญ่มีเจ้าของ ใช้ในงานได้เมื่อได้รับอนุญาตจากเจ้าของเท่านั้น
        </p>
      )}
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : list.data!.items.length === 0 ? (
        <EmptyState title={`ยังไม่มีภาพจาก ${SITE_LABELS[site]}`} />
      ) : (
        <>
          <ImportedGrid assets={list.data!.items} />
          {list.data!.meta.total > list.data!.items.length && limit < 100 && (
            <Button onClick={() => setLimit(100)}>แสดงเพิ่ม ({list.data!.meta.total - list.data!.items.length} ภาพ)</Button>
          )}
          {list.data!.meta.total > 100 && limit >= 100 && <p className="text-csmju-caption text-muted">แสดง 100 ภาพล่าสุด · ภาพเก่ากว่านี้อยู่ในแผงอัปโหลด</p>}
        </>
      )}
    </div>
  );
}

function ImportedGrid({ assets }: { assets: Asset[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const insert = async (asset: Asset, removeBg: boolean) => {
    if (!canEditDoc(useEditor.getState())) {
      toast('งานนี้เปิดแบบดูหรือแสดงความคิดเห็นได้อย่างเดียว', 'error');
      return;
    }

    setBusy(asset.id);

    try {
      const id = await insertImported(asset);

      if (removeBg) {
        if (id) openBgRemoveFor(id);
        else toast('ใส่รูปลงกรอบแล้ว — การลบพื้นหลังใช้กับรูปเดี่ยว ลองยกเลิกการเลือกกรอบก่อน');
      }
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="columns-2 gap-2">
      {assets.map((asset) => {
        const origin = originOfAsset(asset);
        const host = hostOf(asset.sourceUrl);

        return (
          <li key={asset.id} className="group relative mb-3 break-inside-avoid">
            <button
              type="button"
              draggable
              disabled={busy === asset.id}
              onDragStart={(event) => {
                const img = event.currentTarget.querySelector('img');

                setImageDragData(event.dataTransfer, {
                  src: asset.contentUrl,
                  assetId: asset.id,
                  naturalWidth: img?.naturalWidth || 400,
                  naturalHeight: img?.naturalHeight || 400,
                  name: asset.fileName,
                  origin,
                });
              }}
              onClick={() => void insert(asset, false)}
              aria-label={`ใส่รูป ${asset.fileName} (จาก ${SITE_LABELS[origin?.site ?? 'other']})`}
              title={asset.fileName}
              className="csmju-checker block w-full overflow-hidden rounded-xl border border-line hover:shadow-csmju-md disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
              <img src={asset.contentUrl} alt="" className="block w-full" loading="lazy" />
            </button>
            {needsPermission(origin?.site) && (
              <span className="pointer-events-none absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-csmju-caption font-semibold text-warning shadow-csmju-sm">
                <ShieldAlert aria-hidden className="size-3.5" /> ตรวจสิทธิ์ก่อนใช้
              </span>
            )}
            <button
              type="button"
              disabled={busy === asset.id}
              onClick={() => void insert(asset, true)}
              className="absolute right-1 bottom-9 inline-flex min-h-9 items-center gap-1 rounded-full bg-surface px-2.5 text-csmju-caption font-semibold text-ink opacity-0 shadow-csmju-md group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-primary-soft focus-visible:opacity-100"
            >
              <Eraser aria-hidden className="size-4" /> ลบพื้นหลัง
            </button>
            <div className="mt-1 flex items-center justify-between gap-1 text-csmju-caption text-muted">
              <span className="truncate">{SITE_LABELS[origin?.site ?? 'other']}{host ? ` · ${host}` : ''}</span>
              {asset.sourceUrl && (
                <a
                  href={asset.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`เปิดหน้าต้นฉบับของ ${asset.fileName}`}
                  title="เปิดหน้าต้นฉบับ"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
                >
                  <ExternalLink aria-hidden className="size-4" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── แถบแนะนำหลังนำภาพเข้า ───────────────────────────────────────

const HINT_MS = 20_000;

export function ImportHintBar() {
  const elementId = useImportHint((s) => s.elementId);
  const origin = useImportHint((s) => s.origin);
  const el = useEditor((s) => (elementId ? (currentPage(s).elements.find((e) => e.id === elementId && e.type === 'image') as ImageElement | undefined) : undefined));
  const toast = useToast();

  useEffect(() => {
    if (!elementId) return;

    const timer = window.setTimeout(() => useImportHint.getState().clear(), HINT_MS);

    return () => window.clearTimeout(timer);
  }, [elementId]);

  if (!elementId || !origin || !el) return null;

  const label = origin.site === 'other' ? 'เว็บอื่น' : SITE_LABELS[origin.site];

  return (
    <div role="status" className="csmju-pop absolute inset-x-4 bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 shadow-csmju-lg">
      <span className="text-csmju-caption text-ink">
        นำภาพจาก {label} เข้ามาแล้ว
        {needsPermission(origin.site) && <span className="ml-1 font-semibold text-warning">· ตรวจสิทธิ์ก่อนใช้</span>}
      </span>
      <Button variant="primary" onClick={() => openBgRemoveFor(el.id)} className="min-h-10">
        <Eraser aria-hidden className="size-4" /> ลบพื้นหลังภาพนี้
      </Button>
      {canCredit(origin.site) && (
        <Button
          onClick={() => {
            if (insertCreditFor(el)) {
              useImportHint.getState().clear();
              toast('ใส่เครดิตภาพใต้รูปแล้ว · แก้ข้อความได้ตามต้องการ');
            }
          }}
          className="min-h-10"
        >
          <Quote aria-hidden className="size-4" /> ใส่เครดิตภาพ
        </Button>
      )}
      <button type="button" aria-label="ปิดคำแนะนำ" title="ปิด" onClick={() => useImportHint.getState().clear()} className="inline-flex size-10 items-center justify-center rounded-xl text-ink hover:bg-surface-muted">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
