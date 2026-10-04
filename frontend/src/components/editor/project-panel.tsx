'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, Folder as FolderIcon, Folders, LayoutGrid, Plus, Search, Star, UsersRound } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { Avatar } from '@/components/shell/avatar';
import { useMe } from '@/lib/csmju/session';
import { Button, Dialog, ErrorState, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { Thumbnail } from '@/components/designs/cards';
import { api, qs } from '@/lib/csmju/api';
import { designTypeLabel } from '@/lib/design-types';
import { createImage } from '@/lib/editor/factory';
import { fitTemplate } from '@/lib/editor/fit-template';
import { useEditor } from '@/lib/editor/store';
import { normalizeDocument } from '@/lib/editor/types';
import type { Asset, Design, DesignSummary, Folder, Template, TemplateSummary } from '@/lib/types';

/// แผง "โปรเจกต์" ในหน้าแก้ไข (ภาพบรีฟชุด "พรีเซนเทชั่น โปรเจกต์")
///
/// แท็บ ทั้งหมด · ดีไซน์ · โฟลเดอร์ · รูปภาพ — กดดีไซน์ = ต่อหน้าของงานนั้นท้ายงานนี้ · กดรูป = ใส่รูปลงหน้า

type Tab = 'all' | 'designs' | 'folders' | 'images';
type Scope = 'all' | 'mine' | 'shared';
type View = { kind: 'tabs' } | { kind: 'folder'; folder: Folder } | { kind: 'starred' };

export function ProjectsPanel({ initialView }: { initialView?: 'starred' }) {
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>(initialView === 'starred' ? { kind: 'starred' } : { kind: 'tabs' });
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<Scope>('mine');
  const searchId = useId();
  const term = q.trim();
  // งานที่แชร์มามีแต่ดีไซน์ (โฟลเดอร์และรูปเป็นของเราเท่านั้น)
  const sharedOnly = scope === 'shared';

  if (view.kind === 'starred') return <StarredView onBack={() => setView({ kind: 'tabs' })} />;

  if (view.kind === 'folder') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <BackHeader title={view.folder.name} onBack={() => setView({ kind: 'tabs' })} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <DesignGrid folderId={view.folder.id} q="" scope="mine" emptyText="โฟลเดอร์นี้ยังไม่มีดีไซน์" />
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'designs', label: 'ดีไซน์' },
    { key: 'folders', label: 'โฟลเดอร์' },
    { key: 'images', label: 'รูปภาพ' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-4">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink" />
          <label htmlFor={searchId} className="sr-only">ค้นหาคอนเทนต์ของคุณ</label>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="ค้นหาคอนเทนต์ของคุณ"
            className="min-h-14 w-full rounded-2xl border border-line-strong bg-surface pr-4 pl-12 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <ScopeMenu
          value={scope}
          onChange={(next) => {
            setScope(next);
            if (next === 'shared') setTab('all');
          }}
        />
        <div role="tablist" aria-label="ชนิดคอนเทนต์" className="mt-3 flex">
          {(sharedOnly ? tabs.filter((t) => t.key === 'all' || t.key === 'designs') : tabs).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                'min-h-12 flex-1 border-b-4 text-csmju-body transition-colors',
                tab === t.key ? 'border-primary font-semibold text-ink' : 'border-transparent text-body hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {tab === 'all' && (
          <div className="flex flex-col gap-6">
            <section>
              <SectionHeading title="ดีไซน์" onSeeAll={() => setTab('designs')} />
              <DesignGrid q={term} scope={scope} limit={sharedOnly ? 30 : 4} emptyText={emptyDesigns(scope, term)} />
            </section>
            {!sharedOnly && (
            <>
            <section>
              <SectionHeading title="โฟลเดอร์" />
              <FolderList q={term} onOpen={(folder) => setView({ kind: 'folder', folder })} onStarred={() => setView({ kind: 'starred' })} onCreate={() => setCreating(true)} />
            </section>
            <section>
              <SectionHeading title="รูปภาพ" onSeeAll={() => setTab('images')} />
              <ImageGrid q={term} limit={6} />
            </section>
            </>
            )}
          </div>
        )}
        {tab === 'designs' && <DesignGrid q={term} scope={scope} emptyText={emptyDesigns(scope, term)} />}
        {tab === 'folders' && (
          <FolderList q={term} onOpen={(folder) => setView({ kind: 'folder', folder })} onStarred={() => setView({ kind: 'starred' })} onCreate={() => setCreating(true)} />
        )}
        {tab === 'images' && <ImageGrid q={term} />}
      </div>

      {creating && <CreateFolderDialog endpoint="/folders" queryKey="folders" onClose={() => setCreating(false)} />}
    </div>
  );
}

function emptyDesigns(scope: Scope, term: string): string {
  if (term) return 'ไม่พบดีไซน์ที่ค้นหา';
  if (scope === 'shared') return 'ยังไม่มีงานที่แชร์กับคุณ — งานที่เพื่อนส่งลิงก์มาและคุณเปิดดูแล้วจะแสดงที่นี่';

  return 'ยังไม่มีดีไซน์อื่น';
}

/// "โปรเจกต์ของคุณ ⌄" (ภาพบรีฟ "พรีเซนเทชั่น โปรเจกต์ 1"): ทั้งหมด · ของคุณ · แชร์กับคุณ
function ScopeMenu({ value, onChange }: { value: Scope; onChange: (scope: Scope) => void }) {
  const me = useMe();
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const options: { key: Scope; label: string; icon: ReactNode }[] = [
    { key: 'all', label: 'โปรเจกต์ทั้งหมด', icon: <Folders aria-hidden className="size-6 text-ink" /> },
    { key: 'mine', label: 'โปรเจกต์ของคุณ', icon: <Avatar email={me.email} size="sm" /> },
    { key: 'shared', label: 'แชร์กับคุณ', icon: <UsersRound aria-hidden className="size-6 text-ink" /> },
  ];
  const current = options.find((o) => o.key === value)!;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl border bg-surface px-4 text-left text-csmju-body text-ink',
          open ? 'border-primary' : 'border-line-strong hover:bg-surface-muted',
        )}
      >
        {current.icon}
        <span className="flex-1">{current.label}</span>
        <ChevronDown aria-hidden className={cx('size-5 transition-transform', open && 'rotate-180')} />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label="เลือกขอบเขตโปรเจกต์" className="w-88 rounded-2xl border border-line bg-surface py-2 shadow-csmju-lg">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="menuitemradio"
            aria-checked={value === option.key}
            onClick={() => {
              onChange(option.key);
              setOpen(false);
            }}
            className={cx('flex min-h-12 w-full items-center gap-3 px-4 text-left text-csmju-body text-ink', value === option.key ? 'bg-surface-muted' : 'hover:bg-surface-muted')}
          >
            {option.icon}
            <span className="flex-1">{option.label}</span>
            {value === option.key && <Check aria-hidden className="size-5" />}
          </button>
        ))}
      </FloatingPanel>
    </>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
      <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-muted">
        <ArrowLeft aria-hidden className="size-5" />
      </button>
      <h2 className="min-w-0 flex-1 truncate text-csmju-body font-bold text-ink">{title}</h2>
    </div>
  );
}

function SectionHeading({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-csmju-body font-bold text-ink">{title}</h3>
      {onSeeAll && (
        <button type="button" onClick={onSeeAll} className="min-h-11 px-2 text-csmju-caption font-semibold text-ink hover:underline">
          ดูทั้งหมด
        </button>
      )}
    </div>
  );
}

/// ดีไซน์ของฉัน (ไม่รวมงานที่เปิดอยู่) — กดแล้วต่อหน้าของงานนั้นท้ายงานนี้
function DesignGrid({ q, folderId, scope, limit = 30, emptyText }: { q: string; folderId?: string; scope: Scope; limit?: number; emptyText: string }) {
  const designId = useEditor((s) => s.designId);
  const toast = useToast();
  const designs = useQuery({
    queryKey: ['designs', 'editor-projects', scope, q, folderId ?? '', limit],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ q: q || undefined, folderId, scope, sort: 'updated', limit: limit + 1 })}`),
  });

  const insert = async (design: DesignSummary) => {
    if (!window.confirm(`ต่อหน้าทั้งหมดของ “${design.title}” ท้ายงานนี้? (ย้อนกลับได้ด้วย Ctrl+Z)`)) return;

    try {
      const full = await api.get<Design>(`/designs/${design.id}`);
      const state = useEditor.getState();
      const doc = fitTemplate(normalizeDocument(full.document), { width: full.width, height: full.height }, { width: state.width, height: state.height });

      state.appendPages(doc.pages);
      toast(`เพิ่ม ${doc.pages.length} หน้าจาก “${design.title}” แล้ว`);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  if (designs.isLoading) return <Spinner />;
  if (designs.isError) return <ErrorState message={errorMessage(designs.error)} onRetry={() => void designs.refetch()} />;

  const items = designs.data!.items.filter((d) => d.id !== designId).slice(0, limit);

  if (items.length === 0) return <p className="py-2 text-csmju-caption text-muted">{emptyText}</p>;

  return (
    <ul className="grid grid-cols-2 gap-3">
      {items.map((design) => (
        <li key={design.id}>
          <button type="button" onClick={() => void insert(design)} className="group block w-full text-left" aria-label={`ต่อหน้าของ ${design.title} ท้ายงานนี้`}>
            <span className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-2xl bg-surface-muted p-2 transition-shadow group-hover:shadow-csmju-md">
              {design.thumbnail ? (
                <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt="" />
              ) : (
                <LayoutGrid aria-hidden className="size-7 text-ink" />
              )}
            </span>
            <span className="mt-2 block truncate text-csmju-body font-bold text-ink">{design.title}</span>
            <span className="block truncate text-csmju-caption text-muted">{designTypeLabel(design.designType).replace(/\s*\(.*\)$/, '')}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FolderList({ q, onOpen, onStarred, onCreate }: { q: string; onOpen: (folder: Folder) => void; onStarred: () => void; onCreate: () => void }) {
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.list<Folder>('/folders?limit=100') });
  const term = q.toLowerCase();
  const items = (folders.data?.items ?? []).filter((f) => !term || f.name.toLowerCase().includes(term));

  return (
    <ul className="flex flex-col gap-2">
      <li>
        <button type="button" onClick={onCreate} className="flex min-h-18 w-full items-center gap-4 rounded-2xl px-2 text-left hover:bg-surface-muted">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl border border-dashed border-line-strong text-ink">
            <Plus aria-hidden className="size-6" />
          </span>
          <span className="text-csmju-body font-bold text-ink">สร้างโฟลเดอร์</span>
        </button>
      </li>
      <li>
        <button type="button" onClick={onStarred} className="flex min-h-18 w-full items-center gap-4 rounded-2xl px-2 text-left hover:bg-surface-muted">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-pastel-lilac text-ink">
            <Star aria-hidden className="size-6" />
          </span>
          <span className="text-csmju-body font-bold text-ink">ติดดาวแล้ว</span>
        </button>
      </li>
      {folders.isLoading && <li><Spinner /></li>}
      {folders.isError && (
        <li>
          <ErrorState message={errorMessage(folders.error)} onRetry={() => void folders.refetch()} />
        </li>
      )}
      {items.map((folder) => (
        <li key={folder.id}>
          <button type="button" onClick={() => onOpen(folder)} className="flex min-h-18 w-full items-center gap-4 rounded-2xl px-2 text-left hover:bg-surface-muted">
            <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-pastel-sky text-ink">
              <FolderIcon aria-hidden className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-csmju-body font-bold text-ink">{folder.name}</span>
              <span className="block text-csmju-caption text-muted">{folder.designCount} ดีไซน์</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/// รูปที่อัปโหลดไว้ — กดแล้วใส่ลงหน้าปัจจุบัน
export function ImageGrid({ q, limit = 60 }: { q: string; limit?: number }) {
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const toast = useToast();
  const assets = useQuery({
    queryKey: ['assets', 'editor', q, limit],
    queryFn: () => api.list<Asset>(`/assets${qs({ q: q || undefined, limit })}`),
  });

  const insert = (asset: Asset) => {
    const img = new Image();

    img.onload = () =>
      useEditor.getState().addElements([
        createImage(
          { width, height },
          { src: asset.contentUrl, assetId: asset.id, naturalWidth: img.naturalWidth || 400, naturalHeight: img.naturalHeight || 400, name: asset.fileName },
        ),
      ]);
    img.onerror = () => toast('เปิดรูปนี้ไม่ได้', 'error');
    img.src = asset.contentUrl;
  };

  if (assets.isLoading) return <Spinner />;
  if (assets.isError) return <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />;
  if (assets.data!.items.length === 0) return <p className="py-2 text-csmju-caption text-muted">{q ? 'ไม่พบรูปที่ค้นหา' : 'ยังไม่มีรูปที่อัปโหลด'}</p>;

  return (
    <ul className="columns-2 gap-2">
      {assets.data!.items.map((asset) => (
        <li key={asset.id} className="mb-2 break-inside-avoid">
          <button
            type="button"
            onClick={() => insert(asset)}
            aria-label={`ใส่รูป ${asset.fileName}`}
            className="csmju-checker block w-full overflow-hidden rounded-xl border border-line hover:shadow-csmju-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
            <img src={asset.contentUrl} alt="" className="block w-full" loading="lazy" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/// "ติดดาวแล้ว" — เทมเพลตที่ผู้ใช้ติดดาวไว้ (ข้อมูลจริงจาก /templates?starred=true)
function StarredView({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const starred = useQuery({
    queryKey: ['templates', 'starred-editor'],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ starred: true, limit: 60 })}`),
  });

  const apply = async (template: TemplateSummary) => {
    if (!window.confirm(`ใช้เทมเพลต “${template.title}” แทนงานทั้งหมดในหน้านี้? (ย้อนกลับได้ด้วย Ctrl+Z)`)) return;

    try {
      const full = await api.get<Template>(`/templates/${template.id}`);
      const state = useEditor.getState();

      state.replaceDocument(fitTemplate(normalizeDocument(full.document), { width: full.width, height: full.height }, { width: state.width, height: state.height }));
      toast(`ใช้เทมเพลต “${template.title}” แล้ว`);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BackHeader title="ติดดาวแล้ว" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {starred.isLoading ? (
          <Spinner />
        ) : starred.isError ? (
          <ErrorState message={errorMessage(starred.error)} onRetry={() => void starred.refetch()} />
        ) : starred.data!.items.length === 0 ? (
          <p className="px-6 pt-4 text-center text-csmju-body text-body">โฟลเดอร์นี้ยังว่าง เทมเพลตที่คุณติดดาวจะแสดงที่นี่</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {starred.data!.items.map((template) => (
              <li key={template.id}>
                <button type="button" onClick={() => void apply(template)} aria-label={`ใช้เทมเพลต ${template.title}`} className="block w-full overflow-hidden rounded-xl hover:shadow-csmju-md">
                  <Thumbnail src={template.thumbnail} width={template.width} height={template.height} designType={template.designType} alt="" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/// สร้างโฟลเดอร์ — ใช้ทั้งโฟลเดอร์ดีไซน์ (/folders) และโฟลเดอร์รูป (/asset-folders)
export function CreateFolderDialog({ endpoint, queryKey, onClose }: { endpoint: '/folders' | '/asset-folders'; queryKey: string; onClose: () => void }) {
  const [name, setName] = useState('โฟลเดอร์ที่ไม่มีชื่อ');
  const nameId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.post<Folder>(endpoint, { name: name.trim().slice(0, 80) }),
    onSuccess: (folder) => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast(`สร้างโฟลเดอร์ “${folder.name}” แล้ว`);
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Dialog open onClose={onClose} title="สร้างโฟลเดอร์" bare>
      <form
        className="flex flex-col gap-5 p-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <h2 className="text-csmju-h3 font-bold text-ink">สร้างโฟลเดอร์</h2>
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="text-csmju-body font-semibold text-ink">
            ชื่อ
          </label>
          <input id={nameId} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} className={inputClass} />
        </div>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
          สร้างโฟลเดอร์
        </Button>
      </form>
    </Dialog>
  );
}
