'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Folder as FolderIcon, FolderPlus, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, EmptyState, ErrorState, Menu, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { DesignCard } from '@/components/designs/cards';
import { DesignMenu, RenameDialog } from '@/components/designs/design-menu';
import { useOpenCreate } from '@/components/shell/create-dialog';
import { api, qs } from '@/lib/csmju/api';
import { DESIGN_TYPES } from '@/lib/design-types';
import type { DesignSummary, Folder } from '@/lib/types';
import { Pager, SelectBox } from '@/components/csmju/list-controls';

const PAGE_SIZE = 20;

export default function ProjectsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Projects />
    </Suspense>
  );
}

function Projects() {
  const params = useSearchParams();
  const router = useRouter();
  const folderId = params.get('folder');
  const setFolderId = (id: string | null) => router.replace(id ? `/projects?folder=${id}` : '/projects');
  const [q, setQ] = useState('');
  const [designType, setDesignType] = useState('');
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'rename'; folder: Folder } | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const openCreate = useOpenCreate();

  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.list<Folder>('/folders?limit=100') });
  const designs = useQuery({
    queryKey: ['designs', 'projects', folderId, q.trim(), designType, sort, page],
    queryFn: () =>
      api.list<DesignSummary>(
        `/designs${qs({ folderId: folderId ?? undefined, q: q.trim(), designType, sort, page, limit: PAGE_SIZE })}`,
      ),
  });

  const saveFolder = useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }) =>
      id ? api.patch<Folder>(`/folders/${id}`, { name }) : api.post<Folder>('/folders', { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      setDialog(null);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const deleteFolder = useMutation({
    mutationFn: (id: string) => api.del(`/folders/${id}`),
    onSuccess: (_data, id) => {
      if (folderId === id) setFolderId(null);
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
      toast('ลบโฟลเดอร์แล้ว งานข้างในยังอยู่');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const activeFolder = folders.data?.items.find((f) => f.id === folderId);

  return (
    <div className="px-4 py-8 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-csmju-h1 font-bold text-ink">โปรเจกต์</h1>
        <div className="flex gap-2">
          <Button onClick={() => setDialog({ kind: 'new' })}>
            <FolderPlus aria-hidden className="size-4" /> โฟลเดอร์ใหม่
          </Button>
          <Button variant="primary" onClick={() => openCreate()}>สร้างดีไซน์</Button>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-csmju-h3 font-semibold text-ink">โฟลเดอร์</h2>
        {folders.isLoading ? (
          <Spinner />
        ) : folders.isError ? (
          <ErrorState message={errorMessage(folders.error)} onRetry={() => void folders.refetch()} />
        ) : (
          <ul className="flex flex-wrap gap-2">
            <li>
              <FolderChip label="งานทั้งหมด" active={folderId === null} onClick={() => { setFolderId(null); setPage(1); }} />
            </li>
            {folders.data!.items.map((folder) => (
              <li key={folder.id} className="flex items-center gap-1">
                <FolderChip
                  label={`${folder.name} (${folder.designCount})`}
                  active={folderId === folder.id}
                  onClick={() => { setFolderId(folder.id); setPage(1); }}
                />
                <Menu
                  label={`ตัวเลือกของโฟลเดอร์ ${folder.name}`}
                  trigger={<Ellipsis aria-hidden className="size-4" />}
                  triggerClassName="size-11 shadow-none"
                  items={[
                    { label: 'เปลี่ยนชื่อ', onSelect: () => setDialog({ kind: 'rename', folder }) },
                    {
                      label: 'ลบโฟลเดอร์',
                      danger: true,
                      onSelect: () => {
                        if (window.confirm(`ลบโฟลเดอร์ “${folder.name}”? งานข้างในจะไม่ถูกลบ`)) deleteFolder.mutate(folder.id);
                      },
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-csmju-h3 font-semibold text-ink">{activeFolder ? activeFolder.name : 'งานทั้งหมด'}</h2>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <label htmlFor="proj-q" className="sr-only">ค้นหางาน</label>
            <input id="proj-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="ค้นหาจากชื่องาน" className={cx(inputClass, 'pl-10')} />
          </div>
          <SelectBox label="ประเภท" value={designType} onChange={(v) => { setDesignType(v); setPage(1); }} options={[['', 'ทุกประเภท'], ...DESIGN_TYPES.map((t) => [t.key, t.label] as [string, string])]} />
          <SelectBox label="เรียงตาม" value={sort} onChange={(v) => setSort(v as typeof sort)} options={[['updated', 'แก้ไขล่าสุด'], ['created', 'สร้างล่าสุด'], ['title', 'ชื่อ (ก–ฮ)']]} />
        </div>
        {designs.isLoading ? (
          <Spinner />
        ) : designs.isError ? (
          <ErrorState message={errorMessage(designs.error)} onRetry={() => void designs.refetch()} />
        ) : designs.data!.items.length === 0 ? (
          <EmptyState
            title={activeFolder ? 'โฟลเดอร์นี้ยังว่าง' : 'ยังไม่มีงาน'}
            description={activeFolder ? 'ใช้เมนู “…” บนการ์ดงานแล้วเลือก “ย้ายไปโฟลเดอร์”' : 'เริ่มสร้างงานแรกของคุณ'}
            icon={<FolderIcon aria-hidden className="size-8" />}
          />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {designs.data!.items.map((design) => (
                <li key={design.id}>
                  <DesignCard design={design} href={`/design/${design.id}`} menu={<DesignMenu design={design} />} />
                </li>
              ))}
            </ul>
            <Pager page={page} totalPages={designs.data!.meta.totalPages} onPage={setPage} />
          </>
        )}
      </section>

      {dialog?.kind === 'new' && (
        <RenameDialog title="โฟลเดอร์ใหม่" initial="" busy={saveFolder.isPending} onClose={() => setDialog(null)} onSave={(name) => saveFolder.mutate({ name })} />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          title="เปลี่ยนชื่อโฟลเดอร์"
          initial={dialog.folder.name}
          busy={saveFolder.isPending}
          onClose={() => setDialog(null)}
          onSave={(name) => saveFolder.mutate({ id: dialog.folder.id, name })}
        />
      )}
    </div>
  );
}

function FolderChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-csmju-caption',
        active ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
      )}
    >
      <FolderIcon aria-hidden className="size-4" />
      {label}
    </button>
  );
}
