'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check, ChevronDown, ChevronRight, Download, Ellipsis, Image as ImageIcon, Info, LayoutGrid, List, PenLine, Plus,
  Search, SquarePen, Trash2, X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pager } from '@/components/csmju/list-controls';
import { CardGridSkeleton, EmptyState, ErrorState, IconButton, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { RenameDialog } from '@/components/designs/design-menu';
import { api, qs } from '@/lib/csmju/api';
import { useMe } from '@/lib/csmju/session';
import { designFromAsset, useCreateDesign } from '@/lib/create-design';
import { formatBytes, relativeTime } from '@/lib/format';
import type { Asset } from '@/lib/types';

const TYPE_OPTIONS = [
  { value: '', label: 'ประเภทใดก็ได้' },
  { value: 'image/png', label: 'รูปภาพ PNG' },
  { value: 'image/jpeg', label: 'รูปภาพ JPEG' },
  { value: 'image/webp', label: 'รูปภาพ WebP' },
  { value: 'image/gif', label: 'รูปภาพ GIF' },
  { value: 'image/svg+xml', label: 'กราฟิก SVG' },
];

const SORT_OPTIONS = [
  { value: 'created', label: 'ที่อัปโหลดล่าสุด' },
  { value: 'name', label: 'ชื่อ (ก–ฮ)' },
  { value: 'size', label: 'ขนาดใหญ่สุด' },
];

const MIME_LABEL: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/svg+xml': 'SVG',
};

/// โฟลเดอร์ "อัปโหลด" แบบ Canva (ภาพบรีฟ "ส่วนของ โปรเจกต์ - อัพโหลดแบบใหม่ 2 และ 3")
export function UploadsView({ focusAssetId }: { focusAssetId: string | null }) {
  const [q, setQ] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [sort, setSort] = useState('created');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<Asset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();

  const assets = useQuery({
    queryKey: ['assets', 'uploads', q.trim(), mimeType, sort, page],
    queryFn: () => api.list<Asset>(`/assets${qs({ q: q.trim(), mimeType, sort, page, limit: 40 })}`),
  });

  // เปิดจากรายการในแถบรอง (?asset=<id>) = เปิดแผงรายละเอียดของไฟล์นั้น
  const focused = useQuery({
    queryKey: ['asset-focus', focusAssetId],
    queryFn: async () => (await api.list<Asset>('/assets?limit=100')).items.find((a) => a.id === focusAssetId) ?? null,
    enabled: Boolean(focusAssetId),
  });
  const shown = details ?? focused.data ?? null;

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<Asset>('/assets', file),
    onSuccess: (asset) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      toast(`อัปโหลด “${asset.fileName}” แล้ว`);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const closeDetails = () => {
    setDetails(null);
    if (focusAssetId) router.replace('/projects?view=uploads');
  };

  return (
    <div className="px-4 pt-8 pb-12 md:px-10">
      <nav aria-label="ตำแหน่ง" className="flex items-center gap-1 text-csmju-caption text-muted">
        <Link href="/projects" className="hover:text-ink hover:underline">โปรเจกต์</Link>
        <ChevronRight aria-hidden className="size-4" />
        <span aria-current="page" className="text-ink">อัปโหลด</span>
      </nav>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-csmju-h1 font-bold text-ink">อัปโหลด</h1>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="sr-only"
          aria-label="เลือกไฟล์ที่จะอัปโหลด"
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? [])) upload.mutate(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={upload.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
        >
          <Plus aria-hidden className="size-4" /> {upload.isPending ? 'กำลังอัปโหลด…' : 'เพิ่มใหม่'}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <label htmlFor="uploads-q" className="sr-only">ค้นหาไฟล์</label>
          <input id="uploads-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="ค้นหาไฟล์" className={cx(inputClass, 'pl-10')} />
        </div>
        <Dropdown label="ประเภท" value={mimeType} options={TYPE_OPTIONS} onChange={(v) => { setMimeType(v); setPage(1); }} highlight={mimeType !== ''} />
        <div className="ml-auto flex items-center gap-2">
          <Dropdown label="เรียงตาม" value={sort} options={SORT_OPTIONS} onChange={(v) => { setSort(v); setPage(1); }} showValue />
          <IconButton label={layout === 'grid' ? 'แสดงเป็นรายการ' : 'แสดงเป็นตาราง'} onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')} className="border border-line-strong">
            {layout === 'grid' ? <List aria-hidden className="size-5" /> : <LayoutGrid aria-hidden className="size-5" />}
          </IconButton>
        </div>
      </div>

      <div className="mt-6">
        {assets.isLoading ? (
          <CardGridSkeleton count={12} />
        ) : assets.isError ? (
          <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />
        ) : assets.data!.items.length === 0 ? (
          <EmptyState
            title={q || mimeType ? 'ไม่พบไฟล์ที่ตรงกับการค้นหา' : 'ยังไม่มีไฟล์อัปโหลด'}
            description="รูปที่อัปโหลดในหน้าแก้ไขหรือจากปุ่ม “เพิ่มใหม่” จะเก็บไว้ที่นี่ ใช้ซ้ำได้ทุกงาน"
            icon={<ImageIcon aria-hidden className="size-8" />}
          />
        ) : layout === 'grid' ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
            {assets.data!.items.map((asset) => (
              <li key={asset.id} className="group relative">
                <button type="button" onClick={() => setDetails(asset)} className="block w-full text-left" aria-label={`ดูรายละเอียดของ ${asset.fileName}`}>
                  <span className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-xl bg-surface-muted p-3 transition-colors group-hover:bg-primary-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
                    <img src={asset.contentUrl} alt="" loading="lazy" className="max-h-full max-w-full rounded object-contain shadow-csmju-sm" />
                  </span>
                  <span className="mt-2 block truncate text-csmju-caption font-semibold text-ink">{asset.fileName}</span>
                  <span className="flex items-center gap-1 text-csmju-caption text-muted">
                    <ImageIcon aria-hidden className="size-3.5" /> รูปภาพ • {formatBytes(asset.sizeBytes)}
                  </span>
                </button>
                <div className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:has-aria-expanded:opacity-100">
                  <AssetMenu asset={asset} onDetails={() => setDetails(asset)} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full text-left text-csmju-caption">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 font-medium">ชื่อ</th>
                <th scope="col" className="hidden py-2 font-medium sm:table-cell">ชนิด</th>
                <th scope="col" className="hidden py-2 font-medium md:table-cell">ขนาด</th>
                <th scope="col" className="hidden py-2 font-medium md:table-cell">อัปโหลดเมื่อ</th>
                <th scope="col" className="w-14 py-2"><span className="sr-only">ตัวเลือก</span></th>
              </tr>
            </thead>
            <tbody>
              {assets.data!.items.map((asset) => (
                <tr key={asset.id} className="border-b border-line hover:bg-surface-muted">
                  <td className="py-2">
                    <button type="button" onClick={() => setDetails(asset)} className="flex items-center gap-3 text-left">
                      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
                        <img src={asset.contentUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                      </span>
                      <span className="truncate font-semibold text-ink">{asset.fileName}</span>
                    </button>
                  </td>
                  <td className="hidden py-2 text-body sm:table-cell">{MIME_LABEL[asset.mimeType] ?? asset.mimeType}</td>
                  <td className="hidden py-2 text-body md:table-cell">{formatBytes(asset.sizeBytes)}</td>
                  <td className="hidden py-2 text-body md:table-cell">{relativeTime(asset.createdAt)}</td>
                  <td className="py-2"><AssetMenu asset={asset} onDetails={() => setDetails(asset)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {assets.data && <Pager page={page} totalPages={assets.data.meta.totalPages} onPage={setPage} />}
      </div>

      {shown && createPortal(<AssetDetails asset={shown} onClose={closeDetails} />, document.body)}
    </div>
  );
}

/// ปุ่มดรอปดาวน์แบบ Canva (ประเภท · เรียงตาม) พร้อมเครื่องหมายถูกที่ตัวเลือกปัจจุบัน
function Dropdown({
  label,
  value,
  options,
  onChange,
  showValue = false,
  highlight = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  showValue?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-csmju-caption font-medium',
          highlight || open ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
        )}
      >
        {showValue ? current?.label : highlight ? `${label}: ${current?.label}` : label}
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {open && (
        <div className="csmju-pop absolute top-full left-0 z-40 mt-1 w-64 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
          <p className="px-4 py-2 text-csmju-caption font-semibold text-muted">{label}</p>
          <ul role="listbox" aria-label={label}>
            {options.map((option) => (
              <li key={option.value || 'any'} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cx('flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted', option.value === value && 'bg-surface-muted')}
                >
                  <span className="flex-1">{option.label}</span>
                  {option.value === value && <Check aria-hidden className="size-5" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function useAssetUpdate(asset: Asset, onDone?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: { fileName?: string; trashed?: boolean }) => api.patch<Asset>(`/assets/${asset.id}`, body),
    onSuccess: (_data, body) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      if (body.trashed) toast(`ย้าย “${asset.fileName}” ไปถังขยะแล้ว`);
      onDone?.();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
}

function downloadAsset(asset: Asset) {
  const link = document.createElement('a');

  link.href = asset.contentUrl;
  link.download = asset.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/// เมนู "…" ของไฟล์ (ภาพบรีฟ "อัพโหลดแบบใหม่ 3")
function AssetMenu({ asset, onDetails }: { asset: Asset; onDetails: () => void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const me = useMe();
  const toast = useToast();
  const create = useCreateDesign();
  const update = useAssetUpdate(asset, () => setRenaming(false));

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const item = 'flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`ตัวเลือกของ ${asset.fileName}`}
        title="ตัวเลือก"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx('inline-flex size-9 items-center justify-center rounded-lg text-on-inverse shadow-csmju-sm', open ? 'bg-primary' : 'bg-primary/90 hover:bg-primary')}
      >
        <Ellipsis aria-hidden className="size-5" />
      </button>
      {open && (
        <div role="menu" aria-label={`ตัวเลือกของ ${asset.fileName}`} className="csmju-pop absolute top-full right-0 z-40 mt-1 w-72 rounded-2xl border border-line bg-surface py-1 shadow-csmju-lg">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="truncate text-csmju-body font-semibold text-ink">{asset.fileName}</p>
              <button type="button" aria-label="เปลี่ยนชื่อไฟล์" title="เปลี่ยนชื่อไฟล์" onClick={run(() => setRenaming(true))} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
                <PenLine aria-hidden className="size-4" />
              </button>
            </div>
            <p className="text-csmju-caption text-muted">อัปโหลดโดย {me.email.split('@')[0]} {relativeTime(asset.createdAt)}</p>
          </div>
          <div className="py-1">
            <button type="button" role="menuitem" className={item} onClick={run(onDetails)}>
              <Info aria-hidden className="size-5" /> รายละเอียด
            </button>
          </div>
          <div className="border-t border-line py-1">
            <button type="button" role="menuitem" className={item} onClick={run(() => downloadAsset(asset))}>
              <Download aria-hidden className="size-5" /> ดาวน์โหลด
            </button>
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={run(() =>
                void designFromAsset(asset)
                  .then((input) => create.mutate(input, { onError: (error) => toast(errorMessage(error), 'error') }))
                  .catch((error: unknown) => toast(errorMessage(error), 'error')),
              )}
            >
              <SquarePen aria-hidden className="size-5" /> แก้ไขรูปภาพ
            </button>
          </div>
          <div className="border-t border-line py-1">
            <button type="button" role="menuitem" className={item} onClick={run(() => update.mutate({ trashed: true }))}>
              <Trash2 aria-hidden className="size-5" /> ย้ายไปที่ถังขยะ
            </button>
          </div>
        </div>
      )}
      {renaming &&
        createPortal(
          <RenameDialog title="เปลี่ยนชื่อไฟล์" initial={asset.fileName} busy={update.isPending} onClose={() => setRenaming(false)} onSave={(fileName) => update.mutate({ fileName })} />,
          document.body,
        )}
    </div>
  );
}

function AssetDetails({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const create = useCreateDesign();
  const toast = useToast();

  useEffect(() => {
    ref.current?.focus();

    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows: [string, ReactNode][] = [
    ['ชนิด', `รูปภาพ ${MIME_LABEL[asset.mimeType] ?? ''}`],
    ['ขนาดไฟล์', formatBytes(asset.sizeBytes)],
    ['อัปโหลดเมื่อ', new Date(asset.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })],
    ['บันทึกใน', 'อัปโหลด'],
  ];

  return (
    <aside ref={ref} tabIndex={-1} aria-label={`รายละเอียดของ ${asset.fileName}`} className="csmju-slide-in fixed top-2 right-2 bottom-2 z-40 flex w-96 max-w-full flex-col rounded-3xl border border-line bg-surface shadow-csmju-lg outline-none">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <h2 className="truncate text-csmju-h3 font-bold text-ink">{asset.fileName}</h2>
        <IconButton label="ปิดรายละเอียด" onClick={onClose}>
          <X aria-hidden className="size-5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        <span className="csmju-checker flex aspect-4/3 items-center justify-center overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
          <img src={asset.contentUrl} alt={asset.fileName} className="max-h-full max-w-full object-contain" />
        </span>
        <dl className="grid grid-cols-2 gap-y-2 rounded-2xl border border-line p-4 text-csmju-caption">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-medium text-ink">{label}</dt>
              <dd className="text-right text-body">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex gap-2">
          <button type="button" onClick={() => downloadAsset(asset)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
            <Download aria-hidden className="size-4" /> ดาวน์โหลด
          </button>
          <button
            type="button"
            onClick={() =>
              void designFromAsset(asset)
                .then((input) => create.mutate(input, { onError: (error) => toast(errorMessage(error), 'error') }))
                .catch((error: unknown) => toast(errorMessage(error), 'error'))
            }
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover"
          >
            <SquarePen aria-hidden className="size-4" /> แก้ไขรูปภาพ
          </button>
        </div>
      </div>
    </aside>
  );
}
