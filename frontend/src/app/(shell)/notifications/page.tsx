'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, EmptyState, ErrorState, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { relativeTime } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { Pager } from '@/components/csmju/list-controls';

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['notifications', 'list', page],
    queryFn: () => api.list<NotificationItem>(`/notifications${qs({ page, limit: 20 })}`),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications', { read: true }),
    onSuccess: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const mark = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => api.patch(`/notifications/${id}`, { read }),
    onSuccess: refresh,
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const hasUnread = query.data?.items.some((n) => !n.readAt);

  return (
    <div className="px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-csmju-h1 font-bold text-ink">แจ้งเตือน</h1>
        {hasUnread && (
          <Button onClick={() => markAll.mutate()} loading={markAll.isPending}>
            <CheckCheck aria-hidden className="size-4" /> อ่านทั้งหมดแล้ว
          </Button>
        )}
      </div>
      <p className="mt-1 text-csmju-body text-muted">ตั้งค่าว่าจะรับแจ้งเตือนเรื่องใดได้ที่ บัญชี → การตั้งค่าข้อความ</p>
      <div className="mt-6">
        {query.isLoading ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data!.items.length === 0 ? (
          <EmptyState title="ยังไม่มีการแจ้งเตือน" description="เช่น เมื่อมีคนใช้เทมเพลตของคุณ หรือเมื่อย้ายงานไปถังขยะ" icon={<Bell aria-hidden className="size-8" />} />
        ) : (
          <>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {query.data!.items.map((n) => (
                <li key={n.id} className={cx('flex items-start gap-3 px-4 py-3', !n.readAt && 'bg-primary-soft/50')}>
                  <span aria-hidden className={cx('mt-2 size-2.5 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => !n.readAt && mark.mutate({ id: n.id, read: true })}
                        className="text-csmju-body text-ink hover:underline"
                      >
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-csmju-body text-ink">{n.title}</p>
                    )}
                    <p className="text-csmju-caption text-muted">{relativeTime(n.createdAt)}</p>
                  </div>
                  <Button variant="ghost" className="px-2" onClick={() => mark.mutate({ id: n.id, read: !n.readAt })}>
                    {n.readAt ? 'ทำเป็นยังไม่อ่าน' : 'อ่านแล้ว'}
                  </Button>
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
