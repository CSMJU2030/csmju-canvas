'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, EmptyState, ErrorState, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { TemplateCard } from '@/components/designs/cards';
import { api, qs } from '@/lib/csmju/api';
import { useCreateDesign } from '@/lib/create-design';
import { DESIGN_TYPES, TEMPLATE_CATEGORIES } from '@/lib/design-types';
import type { TemplateSummary } from '@/lib/types';
import { Pager, SelectBox } from '@/components/csmju/list-controls';

export default function TemplatesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <TemplatesBrowser />
    </Suspense>
  );
}

const PAGE_SIZE = 20;

function TemplatesBrowser() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [designType, setDesignType] = useState(params.get('designType') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [owner, setOwner] = useState<'' | 'me' | 'others'>('');
  const [sort, setSort] = useState<'popular' | 'recent'>('popular');
  const [page, setPage] = useState(1);
  const create = useCreateDesign();
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['templates', 'browse', q.trim(), designType, category, owner, sort, page],
    queryFn: () =>
      api.list<TemplateSummary>(
        `/templates${qs({ q: q.trim(), designType, category, owner: owner || undefined, sort, page, limit: PAGE_SIZE })}`,
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/templates/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast('เลิกเผยแพร่เทมเพลตแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="px-4 py-8 md:px-10">
      <h1 className="text-csmju-h1 font-bold text-ink">เทมเพลต</h1>
      <p className="mt-1 text-csmju-body text-muted">กดเทมเพลตเพื่อทำสำเนาเป็นงานของคุณ แก้ได้เต็มที่โดยไม่กระทบต้นฉบับ</p>

      <div className="mt-6 grid gap-3 md:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <label htmlFor="tpl-q" className="sr-only">ค้นหาเทมเพลต</label>
          <input id="tpl-q" type="search" value={q} onChange={(e) => reset(() => setQ(e.target.value))} placeholder="ค้นหาเทมเพลต" className={cx(inputClass, 'pl-10')} />
        </div>
        <SelectBox label="ประเภท" value={designType} onChange={(v) => reset(() => setDesignType(v))} options={[['', 'ทุกประเภท'], ...DESIGN_TYPES.map((t) => [t.key, t.label] as [string, string])]} />
        <SelectBox label="หมวดหมู่" value={category} onChange={(v) => reset(() => setCategory(v))} options={[['', 'ทุกหมวด'], ...TEMPLATE_CATEGORIES.map((c) => [c.key, c.label] as [string, string])]} />
        <SelectBox label="เจ้าของ" value={owner} onChange={(v) => reset(() => setOwner(v as typeof owner))} options={[['', 'ทุกคน'], ['me', 'ที่ฉันเผยแพร่'], ['others', 'ของคนอื่น']]} />
        <SelectBox label="เรียงตาม" value={sort} onChange={(v) => reset(() => setSort(v as typeof sort))} options={[['popular', 'ยอดนิยม'], ['recent', 'ล่าสุด']]} />
      </div>

      <div className="mt-6">
        {query.isLoading ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data!.items.length === 0 ? (
          <EmptyState title="ไม่พบเทมเพลต" description="ลองเปลี่ยนคำค้นหรือตัวกรอง" />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {query.data!.items.map((template) => (
                <li key={template.id}>
                  <TemplateCard
                    template={template}
                    onUse={() => create.mutate({ title: template.title, templateId: template.id }, { onError: (e) => toast(errorMessage(e), 'error') })}
                    footer={
                      template.isMine && (
                        <Button
                          variant="ghost"
                          className="mt-1 w-full text-danger"
                          loading={remove.isPending && remove.variables === template.id}
                          onClick={() => {
                            if (window.confirm(`เลิกเผยแพร่เทมเพลต “${template.title}”? งานที่คนอื่นสร้างจากเทมเพลตนี้ไปแล้วยังอยู่`)) {
                              remove.mutate(template.id);
                            }
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
            <Pager page={page} totalPages={query.data!.meta.totalPages} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
