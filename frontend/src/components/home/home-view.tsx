'use client';

import { useQuery } from '@tanstack/react-query';
import { CloudUpload, Ellipsis, HardDrive, House, LayoutTemplate, Ruler, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CardGridSkeleton, EmptyState, ErrorState, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { DesignCard, TemplateCard, TypeTile } from '@/components/designs/cards';
import { Carousel } from '@/components/designs/carousel';
import { DesignMenu } from '@/components/designs/design-menu';
import { TypeArt } from '@/components/designs/type-art';
import { EMPTY_FILTERS, FilterBar, type SearchFilters } from './search-filters';
import { useOpenCreate } from '@/components/shell/create-dialog';
import { api, qs } from '@/lib/csmju/api';
import { useCreateDesign } from '@/lib/create-design';
import { BROWSE_TILES, DESIGN_GROUPS, DESIGN_TYPES, designType, type DesignType } from '@/lib/design-types';
import { formatBytes } from '@/lib/format';
import { CategoryChips, TemplatesTab } from './templates-tab';
import type { DesignSummary, DesignTypeUsage, Quota, TemplateSummary } from '@/lib/types';

/// หน้าแรกแบบ Canva สองแท็บ: หน้าหลัก (/) และเทมเพลต (/templates) ใช้หัวเดียวกัน
/// (ภาพบรีฟ "ถ้ากด เทมเพลต มันจะไปโผล่ข้างล่าง")
export function HomeView({ tab }: { tab: 'home' | 'templates' }) {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [focused, setFocused] = useState(false);
  const searching = query.trim() !== '' || JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div>
      <section className="csmju-hero relative px-4 pt-14 pb-6 md:px-10">
        <QuotaChip />
        <h1 className="csmju-gradient-text text-center text-csmju-h1 font-bold md:text-csmju-display">วันนี้คุณจะดีไซน์อะไร?</h1>

        <div className="mt-6 flex justify-center gap-2" role="tablist" aria-label="มุมมอง">
          {(
            [
              ['home', '/', 'หน้าหลัก', House],
              ['templates', '/templates', 'เทมเพลต', LayoutTemplate],
            ] as const
          ).map(([key, href, label, Icon]) => (
            <Link
              key={key}
              role="tab"
              aria-selected={tab === key}
              href={href}
              className={cx(
                'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-csmju-caption transition-colors',
                tab === key ? 'border-primary bg-surface/80 font-semibold text-primary' : 'border-line-strong bg-surface/60 text-ink hover:bg-surface',
              )}
            >
              <Icon aria-hidden className="size-4" /> {label}
            </Link>
          ))}
        </div>

        <form className="mx-auto mt-5 max-w-3xl" role="search" onSubmit={(event) => event.preventDefault()}>
          <div className={cx('csmju-search relative rounded-2xl', focused && 'is-focused')}>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-ink" />
            <label htmlFor="home-search" className="sr-only">{tab === 'templates' ? 'ค้นหาเทมเพลต' : 'ค้นหาอะไรก็ได้'}</label>
            <input
              id="home-search"
              type="search"
              value={query}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === 'templates' ? 'ค้นหาเทมเพลต' : 'ค้นหาอะไรก็ได้'}
              className="min-h-14 w-full rounded-2xl bg-transparent pr-4 pl-14 text-csmju-body text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
        </form>
        {tab === 'templates' ? (
          <CategoryChips value={category} onChange={setCategory} />
        ) : (
          (focused || searching) && (
            <div className="mt-3" onMouseDown={(event) => event.preventDefault()}>
              <FilterBar value={filters} onChange={setFilters} />
            </div>
          )
        )}

        {tab === 'home' && <TypeShortcuts />}
      </section>

      <div key={tab} className="csmju-fade-in flex flex-col gap-12 px-4 pt-6 pb-12 md:px-10">
        {tab === 'templates' ? (
          <TemplatesTab
            key={`${params.get('starred')}|${params.get('builtIn')}|${params.get('owner')}`}
            query={query.trim()}
            category={category}
            initialType={params.get('designType') ?? ''}
            starred={params.get('starred') === 'true'}
            builtIn={params.get('builtIn') === 'true'}
            mine={params.get('owner') === 'me'}
          />
        ) : searching ? (
          <SearchResults query={query.trim()} filters={filters} onClear={() => { setQuery(''); setFilters(EMPTY_FILTERS); }} />
        ) : (
          <>
            <RecentDesigns />
            <TemplatesForYou />
            <BrowseCategories />
            <FrequentTypes />
            <PopularTypes />
          </>
        )}
      </div>
    </div>
  );
}

/// ตรงตำแหน่งปุ่ม "ทดลองใช้ฟรี 30 วัน" ของ Canva — ระบบนี้ไม่มีการจ่ายเงิน จึงแสดงพื้นที่ใช้งานคงเหลือ
function QuotaChip() {
  const { data } = useQuery({ queryKey: ['quotas'], queryFn: () => api.get<Quota>('/quotas') });

  if (!data) return null;

  const left = Math.max(0, data.quotaBytes - data.usedBytes);

  return (
    <Link
      href="/account/storage"
      className="absolute top-5 right-5 hidden min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-csmju-caption font-semibold text-ink shadow-csmju-sm hover:shadow-csmju-md sm:inline-flex"
    >
      <HardDrive aria-hidden className="size-4 text-chart-5" />
      พื้นที่คงเหลือ {formatBytes(left)}
    </Link>
  );
}

function TypeShortcuts() {
  const openCreate = useOpenCreate();
  const router = useRouter();
  const shortcuts: { label: string; icon: ReactNode; tone: string; onClick: () => void; soon?: boolean }[] = [
    { label: 'เทมเพลต', icon: <LayoutTemplate aria-hidden className="size-6" />, tone: 'bg-type-purple', onClick: () => router.push('/templates') },
    ...DESIGN_GROUPS.map((g) => ({
      label: g.label,
      icon: <g.icon aria-hidden className="size-6" />,
      tone: g.tone,
      onClick: () => openCreate(g.key),
      soon: !g.available,
    })),
    { label: 'กำหนดขนาดเอง', icon: <Ruler aria-hidden className="size-6 text-ink" />, tone: 'bg-surface border border-line', onClick: () => openCreate('custom') },
    { label: 'อัปโหลด', icon: <CloudUpload aria-hidden className="size-6 text-ink" />, tone: 'bg-surface border border-line', onClick: () => openCreate('upload') },
    { label: 'เพิ่มเติม', icon: <Ellipsis aria-hidden className="size-6 text-primary" />, tone: 'bg-primary-soft', onClick: () => openCreate('for-you') },
  ];

  return (
    <ul className="csmju-scroll-x mx-auto mt-10 flex max-w-6xl gap-2 overflow-x-auto pb-2 lg:justify-center">
      {shortcuts.map((s, index) => (
        <li key={s.label} className={cx('shrink-0', index === 0 && 'mr-3 border-r border-line pr-3')}>
          <button type="button" onClick={s.onClick} className="group flex w-20 flex-col items-center gap-2 rounded-xl p-1 text-csmju-caption text-ink">
            <span className={cx('csmju-wiggle flex size-12 items-center justify-center rounded-full text-on-inverse shadow-csmju-sm transition-shadow group-hover:shadow-csmju-md', s.tone)}>
              {s.icon}
            </span>
            <span className="text-center leading-tight">{s.label}</span>
            {s.soon && <span className="-mt-1 text-csmju-caption leading-none text-muted">เร็ว ๆ นี้</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-csmju-h2 font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="min-h-11 px-2 py-2 text-csmju-caption font-semibold text-ink hover:text-primary">
      ดูทั้งหมด
    </Link>
  );
}

const gridClass = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

function RecentDesigns() {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? 24 : 12;
  const query = useQuery({
    queryKey: ['designs', 'recent', limit],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ limit, sort: 'updated' })}`),
  });
  const openCreate = useOpenCreate();

  return (
    <Section title="ดีไซน์ต่อ" action={<SeeAll href="/projects" />}>
      {query.isLoading ? (
        <CardGridSkeleton count={12} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data!.items.length === 0 ? (
        <EmptyState
          title="ยังไม่มีดีไซน์"
          description="ดีไซน์ที่คุณสร้างจะขึ้นที่นี่ เพื่อกลับมาแก้ต่อได้ทันที"
          action={
            <button type="button" onClick={() => openCreate()} className="min-h-11 rounded-xl bg-primary px-5 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
              สร้างดีไซน์แรก
            </button>
          }
        />
      ) : (
        <>
          <ul className={gridClass}>
            {query.data!.items.map((design) => (
              <li key={design.id}>
                <DesignCard design={design} href={`/design/${design.id}`} menu={<DesignMenu design={design} />} />
              </li>
            ))}
          </ul>
          {query.data!.meta.total > 12 && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="min-h-11 rounded-xl border border-line-strong bg-surface px-5 text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
              >
                {expanded ? 'แสดงน้อยลง' : 'แสดงเพิ่มเติม'}
              </button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function useStartBlank() {
  const create = useCreateDesign();
  const toast = useToast();

  return {
    busy: create.isPending,
    start: (type: DesignType) =>
      create.mutate(
        { title: 'ดีไซน์ที่ไม่มีชื่อ', designType: type.key, width: type.width, height: type.height },
        { onError: (error) => toast(errorMessage(error), 'error') },
      ),
  };
}

function useUsage() {
  return useQuery({
    queryKey: ['design-type-usages'],
    queryFn: () => api.list<DesignTypeUsage>(`/design-type-usages${qs({ limit: 12 })}`),
  });
}

function FrequentTypes() {
  const usage = useUsage();
  const { start, busy } = useStartBlank();
  const types = (usage.data?.items ?? []).map((u) => designType(u.designType)).filter((t): t is DesignType => Boolean(t));

  if (usage.isLoading || types.length === 0) return null;

  return (
    <Section title="ใช้บ่อย">
      <Carousel label="ประเภทที่ใช้บ่อย">
        {types.map((type) => (
          <li key={type.key} className="w-56 shrink-0 snap-start">
            <TypeTile type={type} onClick={() => start(type)} disabled={busy} />
          </li>
        ))}
      </Carousel>
    </Section>
  );
}

/// ยอดนิยม = ประเภทงานที่มีเทมเพลตถูกใช้มากที่สุดในระบบ (คิดจาก usageCount จริง) ต่อด้วยประเภทอื่นที่รองรับ
function PopularTypes() {
  const { start, busy } = useStartBlank();
  const popular = useQuery({
    queryKey: ['templates', 'popular-types'],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ sort: 'popular', limit: 50 })}`),
  });
  const ranked = [...new Set((popular.data?.items ?? []).map((t) => t.designType))];
  const types = [
    ...ranked.map((key) => designType(key)).filter((t): t is DesignType => Boolean(t)),
    ...DESIGN_TYPES.filter((t) => !ranked.includes(t.key)),
  ];

  return (
    <Section title="ยอดนิยม">
      <Carousel label="ประเภทยอดนิยม">
        {types.map((type) => (
          <li key={type.key} className="w-56 shrink-0 snap-start">
            <TypeTile type={type} onClick={() => start(type)} disabled={busy} />
          </li>
        ))}
      </Carousel>
    </Section>
  );
}

function BrowseCategories() {
  return (
    <Section title="เลือกดูหมวดหมู่เทมเพลต">
      <Carousel label="หมวดหมู่เทมเพลต">
        {chunk(BROWSE_TILES, 2).map((pair) => (
          <li key={pair[0].designType} className="flex w-56 shrink-0 snap-start flex-col gap-3">
            {pair.map((tile) => {
              const type = designType(tile.designType)!;

              return (
                <Link
                  key={tile.designType}
                  href={`/templates?designType=${tile.designType}`}
                  className={cx('relative flex h-20 items-center overflow-hidden rounded-xl px-4 text-csmju-caption font-medium text-ink transition-shadow hover:shadow-csmju-md', tile.tone)}
                >
                  <span className="relative z-10 max-w-24 leading-snug">{tile.label}</span>
                  <TypeArt type={type} className="absolute -right-2 -bottom-3 h-24 w-32 -rotate-6" />
                </Link>
              );
            })}
          </li>
        ))}
      </Carousel>
    </Section>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

/// เทมเพลตของประเภทที่ผู้ใช้สร้างบ่อยที่สุด · ยังไม่มีสถิติ = เทมเพลตยอดนิยม
function TemplatesForYou() {
  const usage = useUsage();
  const topType = usage.data?.items[0]?.designType;
  const create = useCreateDesign();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['templates', 'for-you', topType ?? 'popular'],
    queryFn: async () => {
      const typed = topType ? await api.list<TemplateSummary>(`/templates${qs({ designType: topType, limit: 10 })}`) : null;

      return typed && typed.items.length >= 3 ? typed : api.list<TemplateSummary>(`/templates${qs({ sort: 'popular', limit: 10 })}`);
    },
    enabled: !usage.isLoading,
  });

  if (!query.data || query.data.items.length === 0) return null;

  return (
    <Section title="เทมเพลตสำหรับคุณ" action={<SeeAll href="/templates" />}>
      <Carousel label="เทมเพลตสำหรับคุณ">
        {query.data.items.map((template) => (
          <li key={template.id} className="w-80 shrink-0 snap-start md:w-96">
            <TemplateCard
              size="lg"
              template={template}
              onUse={() => create.mutate({ title: template.title, templateId: template.id }, { onError: (e) => toast(errorMessage(e), 'error') })}
            />
          </li>
        ))}
      </Carousel>
    </Section>
  );
}

function SearchResults({ query, filters, onClear }: { query: string; filters: SearchFilters; onClear: () => void }) {
  const wantDesigns = filters.owner !== 'others';
  const wantTemplates = filters.owner !== 'me';
  const create = useCreateDesign();
  const toast = useToast();
  const designs = useQuery({
    queryKey: ['designs', 'search', query, filters],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ q: query, designType: filters.designType, editedWithin: filters.editedWithin, limit: 24 })}`),
    enabled: wantDesigns,
  });
  const templates = useQuery({
    queryKey: ['templates', 'search', query, filters],
    queryFn: () =>
      api.list<TemplateSummary>(
        `/templates${qs({ q: query, designType: filters.designType, category: filters.category, owner: filters.owner === 'others' ? 'others' : undefined, limit: 24 })}`,
      ),
    enabled: wantTemplates,
  });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <p className="text-csmju-body text-ink">ผลการค้นหา{query && ` “${query}”`}</p>
        <button type="button" onClick={onClear} className="min-h-11 px-2 text-csmju-caption font-semibold text-primary hover:underline">
          ล้างการค้นหา
        </button>
      </div>
      {wantDesigns && (
        <Section title="ดีไซน์ของคุณ">
          {designs.isLoading ? (
            <CardGridSkeleton count={6} />
          ) : designs.isError ? (
            <ErrorState message={errorMessage(designs.error)} onRetry={() => void designs.refetch()} />
          ) : designs.data!.items.length === 0 ? (
            <EmptyState title="ไม่พบดีไซน์ที่ตรงกับการค้นหา" />
          ) : (
            <ul className={gridClass}>
              {designs.data!.items.map((design) => (
                <li key={design.id}>
                  <DesignCard design={design} href={`/design/${design.id}`} menu={<DesignMenu design={design} />} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {wantTemplates && (
        <Section title="เทมเพลต">
          {templates.isLoading ? (
            <CardGridSkeleton count={6} />
          ) : templates.isError ? (
            <ErrorState message={errorMessage(templates.error)} onRetry={() => void templates.refetch()} />
          ) : templates.data!.items.length === 0 ? (
            <EmptyState title="ไม่พบเทมเพลตที่ตรงกับการค้นหา" />
          ) : (
            <ul className={gridClass}>
              {templates.data!.items.map((template) => (
                <li key={template.id}>
                  <TemplateCard template={template} onUse={() => create.mutate({ title: template.title, templateId: template.id }, { onError: (e) => toast(errorMessage(e), 'error') })} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

