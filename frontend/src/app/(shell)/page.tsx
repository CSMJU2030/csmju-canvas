'use client';

import { useQuery } from '@tanstack/react-query';
import { CloudUpload, Ellipsis, HardDrive, House, LayoutTemplate, Ruler, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { EmptyState, ErrorState, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { DesignCard, TemplateCard } from '@/components/designs/cards';
import { DesignMenu } from '@/components/designs/design-menu';
import { EMPTY_FILTERS, FilterBar, type SearchFilters } from '@/components/home/search-filters';
import { TypeGrid, useOpenCreate } from '@/components/shell/create-dialog';
import { api, qs } from '@/lib/csmju/api';
import { useCreateDesign } from '@/lib/create-design';
import { DESIGN_GROUPS, DESIGN_TYPES, type DesignType } from '@/lib/design-types';
import { formatBytes } from '@/lib/format';
import type { DesignSummary, DesignTypeUsage, Quota, TemplateSummary } from '@/lib/types';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const searching = query.trim() !== '' || JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div>
      <section className="csmju-hero relative rounded-none px-4 pt-12 pb-8 md:rounded-t-3xl md:px-8">
        <QuotaChip />
        <h1 className="text-center text-csmju-h1 font-bold text-primary md:text-csmju-display">วันนี้คุณจะดีไซน์อะไร?</h1>

        <div className="mt-5 flex justify-center gap-2" role="tablist" aria-label="มุมมอง">
          <span role="tab" aria-selected className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary bg-primary-soft px-4 text-csmju-caption font-semibold text-primary">
            <House aria-hidden className="size-4" /> หน้าหลัก
          </span>
          <Link role="tab" aria-selected={false} href="/templates" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-csmju-caption text-ink hover:bg-surface-muted">
            <LayoutTemplate aria-hidden className="size-4" /> เทมเพลต
          </Link>
        </div>

        <form className="mx-auto mt-5 max-w-2xl" role="search" onSubmit={(event) => event.preventDefault()}>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
            <label htmlFor="home-search" className="sr-only">
              ค้นหางานและเทมเพลต
            </label>
            <input
              id="home-search"
              type="search"
              value={query}
              onFocus={() => setShowFilters(true)}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหางานของคุณและเทมเพลต"
              className={cx(inputClass, 'min-h-14 rounded-2xl pl-12 shadow-csmju-sm')}
            />
          </div>
        </form>
        {(showFilters || searching) && (
          <div className="mt-3">
            <FilterBar value={filters} onChange={setFilters} />
          </div>
        )}

        <TypeShortcuts />
      </section>

      <div className="flex flex-col gap-10 px-4 py-8 md:px-8">
        {searching ? (
          <SearchResults query={query.trim()} filters={filters} onClear={() => { setQuery(''); setFilters(EMPTY_FILTERS); }} />
        ) : (
          <>
            <RecentDesigns />
            <FrequentTypes />
            <PopularTemplates />
            <TemplatesForYou />
          </>
        )}
      </div>
    </div>
  );
}

/// แทนแบนเนอร์ "ทดลองใช้ฟรี 30 วัน" ในบรีฟ — ระบบนี้ไม่มีการจ่ายเงิน จึงแสดงพื้นที่ใช้งานคงเหลือ
function QuotaChip() {
  const { data } = useQuery({ queryKey: ['quotas'], queryFn: () => api.get<Quota>('/quotas') });

  if (!data) return null;

  const percent = Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100));

  return (
    <Link
      href="/account/storage"
      className="absolute top-4 right-4 hidden min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-csmju-caption text-ink shadow-csmju-sm hover:bg-surface-muted sm:inline-flex"
    >
      <HardDrive aria-hidden className="size-4 text-primary" />
      พื้นที่ใช้ไป {formatBytes(data.usedBytes)} จาก {formatBytes(data.quotaBytes)} ({percent}%)
    </Link>
  );
}

function TypeShortcuts() {
  const openCreate = useOpenCreate();
  const router = useRouter();
  const shortcuts: { label: string; icon: ReactNode; tone: string; onClick: () => void }[] = [
    { label: 'เทมเพลต', icon: <LayoutTemplate aria-hidden className="size-6" />, tone: 'bg-chart-4', onClick: () => router.push('/templates') },
    ...DESIGN_GROUPS.filter((g) => g.available).map((g) => ({
      label: g.label,
      icon: <g.icon aria-hidden className="size-6" />,
      tone: g.tone,
      onClick: () => openCreate(g.key),
    })),
    { label: 'กำหนดขนาดเอง', icon: <Ruler aria-hidden className="size-6" />, tone: 'bg-chart-6', onClick: () => openCreate('custom') },
    { label: 'อัปโหลด', icon: <CloudUpload aria-hidden className="size-6" />, tone: 'bg-chart-2', onClick: () => openCreate('upload') },
    { label: 'เพิ่มเติม', icon: <Ellipsis aria-hidden className="size-6" />, tone: 'bg-chart-6', onClick: () => openCreate('for-you') },
  ];

  return (
    <ul className="mx-auto mt-8 flex max-w-5xl gap-4 overflow-x-auto pb-2 md:flex-wrap md:justify-center">
      {shortcuts.map((s) => (
        <li key={s.label}>
          <button type="button" onClick={s.onClick} className="flex w-20 flex-col items-center gap-2 rounded-xl p-1 text-csmju-caption text-ink hover:bg-surface/70">
            <span className={cx('flex size-12 items-center justify-center rounded-full text-on-inverse', s.tone)}>{s.icon}</span>
            <span className="text-center leading-tight">{s.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-csmju-h2 font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const gridClass = 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

function RecentDesigns() {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? 20 : 10;
  const query = useQuery({
    queryKey: ['designs', 'recent', limit],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ limit, sort: 'updated' })}`),
  });
  const openCreate = useOpenCreate();

  return (
    <Section
      title="ดีไซน์ต่อ"
      action={
        (query.data?.meta.total ?? 0) > 10 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="min-h-11 px-2 text-csmju-caption font-medium text-primary hover:underline">
            {expanded ? 'แสดงน้อยลง' : 'แสดงเพิ่มเติม'}
          </button>
        )
      }
    >
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data!.items.length === 0 ? (
        <EmptyState
          title="ยังไม่มีงาน"
          description="งานที่คุณสร้างจะขึ้นที่นี่ เพื่อกลับมาแก้ต่อได้ทันที"
          action={
            <button type="button" onClick={() => openCreate()} className="min-h-11 rounded-xl bg-primary px-4 text-csmju-caption font-medium text-on-inverse hover:bg-primary-hover">
              สร้างงานแรก
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
          {expanded && (
            <Link href="/projects" className="mt-3 inline-flex min-h-11 items-center text-csmju-caption font-medium text-primary hover:underline">
              ดูงานทั้งหมดในโปรเจกต์
            </Link>
          )}
        </>
      )}
    </Section>
  );
}

function FrequentTypes() {
  const usage = useQuery({
    queryKey: ['design-type-usages'],
    queryFn: () => api.list<DesignTypeUsage>(`/design-type-usages${qs({ limit: 8 })}`),
  });
  const create = useCreateDesign();
  const toast = useToast();
  const types = (usage.data?.items ?? [])
    .map((u) => DESIGN_TYPES.find((t) => t.key === u.designType))
    .filter((t): t is DesignType => Boolean(t));

  if (usage.isLoading || types.length === 0) return null;

  return (
    <Section title="ใช้บ่อย">
      <p className="-mt-2 mb-3 text-csmju-caption text-muted">นับจากงานที่คุณสร้างจริง</p>
      <TypeGrid
        types={types.slice(0, 4)}
        busy={create.isPending}
        onPick={(type) =>
          create.mutate(
            { title: 'ดีไซน์ที่ไม่มีชื่อ', designType: type.key, width: type.width, height: type.height },
            { onError: (error) => toast(errorMessage(error), 'error') },
          )
        }
      />
    </Section>
  );
}

function TemplateGrid({ templates }: { templates: TemplateSummary[] }) {
  const create = useCreateDesign();
  const toast = useToast();

  return (
    <ul className={gridClass}>
      {templates.map((template) => (
        <li key={template.id}>
          <TemplateCard
            template={template}
            onUse={() =>
              create.mutate({ title: template.title, templateId: template.id }, { onError: (error) => toast(errorMessage(error), 'error') })
            }
          />
        </li>
      ))}
    </ul>
  );
}

function PopularTemplates() {
  const query = useQuery({
    queryKey: ['templates', 'popular'],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ sort: 'popular', limit: 5 })}`),
  });

  return (
    <Section
      title="ยอดนิยม / แนะนำ"
      action={<Link href="/templates" className="min-h-11 px-2 text-csmju-caption font-medium text-primary hover:underline">ดูทั้งหมด</Link>}
    >
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data!.items.length === 0 ? (
        <EmptyState title="ยังไม่มีเทมเพลต" description="เทมเพลตที่ทีมและอาจารย์เผยแพร่จะขึ้นที่นี่" />
      ) : (
        <TemplateGrid templates={query.data!.items} />
      )}
    </Section>
  );
}

/// เทมเพลตของประเภทที่ผู้ใช้สร้างบ่อยที่สุด · ยังไม่มีสถิติ = เทมเพลตใหม่ล่าสุด
function TemplatesForYou() {
  const usage = useQuery({
    queryKey: ['design-type-usages'],
    queryFn: () => api.list<DesignTypeUsage>(`/design-type-usages${qs({ limit: 8 })}`),
  });
  const topType = usage.data?.items[0]?.designType;
  const query = useQuery({
    queryKey: ['templates', 'for-you', topType ?? 'recent'],
    queryFn: async () => {
      const typed = topType
        ? await api.list<TemplateSummary>(`/templates${qs({ designType: topType, limit: 5 })}`)
        : null;

      return typed && typed.items.length > 0
        ? typed
        : api.list<TemplateSummary>(`/templates${qs({ sort: 'recent', limit: 5 })}`);
    },
    enabled: !usage.isLoading,
  });

  if (!query.data || query.data.items.length === 0) return null;

  return (
    <Section title="เทมเพลตสำหรับคุณ">
      <TemplateGrid templates={query.data.items} />
    </Section>
  );
}

function SearchResults({ query, filters, onClear }: { query: string; filters: SearchFilters; onClear: () => void }) {
  const wantDesigns = filters.owner !== 'others';
  const wantTemplates = filters.owner !== 'me';
  const designs = useQuery({
    queryKey: ['designs', 'search', query, filters],
    queryFn: () =>
      api.list<DesignSummary>(
        `/designs${qs({ q: query, designType: filters.designType, editedWithin: filters.editedWithin, limit: 20 })}`,
      ),
    enabled: wantDesigns,
  });
  const templates = useQuery({
    queryKey: ['templates', 'search', query, filters],
    queryFn: () =>
      api.list<TemplateSummary>(
        `/templates${qs({
          q: query,
          designType: filters.designType,
          category: filters.category,
          owner: filters.owner === 'others' ? 'others' : undefined,
          limit: 20,
        })}`,
      ),
    enabled: wantTemplates,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <p className="text-csmju-body text-ink">ผลการค้นหา{query && ` “${query}”`}</p>
        <button type="button" onClick={onClear} className="min-h-11 px-2 text-csmju-caption font-medium text-primary hover:underline">
          ล้างการค้นหา
        </button>
      </div>
      {wantDesigns && (
        <Section title="งานของฉัน">
          {designs.isLoading ? (
            <Spinner />
          ) : designs.isError ? (
            <ErrorState message={errorMessage(designs.error)} onRetry={() => void designs.refetch()} />
          ) : designs.data!.items.length === 0 ? (
            <EmptyState title="ไม่พบงานที่ตรงกับการค้นหา" />
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
            <Spinner />
          ) : templates.isError ? (
            <ErrorState message={errorMessage(templates.error)} onRetry={() => void templates.refetch()} />
          ) : templates.data!.items.length === 0 ? (
            <EmptyState title="ไม่พบเทมเพลตที่ตรงกับการค้นหา" />
          ) : (
            <TemplateGrid templates={templates.data!.items} />
          )}
        </Section>
      )}
    </div>
  );
}
