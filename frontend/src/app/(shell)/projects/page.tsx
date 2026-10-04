'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp, ChevronDown, ChevronLeft, CloudUpload, Ellipsis, Folder as FolderIcon, FolderPlus, LayoutGrid, Link2,
  List, Lock, Plus, Search,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { Pager } from '@/components/csmju/list-controls';
import { CardGridSkeleton, EmptyState, ErrorState, Menu, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { DesignCard, Thumbnail } from '@/components/designs/cards';
import { Carousel } from '@/components/designs/carousel';
import { DesignMenu, RenameDialog } from '@/components/designs/design-menu';
import { EDITED_OPTIONS, FilterPopover } from '@/components/home/search-filters';
import { UploadsView } from '@/components/projects/uploads-view';
import { useOpenCreate } from '@/components/shell/create-dialog';
import { api, qs } from '@/lib/csmju/api';
import { DESIGN_GROUPS, DESIGN_TYPES, designTypeLabel } from '@/lib/design-types';
import { formatBytes, relativeTime } from '@/lib/format';
import type { DesignSummary, Folder, Quota } from '@/lib/types';
import { useIsMobile } from '@/lib/use-media';

const PAGE_SIZE = 30;

type Sort = 'updated' | 'created' | 'title';

const SORT_LABEL: Record<Sort, string> = {
  updated: 'แก้ไขล่าสุด',
  created: 'สร้างล่าสุด',
  title: 'ชื่อ (ก–ฮ)',
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Projects />
    </Suspense>
  );
}

/// หน้าโปรเจกต์แบบ Canva: หัวไล่สี + ค้นหา + ตัวกรอง · แถบเครื่องมือ (เรียง · มุมมอง · สร้าง)
/// · แถว "ล่าสุด" · ส่วน "โฟลเดอร์" และ "ดีไซน์" ที่พับได้
///
/// มุมมองย่อยอยู่ใน URL: ?folder=<id> · ?view=uploads (โฟลเดอร์อัปโหลด) · ?view=recent
function Projects() {
  const params = useSearchParams();
  const folderId = params.get('folder');
  const view = params.get('view');
  const [q, setQ] = useState('');
  const [designType, setDesignType] = useState('');
  const [group, setGroup] = useState('');
  const [editedWithin, setEditedWithin] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const isMobile = useIsMobile();
  // มือถือเริ่มเป็นรายการแบบแถว (ภาพบรีฟ "Design ของคุณ") · จอใหญ่เริ่มเป็นตาราง
  const [layoutChoice, setLayout] = useState<'grid' | 'list' | null>(null);
  const layout = layoutChoice ?? (isMobile ? 'list' : 'grid');
  const [newFolder, setNewFolder] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.list<Folder>('/folders?limit=100') });
  const activeFolder = folders.data?.items.find((f) => f.id === folderId);
  const filtering = q.trim() !== '' || designType !== '' || group !== '' || editedWithin !== '';

  const createFolder = useMutation({
    mutationFn: (name: string) => api.post<Folder>('/folders', { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      setNewFolder(false);
      toast('สร้างโฟลเดอร์แล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const title = view === 'uploads' ? 'อัปโหลด' : view === 'recent' ? 'ล่าสุด' : activeFolder ? activeFolder.name : 'โปรเจกต์ทั้งหมด';
  const groupTypes = group ? DESIGN_TYPES.filter((t) => t.group === group).map((t) => t.key).join(',') : '';
  const listKey = `${folderId}|${view}|${q.trim()}|${designType}|${groupTypes}|${editedWithin}|${sort}`;

  if (view === 'uploads') return <UploadsView focusAssetId={params.get('asset')} />;

  return (
    <div>
      <section className="csmju-hero relative px-4 pt-6 pb-5 text-left md:px-10 md:pt-14 md:pb-6 md:text-center">
        <QuotaChip />
        {isMobile && (
          <div className="flex items-center justify-between">
            <ViewMenu title={title} folders={folders.data?.items ?? []} />
            <MobileCreateMenu onNewFolder={() => setNewFolder(true)} />
          </div>
        )}
        {(folderId || view) && !isMobile && (
          <Link href="/projects" className="absolute top-5 left-5 inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-csmju-caption font-semibold text-ink hover:bg-surface/60">
            <ChevronLeft aria-hidden className="size-5" /> โปรเจกต์ทั้งหมด
          </Link>
        )}
        {!isMobile && <h1 className="text-csmju-h1 font-bold text-ink md:text-csmju-display">{title}</h1>}
        {view !== 'uploads' && (
          <>
            <form role="search" onSubmit={(e) => e.preventDefault()} className="mx-auto mt-5 max-w-2xl md:mt-6">
              <div className="csmju-search relative rounded-2xl">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-ink" />
                <label htmlFor="proj-q" className="sr-only">ค้นหาดีไซน์และโฟลเดอร์</label>
                <input
                  id="proj-q"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นหาดีไซน์ โฟลเดอร์ และไฟล์อัปโหลดต่างๆ"
                  className="min-h-14 w-full rounded-2xl bg-transparent pr-4 pl-14 text-csmju-body text-ink placeholder:text-muted focus:outline-none"
                />
              </div>
            </form>
            <div className="csmju-scroll-x -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0">
              <FilterPopover
                label="ประเภท"
                current={designType}
                options={[{ value: '', label: 'ทุกประเภท' }, ...DESIGN_TYPES.map((t) => ({ value: t.key, label: t.label }))]}
                onPick={(v) => { setDesignType(v); setGroup(''); }}
              />
              <FilterPopover
                label="หมวดหมู่"
                current={group}
                options={[{ value: '', label: 'ทุกหมวด' }, ...DESIGN_GROUPS.filter((g) => g.available).map((g) => ({ value: g.key, label: g.label }))]}
                onPick={(v) => { setGroup(v); setDesignType(''); }}
              />
              <FilterPopover label="วันที่แก้ไข" current={editedWithin} options={EDITED_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} onPick={setEditedWithin} />
            </div>
          </>
        )}
      </section>

      <div className="px-4 pb-12 md:px-10">
        {(
          <>
            {!isMobile && <Toolbar sort={sort} onSort={setSort} layout={layout} onLayout={setLayout} onNewFolder={() => setNewFolder(true)} />}
            {!filtering && !folderId && view !== 'recent' && !isMobile && <RecentRow />}
            {isMobile && (
              <div className="mt-5 flex items-center justify-between">
                <h2 className="text-csmju-h3 font-bold text-ink">{folderId || view ? 'ดีไซน์' : 'ล่าสุด'}</h2>
                <button
                  type="button"
                  onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
                  aria-label={layout === 'grid' ? 'แสดงเป็นรายการ' : 'แสดงเป็นตาราง'}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-ink"
                >
                  {layout === 'grid' ? <List aria-hidden className="size-6" /> : <LayoutGrid aria-hidden className="size-6" />}
                </button>
              </div>
            )}
            {!filtering && !folderId && view !== 'recent' && !isMobile && (
              <Collapsible title="โฟลเดอร์">
                <FolderGrid folders={folders.data?.items ?? []} loading={folders.isLoading} />
              </Collapsible>
            )}
            {filtering && <FolderMatches folders={folders.data?.items ?? []} query={q.trim()} />}
            {isMobile ? (
              <div className="mt-2">
                <DesignsList
                  key={listKey}
                  folderId={folderId}
                  q={q.trim()}
                  designType={designType}
                  designTypes={groupTypes}
                  editedWithin={editedWithin}
                  sort="updated"
                  layout={layout}
                  mobile
                />
              </div>
            ) : (
              <Collapsible title="ดีไซน์">
                {/* key เปลี่ยนเมื่อตัวกรองเปลี่ยน → กลับไปหน้า 1 โดยไม่ต้องใช้ effect */}
                <DesignsList
                  key={listKey}
                  folderId={folderId}
                  q={q.trim()}
                  designType={designType}
                  designTypes={groupTypes}
                  editedWithin={editedWithin}
                  sort={view === 'recent' ? 'updated' : sort}
                  layout={layout}
                />
              </Collapsible>
            )}
          </>
        )}
      </div>

      {newFolder && (
        <RenameDialog title="โฟลเดอร์ใหม่" initial="" busy={createFolder.isPending} onClose={() => setNewFolder(false)} onSave={(name) => createFolder.mutate(name)} />
      )}
    </div>
  );
}

/// ตรงตำแหน่ง "ทดลองใช้ฟรี 30 วัน" ในภาพบรีฟ — แสดงพื้นที่คงเหลือแทน (ไม่มีระบบจ่ายเงิน)
function QuotaChip() {
  const { data } = useQuery({ queryKey: ['quotas'], queryFn: () => api.get<Quota>('/quotas') });

  if (!data) return null;

  return (
    <Link
      href="/account/storage"
      className="absolute top-5 right-5 hidden min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-csmju-caption font-semibold text-ink shadow-csmju-sm hover:shadow-csmju-md sm:inline-flex"
    >
      <CloudUpload aria-hidden className="size-4 text-chart-5" />
      พื้นที่คงเหลือ {formatBytes(Math.max(0, data.quotaBytes - data.usedBytes))}
    </Link>
  );
}

/// แถบเครื่องมือขวาบน: เรียง (⇅) · สลับตาราง/รายการ · สร้าง (+)
function Toolbar({
  sort,
  onSort,
  layout,
  onLayout,
  onNewFolder,
}: {
  sort: Sort;
  onSort: (s: Sort) => void;
  layout: 'grid' | 'list';
  onLayout: (l: 'grid' | 'list') => void;
  onNewFolder: () => void;
}) {
  const openCreate = useOpenCreate();

  return (
    <div className="flex items-center justify-end gap-2 py-4">
      <Menu
        label={`เรียงตาม: ${SORT_LABEL[sort]}`}
        trigger={<ArrowDownUp aria-hidden className="size-5" />}
        triggerClassName="shadow-none bg-transparent hover:bg-surface-muted"
        items={(Object.keys(SORT_LABEL) as Sort[]).map((key) => ({
          label: `${key === sort ? '✓ ' : ''}${SORT_LABEL[key]}`,
          onSelect: () => onSort(key),
        }))}
      />
      <button
        type="button"
        onClick={() => onLayout(layout === 'grid' ? 'list' : 'grid')}
        aria-label={layout === 'grid' ? 'แสดงเป็นรายการ' : 'แสดงเป็นตาราง'}
        title={layout === 'grid' ? 'แสดงเป็นรายการ' : 'แสดงเป็นตาราง'}
        className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-muted"
      >
        {layout === 'grid' ? <List aria-hidden className="size-5" /> : <LayoutGrid aria-hidden className="size-5" />}
      </button>
      <Menu
        label="สร้างใหม่"
        trigger={<Plus aria-hidden className="size-5" />}
        triggerClassName="rounded-full border border-line-strong shadow-none bg-surface hover:bg-surface-muted"
        items={[
          { label: 'ดีไซน์ใหม่', icon: <Plus aria-hidden className="size-4" />, onSelect: () => openCreate() },
          { label: 'โฟลเดอร์ใหม่', icon: <FolderPlus aria-hidden className="size-4" />, onSelect: onNewFolder },
          { label: 'อัปโหลดรูป', icon: <CloudUpload aria-hidden className="size-4" />, onSelect: () => openCreate('upload') },
        ]}
      />
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="mt-8">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mb-4 flex min-h-11 items-center gap-2 text-csmju-h2 font-bold text-ink">
        <ChevronDown aria-hidden className={cx('size-5 transition-transform', !open && '-rotate-90')} />
        {title}
      </button>
      {open && children}
    </section>
  );
}

function RecentRow() {
  const recent = useQuery({
    queryKey: ['designs', 'projects-recent'],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ limit: 12, sort: 'updated' })}`),
  });

  if (recent.isLoading || (recent.data?.items.length ?? 0) === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-csmju-h2 font-bold text-ink">ล่าสุด</h2>
      <Carousel label="ดีไซน์ล่าสุด">
        {recent.data!.items.map((design) => (
          <li key={design.id} className="w-56 shrink-0 snap-start">
            <DesignCard design={design} href={`/design/${design.id}`} menu={<DesignMenu design={design} />} />
          </li>
        ))}
      </Carousel>
    </section>
  );
}

/// ไทล์โฟลเดอร์สีม่วงแบบ Canva · โฟลเดอร์ "อัปโหลด" (รูปทั้งหมดที่อัปโหลด) อยู่ก่อนเสมอ
function FolderGrid({ folders, loading }: { folders: Folder[]; loading: boolean }) {
  const { data: quota } = useQuery({ queryKey: ['quotas'], queryFn: () => api.get<Quota>('/quotas') });

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <li>
        <FolderTile href="/projects?view=uploads" name="อัปโหลด" detail={quota ? `${quota.assetCount.toLocaleString('th-TH')} รายการ` : ''} icon={<CloudUpload aria-hidden className="size-5" />} />
      </li>
      {loading ? (
        <li className="text-csmju-caption text-muted">กำลังโหลดโฟลเดอร์…</li>
      ) : (
        folders.map((folder) => (
          <li key={folder.id} className="relative">
            <FolderTile href={`/projects?folder=${folder.id}`} name={folder.name} detail={`${folder.designCount.toLocaleString('th-TH')} ดีไซน์`} />
            <div className="absolute top-1/2 right-2 -translate-y-1/2">
              <FolderMenu folder={folder} />
            </div>
          </li>
        ))
      )}
    </ul>
  );
}

function FolderTile({ href, name, detail, icon }: { href: string; name: string; detail: string; icon?: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 rounded-xl py-2 pr-14 pl-2 hover:bg-surface-muted">
      <span className="relative flex h-12 w-14 shrink-0 items-end justify-center">
        <span className="absolute top-0 left-0 h-4 w-7 rounded-t-md bg-primary-soft-hover" />
        <span className="relative flex h-10 w-14 items-center justify-center rounded-md bg-primary-soft-hover text-primary">{icon}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-csmju-caption font-semibold text-ink">{name}</span>
        {detail && <span className="block text-csmju-caption text-muted">{detail}</span>}
      </span>
    </Link>
  );
}

function FolderMenu({ folder }: { folder: Folder }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const rename = useMutation({
    mutationFn: (name: string) => api.patch(`/folders/${folder.id}`, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      setRenaming(false);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/folders/${folder.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
      toast('ลบโฟลเดอร์แล้ว ดีไซน์ข้างในยังอยู่');
      router.replace('/projects');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <>
      <Menu
        label={`ตัวเลือกของโฟลเดอร์ ${folder.name}`}
        trigger={<Ellipsis aria-hidden className="size-5" />}
        triggerClassName="shadow-none bg-transparent hover:bg-surface"
        items={[
          { label: 'เปลี่ยนชื่อ', onSelect: () => setRenaming(true) },
          {
            label: 'ลบโฟลเดอร์',
            danger: true,
            onSelect: () => {
              if (window.confirm(`ลบโฟลเดอร์ “${folder.name}”? ดีไซน์ข้างในจะไม่ถูกลบ`)) remove.mutate();
            },
          },
        ]}
      />
      {renaming && <RenameDialog title="เปลี่ยนชื่อโฟลเดอร์" initial={folder.name} busy={rename.isPending} onClose={() => setRenaming(false)} onSave={(name) => rename.mutate(name)} />}
    </>
  );
}

function FolderMatches({ folders, query }: { folders: Folder[]; query: string }) {
  const matches = query ? folders.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())) : [];

  if (matches.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-csmju-h3 font-bold text-ink">โฟลเดอร์</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {matches.map((folder) => (
          <li key={folder.id}>
            <FolderTile href={`/projects?folder=${folder.id}`} name={folder.name} detail={`${folder.designCount} ดีไซน์`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DesignsList({
  folderId,
  q,
  designType,
  designTypes,
  editedWithin,
  sort,
  layout,
  mobile = false,
}: {
  folderId: string | null;
  q: string;
  designType: string;
  designTypes: string;
  editedWithin: string;
  sort: Sort;
  layout: 'grid' | 'list';
  mobile?: boolean;
}) {
  const [page, setPage] = useState(1);
  const openCreate = useOpenCreate();
  const designs = useQuery({
    queryKey: ['designs', 'projects', folderId, q, designType, designTypes, editedWithin, sort, page],
    queryFn: () =>
      api.list<DesignSummary>(
        `/designs${qs({ folderId: folderId ?? undefined, q, designType, designTypes: designTypes || undefined, editedWithin, sort, page, limit: PAGE_SIZE })}`,
      ),
  });

  if (designs.isLoading) return <CardGridSkeleton />;
  if (designs.isError) return <ErrorState message={errorMessage(designs.error)} onRetry={() => void designs.refetch()} />;
  if (designs.data!.items.length === 0) {
    const searching = Boolean(q || designType || designTypes || editedWithin);

    return (
      <EmptyState
        title={searching ? 'ไม่พบดีไซน์ที่ตรงกับการค้นหา' : folderId ? 'โฟลเดอร์นี้ยังว่าง' : 'ยังไม่มีดีไซน์'}
        description={folderId && !searching ? 'ใช้เมนู “…” บนการ์ดดีไซน์แล้วเลือก “ย้ายไปโฟลเดอร์”' : undefined}
        icon={<FolderIcon aria-hidden className="size-8" />}
        action={
          !folderId && !searching ? (
            <button type="button" onClick={() => openCreate()} className="min-h-11 rounded-xl bg-primary px-5 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
              สร้างดีไซน์
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {layout === 'list' && mobile ? (
        <ul className="flex flex-col">
          {designs.data!.items.map((design) => (
            <li key={design.id} className="flex items-center gap-3 py-3">
              <Link href={`/design/${design.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                <span className="size-16 shrink-0">
                  <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt="" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-csmju-body font-semibold text-ink">{design.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-csmju-caption text-muted">
                    {design.linkAccess === 'NONE' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 text-ink">
                        <Lock aria-hidden className="size-3.5" /> ส่วนตัว
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 text-primary">
                        <Link2 aria-hidden className="size-3.5" /> แชร์ลิงก์
                      </span>
                    )}
                    •<span className="truncate">{designTypeLabel(design.designType).replace(/\s*\(.*\)$/, '')}</span>
                  </span>
                </span>
              </Link>
              <DesignMenu design={design} />
            </li>
          ))}
        </ul>
      ) : layout === 'grid' ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {designs.data!.items.map((design) => (
            <li key={design.id}>
              <DesignCard design={design} href={`/design/${design.id}`} menu={<DesignMenu design={design} />} />
            </li>
          ))}
        </ul>
      ) : (
        <table className="w-full text-left text-csmju-caption">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 font-medium">ชื่อ</th>
              <th scope="col" className="hidden py-2 font-medium md:table-cell">ประเภท</th>
              <th scope="col" className="hidden py-2 font-medium sm:table-cell">แก้ไขล่าสุด</th>
              <th scope="col" className="w-14 py-2"><span className="sr-only">ตัวเลือก</span></th>
            </tr>
          </thead>
          <tbody>
            {designs.data!.items.map((design) => (
              <tr key={design.id} className="border-b border-line hover:bg-surface-muted">
                <td className="py-2">
                  <Link href={`/design/${design.id}`} className="flex items-center gap-3">
                    <span className="w-16 shrink-0">
                      <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt="" />
                    </span>
                    <span className="truncate font-semibold text-ink">{design.title}</span>
                  </Link>
                </td>
                <td className="hidden py-2 text-body md:table-cell">{designTypeLabel(design.designType)}</td>
                <td className="hidden py-2 text-body sm:table-cell">{relativeTime(design.updatedAt)}</td>
                <td className="py-2"><DesignMenu design={design} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager page={page} totalPages={designs.data!.meta.totalPages} onPage={setPage} />
    </>
  );
}

/// "โปรเจกต์ทั้งหมด ⌄" บนมือถือ — เลือกมุมมอง (ทั้งหมด · ล่าสุด · อัปโหลด · ถังขยะ · โฟลเดอร์)
function ViewMenu({ title, folders }: { title: string; folders: Folder[] }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const items = [
    { href: '/projects', label: 'โปรเจกต์ทั้งหมด' },
    { href: '/projects?view=recent', label: 'ล่าสุด' },
    { href: '/projects?view=uploads', label: 'อัปโหลด' },
    ...folders.map((f) => ({ href: `/projects?folder=${f.id}`, label: f.name })),
    { href: '/trash', label: 'ถังขยะ' },
  ];

  return (
    <>
      <button ref={anchorRef} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-11 min-w-0 items-center gap-2 text-csmju-h1 font-bold text-ink">
        <span className="truncate">{title}</span>
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface">
          <ChevronDown aria-hidden className="size-4" />
        </span>
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label="เลือกมุมมอง" className="max-h-popover w-64 overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-csmju-lg">
        {items.map((item) => (
          <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)} className="flex min-h-12 items-center px-4 text-csmju-body text-ink hover:bg-surface-muted">
            {item.label}
          </Link>
        ))}
      </FloatingPanel>
    </>
  );
}

/// ปุ่ม + มุมขวาบนของมือถือ: ดีไซน์ใหม่ · โฟลเดอร์ใหม่ · อัปโหลดรูป
function MobileCreateMenu({ onNewFolder }: { onNewFolder: () => void }) {
  const openCreate = useOpenCreate();

  return (
    <Menu
      label="สร้างใหม่"
      trigger={<Plus aria-hidden className="size-7" />}
      triggerClassName="bg-transparent shadow-none"
      items={[
        { label: 'ดีไซน์ใหม่', icon: <Plus aria-hidden className="size-4" />, onSelect: () => openCreate() },
        { label: 'โฟลเดอร์ใหม่', icon: <FolderPlus aria-hidden className="size-4" />, onSelect: onNewFolder },
        { label: 'อัปโหลดรูป', icon: <CloudUpload aria-hidden className="size-4" />, onSelect: () => openCreate('upload') },
      ]}
    />
  );
}
