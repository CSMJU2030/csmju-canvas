'use client';

import { useQuery } from '@tanstack/react-query';
import { ImagePlus, LayoutTemplate, Ruler, Search, Star, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CardGridSkeleton, EmptyState, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { DesignCard, TemplateCard } from '@/components/designs/cards';
import { Carousel } from '@/components/designs/carousel';
import { DesignMenu } from '@/components/designs/design-menu';
import { TypeArt } from '@/components/designs/type-art';
import { useOpenCreate } from '@/components/shell/create-dialog';
import { api, qs } from '@/lib/csmju/api';
import { useCreateDesign } from '@/lib/create-design';
import { BROWSE_TILES, DESIGN_GROUPS, DESIGN_TYPES, designType, type DesignType } from '@/lib/design-types';
import type { DesignSummary, DesignTypeUsage, TemplateSummary } from '@/lib/types';

/// หน้าแรกของมือถือ (ภาพบรีฟ "หลัก" · "หลัก 1" · "หลัก 1.2" · "หลัก 1.3")
///
/// หัวไล่สีพร้อมช่องค้นหา · หัวย่อติดด้านบนเมื่อเลื่อนลง · ปุ่มลอยมุมขวาล่างสำหรับอัปโหลดรูป
export function MobileHome({ query, onQuery, searching, results }: { query: string; onQuery: (q: string) => void; searching: boolean; results: ReactNode }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [compact, setCompact] = useState(false);
  const openCreate = useOpenCreate();

  useEffect(() => {
    const hero = heroRef.current;

    if (!hero) return;

    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 });

    observer.observe(hero);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="pb-28">
      {/* หัวย่อ "หน้าหลัก" + ค้นหา โผล่เมื่อเลื่อนพ้นหัวไล่สี */}
      <div
        className={cx(
          'fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface px-4 transition-transform duration-200',
          compact ? 'translate-y-0' : '-translate-y-full',
        )}
        aria-hidden={!compact}
        inert={!compact}
      >
        <span className="text-csmju-body font-bold text-ink">หน้าหลัก</span>
        <button
          type="button"
          aria-label="ค้นหา"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => inputRef.current?.focus(), 300);
          }}
          className="inline-flex size-11 items-center justify-center rounded-xl text-ink"
        >
          <Search aria-hidden className="size-6" />
        </button>
      </div>

      <section ref={heroRef} className="csmju-hero px-4 pt-8 pb-5">
        <h1 className="csmju-gradient-text text-center text-csmju-h2 font-bold">วันนี้คุณจะดีไซน์อะไร?</h1>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-5">
          <div className="csmju-search relative rounded-2xl">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink" />
            <label htmlFor="mobile-search" className="sr-only">คุณอยากสร้างสรรค์อะไร</label>
            <input
              id="mobile-search"
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="คุณอยากสร้างสรรค์อะไร?"
              className="min-h-14 w-full rounded-2xl bg-transparent pr-4 pl-12 text-csmju-body text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
        </form>
      </section>

      <div className="flex flex-col gap-8 px-4 pt-2">
        {searching ? (
          results
        ) : (
          <>
            <RecentRow />
            <StartWith />
            <TypeRow title="ใช้บ่อย" source="usage" />
            <TypeRow title="ยอดนิยม" source="popular" />
            <QuickTools />
            <TemplatesYouMayLike />
            <BrowseSquares />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => openCreate('upload')}
        aria-label="อัปโหลดรูปเพื่อเริ่มงานแต่งรูป"
        title="อัปโหลดรูป"
        className="group csmju-gradient-button fixed right-4 bottom-20 z-30 inline-flex size-16 items-center justify-center rounded-full shadow-csmju-lg"
      >
        <ImagePlus aria-hidden className="csmju-wiggle size-7" />
      </button>
    </div>
  );
}

function Heading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-csmju-h3 font-bold text-ink">{title}</h2>
      {action}
    </div>
  );
}

function RecentRow() {
  const recent = useQuery({
    queryKey: ['designs', 'recent', 12],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ limit: 12, sort: 'updated' })}`),
  });
  const openCreate = useOpenCreate();

  return (
    <section>
      <Heading title="ดีไซน์ต่อ" action={<Link href="/projects" className="min-h-11 px-1 py-2 text-csmju-caption font-semibold text-ink">ดูทั้งหมด</Link>} />
      {recent.isLoading ? (
        <CardGridSkeleton count={2} className="grid-cols-2" />
      ) : (recent.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="ยังไม่มีดีไซน์"
          action={
            <button type="button" onClick={() => openCreate()} className="min-h-11 rounded-xl bg-primary px-5 text-csmju-caption font-semibold text-on-inverse">
              สร้างดีไซน์แรก
            </button>
          }
        />
      ) : (
        <Carousel label="ดีไซน์ต่อ">
          {recent.data!.items.map((design) => (
            <li key={design.id} className="w-44 shrink-0 snap-start">
              <DesignCard design={design} href={`/design/${design.id}`} menu={<DesignMenu design={design} />} />
            </li>
          ))}
        </Carousel>
      )}
    </section>
  );
}

/// "เลือกว่าจะเริ่มดีไซน์ยังไง": วงกลมสีใหญ่สองแถว เลื่อนแนวนอน
function StartWith() {
  const openCreate = useOpenCreate();
  const items: { key: string; label: string; icon: ReactNode; tone: string; onClick: () => void; soon?: boolean }[] = [
    ...DESIGN_GROUPS.map((g) => ({ key: g.key, label: g.label, icon: <g.icon aria-hidden className="size-8" />, tone: g.tone, onClick: () => openCreate(g.key), soon: !g.available })),
    { key: 'upload', label: 'อัปโหลด', icon: <ImagePlus aria-hidden className="size-8 text-primary" />, tone: 'bg-surface-muted', onClick: () => openCreate('upload') },
    { key: 'custom', label: 'กำหนดขนาดเอง', icon: <Ruler aria-hidden className="size-8 text-primary" />, tone: 'bg-surface-muted', onClick: () => openCreate('custom') },
  ];

  return (
    <section>
      <Heading title="เลือกว่าจะเริ่มดีไซน์ยังไง" />
      <ul className="csmju-scroll-x -mx-4 grid snap-x auto-cols-max grid-flow-col grid-rows-2 gap-x-3 gap-y-4 overflow-x-auto px-4">
        {items.map((item) => (
          <li key={item.key} className="snap-start">
            <button type="button" onClick={item.onClick} className="group flex w-20 flex-col items-center gap-1.5 text-center text-csmju-caption leading-tight text-ink">
              <span className={cx('csmju-wiggle flex size-20 items-center justify-center rounded-full text-on-inverse', item.tone)}>{item.icon}</span>
              <span>{item.label}</span>
              {item.soon && <span className="text-csmju-caption leading-none text-muted">เร็ว ๆ นี้</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function useStart() {
  const create = useCreateDesign();
  const toast = useToast();

  return (type: DesignType) =>
    create.mutate({ title: 'ดีไซน์ที่ไม่มีชื่อ', designType: type.key, width: type.width, height: type.height }, { onError: (e) => toast(errorMessage(e), 'error') });
}

/// แถวไทล์เล็ก (ใช้บ่อย · ยอดนิยม) — ภาพประกอบในกรอบเทาขอบมน + ชื่อด้านล่าง
function TypeRow({ title, source }: { title: string; source: 'usage' | 'popular' }) {
  const start = useStart();
  const usage = useQuery({
    queryKey: ['design-type-usages'],
    queryFn: () => api.list<DesignTypeUsage>(`/design-type-usages${qs({ limit: 12 })}`),
    enabled: source === 'usage',
  });
  const popular = useQuery({
    queryKey: ['templates', 'popular-types'],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ sort: 'popular', limit: 50 })}`),
    enabled: source === 'popular',
  });
  const keys =
    source === 'usage'
      ? (usage.data?.items ?? []).map((u) => u.designType)
      : [...new Set([...(popular.data?.items ?? []).map((t) => t.designType), ...DESIGN_TYPES.map((t) => t.key)])];
  const types = keys.map((k) => designType(k)).filter((t): t is DesignType => Boolean(t));

  if (types.length === 0) return null;

  return (
    <section>
      <Heading title={title} />
      <Carousel label={title}>
        {types.map((type) => (
          <li key={type.key} className="w-24 shrink-0 snap-start">
            <button type="button" onClick={() => start(type)} className="group block w-full text-center">
              <span className="flex aspect-square w-full items-center justify-center rounded-2xl bg-surface-muted p-2">
                <TypeArt type={type} className="h-full w-full" />
              </span>
              <span className="mt-1.5 line-clamp-2 block text-csmju-caption leading-tight text-ink">{type.label.replace(/\s*\(.*\)$/, '')}</span>
            </button>
          </li>
        ))}
      </Carousel>
    </section>
  );
}

/// เครื่องมือด่วน — เฉพาะเครื่องมือที่ CS Canvas มีจริง (ไม่มีเครื่องมือ AI ของ Canva)
function QuickTools() {
  const openCreate = useOpenCreate();
  const tools: { key: string; label: string; icon: ReactNode; tone: string; href?: string; onClick?: () => void }[] = [
    { key: 'photo', label: 'แต่งรูป', icon: <ImagePlus aria-hidden className="size-9" />, tone: 'bg-pastel-sky text-type-blue', onClick: () => openCreate('upload') },
    { key: 'whiteboard', label: 'ไวท์บอร์ด', icon: <StickyNote aria-hidden className="size-9" />, tone: 'bg-pastel-mint text-type-green', onClick: () => openCreate('whiteboard') },
    { key: 'custom', label: 'กำหนดขนาดเอง', icon: <Ruler aria-hidden className="size-9" />, tone: 'bg-pastel-lilac text-type-purple', onClick: () => openCreate('custom') },
    { key: 'starred', label: 'เทมเพลตติดดาว', icon: <Star aria-hidden className="size-9" />, tone: 'bg-pastel-butter text-chart-5', href: '/templates?starred=true' },
    { key: 'templates', label: 'เทมเพลตทั้งหมด', icon: <LayoutTemplate aria-hidden className="size-9" />, tone: 'bg-pastel-pink text-type-red', href: '/templates' },
  ];

  return (
    <section>
      <Heading title="เครื่องมือด่วน" />
      <Carousel label="เครื่องมือด่วน">
        {tools.map((tool) => {
          const inner = (
            <>
              <span className={cx('csmju-wiggle flex size-24 items-center justify-center rounded-full', tool.tone)}>{tool.icon}</span>
              <span className="mt-1.5 block text-csmju-caption text-ink">{tool.label}</span>
            </>
          );

          return (
            <li key={tool.key} className="w-24 shrink-0 snap-start text-center">
              {tool.href ? (
                <Link href={tool.href} className="group flex flex-col items-center">{inner}</Link>
              ) : (
                <button type="button" onClick={tool.onClick} className="group flex w-full flex-col items-center">{inner}</button>
              )}
            </li>
          );
        })}
      </Carousel>
    </section>
  );
}

function TemplatesYouMayLike() {
  const create = useCreateDesign();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['templates', 'popular', 10],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ sort: 'popular', limit: 10 })}`),
  });

  if (!query.data || query.data.items.length === 0) return null;

  return (
    <section>
      <Heading title="เทมเพลตที่คุณอาจชอบ" action={<Link href="/templates" className="min-h-11 px-1 py-2 text-csmju-caption font-semibold text-ink">ดูทั้งหมด</Link>} />
      <Carousel label="เทมเพลตที่คุณอาจชอบ">
        {query.data.items.map((t) => (
          <li key={t.id} className="w-80 shrink-0 snap-start">
            <TemplateCard size="lg" template={t} onUse={() => create.mutate({ title: t.title, templateId: t.id }, { onError: (e) => toast(errorMessage(e), 'error') })} />
          </li>
        ))}
      </Carousel>
    </section>
  );
}

/// "เลือกดูหมวดหมู่เทมเพลต" แบบมือถือ: ไทล์สี่เหลี่ยมพาสเทล + ชื่อด้านล่าง
export function BrowseSquares({ title = 'เลือกดูหมวดหมู่เทมเพลต', rows = 1, onPick }: { title?: string; rows?: 1 | 2; onPick?: (designType: string) => void }) {
  return (
    <section>
      <Heading title={title} />
      <ul className={cx('csmju-scroll-x -mx-4 grid snap-x auto-cols-max grid-flow-col gap-x-3 gap-y-4 overflow-x-auto px-4', rows === 2 ? 'grid-rows-2' : 'grid-rows-1')}>
        {BROWSE_TILES.map((tile) => {
          const content = (
            <>
              <span className={cx('relative flex size-24 items-end justify-center overflow-hidden rounded-2xl', tile.tone)}>
                <TypeArt type={designType(tile.designType)!} className="h-24 w-28 translate-x-3 translate-y-3 -rotate-6" />
              </span>
              <span className="mt-1.5 line-clamp-2 block w-24 text-center text-csmju-caption leading-tight text-ink">{tile.label}</span>
            </>
          );

          return (
            <li key={tile.designType} className="snap-start">
              {onPick ? (
                <button type="button" onClick={() => onPick(tile.designType)} className="flex flex-col items-center">{content}</button>
              ) : (
                <Link href={`/templates?designType=${tile.designType}`} className="flex flex-col items-center">{content}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
