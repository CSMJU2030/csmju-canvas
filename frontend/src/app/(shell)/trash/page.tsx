'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, ErrorState, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { Thumbnail } from '@/components/designs/cards';
import { api, qs } from '@/lib/csmju/api';
import { daysLeft, formatBytes } from '@/lib/format';
import type { Asset, DesignSummary } from '@/lib/types';
import { Pager } from '@/components/csmju/list-controls';

type Tab = 'designs' | 'images';

export default function TrashPage() {
  const [tab, setTab] = useState<Tab>('designs');

  return (
    <div className="px-4 py-8 md:px-10">
      <h1 className="text-csmju-h1 font-bold text-ink">ถังขยะ</h1>
      <div role="tablist" aria-label="ชนิดของที่ลบ" className="mt-6 flex gap-6">
        {(
          [
            ['designs', 'ดีไซน์'],
            ['images', 'รูป'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              'min-h-11 border-b-2 px-1 text-csmju-caption',
              tab === key ? 'border-primary font-semibold text-ink' : 'border-transparent text-body hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">{tab === 'designs' ? <TrashedDesigns /> : <TrashedImages />}</div>
    </div>
  );
}

function TrashedDesigns() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['designs', 'trash', page],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ trashed: true, page, limit: 20 })}`),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['designs'] });
    void queryClient.invalidateQueries({ queryKey: ['quotas'] });
  };
  const restore = useMutation({
    mutationFn: (id: string) => api.patch(`/designs/${id}`, { trashed: false }),
    onSuccess: () => {
      refresh();
      toast('กู้คืนงานแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const purge = useMutation({
    mutationFn: (id: string) => api.del(`/designs/${id}`),
    onSuccess: () => {
      refresh();
      toast('ลบงานถาวรแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (query.data!.items.length === 0) return <TrashEmpty what="ดีไซน์" />;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {query.data!.items.map((design) => (
          <li key={design.id} className="rounded-2xl p-2">
            <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt={`ภาพย่อของ ${design.title}`} />
            <p className="mt-2 truncate text-csmju-caption font-semibold text-ink">{design.title}</p>
            <p className="text-csmju-caption text-muted">ลบถาวรใน {daysLeft(design.trashedAt!)} วัน</p>
            <div className="mt-2 flex gap-2">
              <Button className="flex-1" loading={restore.isPending && restore.variables === design.id} onClick={() => restore.mutate(design.id)}>
                <ArchiveRestore aria-hidden className="size-4" /> กู้คืน
              </Button>
              <Button
                variant="ghost"
                className="text-danger"
                aria-label={`ลบ ${design.title} ถาวร`}
                loading={purge.isPending && purge.variables === design.id}
                onClick={() => {
                  if (window.confirm(`ลบ “${design.title}” ถาวร? กู้คืนไม่ได้อีก`)) purge.mutate(design.id);
                }}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Pager page={page} totalPages={query.data!.meta.totalPages} onPage={setPage} />
    </>
  );
}

function TrashedImages() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['assets', 'trash', page],
    queryFn: () => api.list<Asset>(`/assets${qs({ trashed: true, page, limit: 30 })}`),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['quotas'] });
  };
  const restore = useMutation({
    mutationFn: (id: string) => api.patch(`/assets/${id}`, { trashed: false }),
    onSuccess: () => {
      refresh();
      toast('กู้คืนรูปแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const purge = useMutation({
    mutationFn: (id: string) => api.del(`/assets/${id}`),
    onSuccess: () => {
      refresh();
      toast('ลบรูปถาวรแล้ว พื้นที่คืนแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (query.data!.items.length === 0) return <TrashEmpty what="รูป" />;

  return (
    <>
      <p className="mb-3 text-csmju-caption text-muted">รูปในถังขยะยังนับรวมในพื้นที่ จนกว่าจะลบถาวร · งานที่ใช้รูปนั้นอยู่จะแสดงรูปไม่ได้หลังลบถาวร</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {query.data!.items.map((asset) => (
          <li key={asset.id} className="rounded-2xl p-2">
            <span className="csmju-checker flex aspect-square items-center justify-center overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session */}
              <img src={asset.contentUrl} alt={asset.fileName} className="max-h-full max-w-full object-contain" />
            </span>
            <p className="mt-1 truncate text-csmju-caption text-ink">{asset.fileName}</p>
            <p className="text-csmju-caption text-muted">{formatBytes(asset.sizeBytes)} · เหลือ {daysLeft(asset.trashedAt!)} วัน</p>
            <div className="mt-1 flex gap-1">
              <Button className="flex-1 px-2" loading={restore.isPending && restore.variables === asset.id} onClick={() => restore.mutate(asset.id)}>
                กู้คืน
              </Button>
              <Button
                variant="ghost"
                className="px-2 text-danger"
                aria-label={`ลบ ${asset.fileName} ถาวร`}
                onClick={() => {
                  if (window.confirm(`ลบรูป “${asset.fileName}” ถาวร?`)) purge.mutate(asset.id);
                }}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Pager page={page} totalPages={query.data!.meta.totalPages} onPage={setPage} />
    </>
  );
}

/// ภาพว่างของถังขยะแบบ Canva: ถังสีม่วงไล่สี + ข้อความบอกระยะเวลากู้คืน
function TrashEmpty({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <span className="csmju-gradient-button flex size-28 items-center justify-center rounded-full shadow-csmju-lg">
        <Trash2 aria-hidden className="size-14" strokeWidth={1.75} />
      </span>
      <p className="mt-3 text-csmju-h3 font-semibold text-ink">{what}ใดๆ ก็ตามที่คุณลบลงถังขยะจะอยู่ที่นี่</p>
      <p className="text-csmju-caption text-body">
        คุณมีเวลา 30 วันในการกู้คืนรายการ ก่อนที่ระบบจะลบรายการออกจากถังขยะโดยอัตโนมัติ{' '}
        <Link href="/help/projects-trash" className="font-medium text-primary underline">ดูข้อมูลเพิ่มเติม</Link>
      </p>
    </div>
  );
}
