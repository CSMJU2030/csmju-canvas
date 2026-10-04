'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, CalendarDays, GraduationCap, Megaphone, Share2, Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Pager, SelectBox } from '@/components/csmju/list-controls';
import { Button, CardGridSkeleton, EmptyState, ErrorState, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { TemplateCard } from '@/components/designs/cards';
import { Carousel } from '@/components/designs/carousel';
import { TypeArt } from '@/components/designs/type-art';
import { api, qs } from '@/lib/csmju/api';
import { useCreateDesign } from '@/lib/create-design';
import { BROWSE_TILES, DESIGN_TYPES, designType, designTypeLabel } from '@/lib/design-types';
import type { DesignTypeUsage, TemplateSummary } from '@/lib/types';

/// ชิปหมวดใต้ช่องค้นหาของแท็บเทมเพลต (ภาพบรีฟ: โซเชียลมีเดีย · ธุรกิจ · วิดีโอ · การศึกษา)
/// ใช้หมวดจริงของระบบนี้ — กดซ้ำเพื่อยกเลิก
const CHIPS: { key: string; label: string; icon: ReactNode }[] = [
  { key: 'social', label: 'โซเชียลมีเดีย', icon: <Share2 aria-hidden className="size-4 text-type-red" /> },
  { key: 'career', label: 'งานและอาชีพ', icon: <BriefcaseBusiness aria-hidden className="size-4 text-type-teal" /> },
  { key: 'event', label: 'กิจกรรม', icon: <CalendarDays aria-hidden className="size-4 text-type-pink" /> },
  { key: 'announcement', label: 'ประกาศ', icon: <Megaphone aria-hidden className="size-4 text-type-orange" /> },
  { key: 'education', label: 'การศึกษา', icon: <GraduationCap aria-hidden className="size-4 text-type-purple" /> },
];

export function CategoryChips({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {CHIPS.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={value === chip.key}
          onClick={() => onChange(value === chip.key ? '' : chip.key)}
          className={cx(
            'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-csmju-caption font-medium transition-colors',
            value === chip.key ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface/70 text-ink hover:bg-surface',
          )}
        >
          {chip.icon}
          {chip.label}
        </button>
      ))}
    </div>
  );
}

const PAGE_SIZE = 24;

export function TemplatesTab({
  query,
  category,
  initialType = '',
  starred = false,
  builtIn = false,
  mine = false,
}: {
  query: string;
  category: string;
  initialType?: string;
  starred?: boolean;
  builtIn?: boolean;
  mine?: boolean;
}) {
  const [type, setType] = useState(initialType);
  const scope = starred ? 'starred' : builtIn ? 'builtIn' : mine ? 'mine' : null;
  const filtering = query !== '' || category !== '' || type !== '' || scope !== null;

  return filtering ? (
    <Results query={query} category={category} type={type} onType={setType} scope={scope} />
  ) : (
    <>
      <Explore onPick={setType} />
      <LikeYourDesigns />
      <AllTemplates />
    </>
  );
}

function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-csmju-h2 font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

/// "สำรวจเทมเพลต": ไทล์พาสเทลสองแถว กดแล้วกรองตามประเภทในหน้านี้
function Explore({ onPick }: { onPick: (designType: string) => void }) {
  return (
    <section>
      <Heading>สำรวจเทมเพลต</Heading>
      <Carousel label="ประเภทเทมเพลต">
        {chunk(BROWSE_TILES, 2).map((pair) => (
          <li key={pair[0].designType} className="flex w-56 shrink-0 snap-start flex-col gap-3">
            {pair.map((tile) => (
              <button
                key={tile.designType}
                type="button"
                onClick={() => onPick(tile.designType)}
                className={cx('relative flex h-20 items-center overflow-hidden rounded-xl px-4 text-left text-csmju-caption font-medium text-ink transition-shadow hover:shadow-csmju-md', tile.tone)}
              >
                <span className="relative z-10 max-w-24 leading-snug">{tile.label}</span>
                <TypeArt type={designType(tile.designType)!} className="absolute -right-2 -bottom-3 h-24 w-32 -rotate-6" />
              </button>
            ))}
          </li>
        ))}
      </Carousel>
    </section>
  );
}

function useUse() {
  const create = useCreateDesign();
  const toast = useToast();

  return (template: TemplateSummary) =>
    create.mutate({ title: template.title, templateId: template.id }, { onError: (e) => toast(errorMessage(e), 'error') });
}

/// "แนวเดียวกับดีไซน์ของคุณ": เทมเพลตของประเภทที่ผู้ใช้สร้างบ่อยที่สุด (สถิติจริง)
function LikeYourDesigns() {
  const use = useUse();
  const usage = useQuery({
    queryKey: ['design-type-usages'],
    queryFn: () => api.list<DesignTypeUsage>(`/design-type-usages${qs({ limit: 12 })}`),
  });
  const types = (usage.data?.items ?? []).map((u) => u.designType).slice(0, 3);
  const query = useQuery({
    queryKey: ['templates', 'like-yours', types.join(',')],
    queryFn: async () => {
      const lists = await Promise.all(types.map((t) => api.list<TemplateSummary>(`/templates${qs({ designType: t, limit: 8 })}`)));

      return lists.flatMap((l) => l.items);
    },
    enabled: types.length > 0,
  });

  if (!query.data || query.data.length === 0) return null;

  return (
    <section>
      <Heading>แนวเดียวกับดีไซน์ของคุณ</Heading>
      <Carousel label="เทมเพลตแนวเดียวกับดีไซน์ของคุณ">
        {query.data.map((template) => (
          <li key={template.id} className="w-80 shrink-0 snap-start md:w-96">
            <TemplateCard size="lg" template={template} onUse={() => use(template)} />
          </li>
        ))}
      </Carousel>
    </section>
  );
}

function AllTemplates() {
  const use = useUse();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['templates', 'all', page],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ sort: 'popular', page, limit: PAGE_SIZE })}`),
  });

  return (
    <section>
      <Heading>เทมเพลตทั้งหมด</Heading>
      {query.isLoading ? (
        <CardGridSkeleton count={10} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data!.items.length === 0 ? (
        <EmptyState title="ยังไม่มีเทมเพลต" description="อาจารย์และบุคลากรเผยแพร่เทมเพลตได้จากหน้าแก้ไข" />
      ) : (
        <>
          <TemplateGrid templates={query.data!.items} onUse={use} />
          <Pager page={page} totalPages={query.data!.meta.totalPages} onPage={setPage} />
        </>
      )}
    </section>
  );
}

const SCOPE_TITLE = { starred: 'คอนเทนต์ติดดาว', builtIn: 'เทมเพลตตั้งต้นของทีม CS Canvas', mine: 'เทมเพลตที่ฉันเผยแพร่' } as const;

function Results({
  query,
  category,
  type,
  onType,
  scope,
}: {
  query: string;
  category: string;
  type: string;
  onType: (t: string) => void;
  scope: keyof typeof SCOPE_TITLE | null;
}) {
  const use = useUse();
  const [owner, setOwner] = useState<'' | 'me' | 'others'>(scope === 'mine' ? 'me' : '');
  const [sort, setSort] = useState<'popular' | 'recent'>('popular');
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ['templates', 'results', query, category, type, owner, sort, page, scope],
    queryFn: () =>
      api.list<TemplateSummary>(
        `/templates${qs({
          q: query,
          category,
          designType: type,
          owner: owner || undefined,
          starred: scope === 'starred' ? true : undefined,
          builtIn: scope === 'builtIn' ? true : undefined,
          sort,
          page,
          limit: PAGE_SIZE,
        })}`,
      ),
  });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-csmju-h2 font-bold text-ink">
          {query ? `ผลการค้นหา “${query}”` : scope ? SCOPE_TITLE[scope] : type ? designTypeLabel(type) : 'เทมเพลต'}
          {result.data && <span className="ml-2 text-csmju-body font-normal text-muted">{result.data.meta.total.toLocaleString('th-TH')} แบบ</span>}
        </h2>
        {type && (
          <button type="button" onClick={() => onType('')} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary-soft px-3 text-csmju-caption font-medium text-primary">
            {designTypeLabel(type)} <X aria-hidden className="size-4" />
            <span className="sr-only">ยกเลิกตัวกรองประเภท</span>
          </button>
        )}
        <div className="w-48">
          <SelectBox label="ประเภท" value={type} onChange={(v) => { onType(v); setPage(1); }} options={[['', 'ทุกประเภท'], ...DESIGN_TYPES.map((t) => [t.key, t.label] as [string, string])]} />
        </div>
        <div className="w-40">
          <SelectBox label="เจ้าของ" value={owner} onChange={(v) => { setOwner(v as typeof owner); setPage(1); }} options={[['', 'ทุกคน'], ['me', 'ที่ฉันเผยแพร่'], ['others', 'ของคนอื่น']]} />
        </div>
        <div className="w-36">
          <SelectBox label="เรียงตาม" value={sort} onChange={(v) => { setSort(v as typeof sort); setPage(1); }} options={[['popular', 'ยอดนิยม'], ['recent', 'ล่าสุด']]} />
        </div>
      </div>
      {result.isLoading ? (
        <CardGridSkeleton count={10} />
      ) : result.isError ? (
        <ErrorState message={errorMessage(result.error)} onRetry={() => void result.refetch()} />
      ) : result.data!.items.length === 0 ? (
        <EmptyState
          title={scope === 'starred' ? 'ยังไม่มีเทมเพลตที่ติดดาว' : 'ไม่พบเทมเพลต'}
          description={scope === 'starred' ? 'กดรูปดาวบนการ์ดเทมเพลตเพื่อเก็บไว้ดูที่นี่' : 'ลองคำอื่น หรือยกเลิกตัวกรองบางตัว'}
        />
      ) : (
        <>
          <TemplateGrid templates={result.data!.items} onUse={use} />
          <Pager page={page} totalPages={result.data!.meta.totalPages} onPage={setPage} />
        </>
      )}
    </section>
  );
}

/// ตารางเทมเพลต — เทมเพลตของตัวเองมีปุ่มเลิกเผยแพร่
function TemplateGrid({ templates, onUse }: { templates: TemplateSummary[]; onUse: (t: TemplateSummary) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/templates/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast('เลิกเผยแพร่เทมเพลตแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {templates.map((template) => (
        <li key={template.id}>
          <TemplateCard
            template={template}
            onUse={() => onUse(template)}
            footer={
              template.isMine && (
                <Button
                  variant="ghost"
                  className="mt-1 w-full text-danger"
                  loading={remove.isPending && remove.variables === template.id}
                  onClick={() => {
                    if (window.confirm(`เลิกเผยแพร่เทมเพลต “${template.title}”? งานที่คนอื่นสร้างไปแล้วยังอยู่`)) remove.mutate(template.id);
                  }}
                >
                  <Trash2 aria-hidden className="size-4" /> เลิกเผยแพร่
                </Button>
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
