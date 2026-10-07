'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Globe, Link2, Lock, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { api } from '@/lib/csmju/api';
import { useMe } from '@/lib/csmju/session';
import { designTypeGroup, designTypeLabel } from '@/lib/design-types';
import type { DesignSummary, Folder } from '@/lib/types';
import { Button, Dialog, IconButton, errorMessage, useToast } from '../csmju/primitives';
import { Avatar } from '../shell/avatar';
import { Thumbnail } from './cards';

/// ลิงก์ของงาน (ผู้ได้ลิงก์ต้องเข้าสู่ระบบ CSMJU2030 ก่อนเสมอ)
export function designUrl(id: string): string {
  return typeof window === 'undefined' ? `/design/${id}` : `${window.location.origin}/design/${id}`;
}

export async function copyDesignLink(id: string): Promise<void> {
  await navigator.clipboard.writeText(designUrl(id));
}

function useInvalidateDesigns() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: ['designs'] });
    void queryClient.invalidateQueries({ queryKey: ['design'] });
  };
}

// ── หน้าต่าง "แชร์ดีไซน์" (ภาพบรีฟ "เมื่อกดแชร์" ทั้งสามภาพ) ─────────────

const ACCESS_OPTIONS = [
  {
    value: 'private',
    title: 'คุณเท่านั้นที่เข้าถึงได้',
    description: 'เฉพาะคุณเท่านั้นที่เปิดดีไซน์นี้ได้ด้วยลิงก์นี้',
    icon: <Lock aria-hidden className="size-5" />,
  },
  {
    value: 'link',
    title: 'ทุกคนที่มีลิงก์',
    description: 'ทุกคนที่มีบัญชี CSMJU2030 เปิดดีไซน์นี้ได้ด้วยลิงก์นี้ (ต้องเข้าสู่ระบบก่อน)',
    icon: <Globe aria-hidden className="size-5" />,
  },
] as const;

export function ShareDialog({ design, onClose }: { design: Pick<DesignSummary, 'id' | 'title' | 'linkAccess'>; onClose: () => void }) {
  const me = useMe();
  const toast = useToast();
  const invalidate = useInvalidateDesigns();
  const [linkAccess, setLinkAccess] = useState(design.linkAccess);
  const [picker, setPicker] = useState<'access' | 'role' | null>(null);
  const save = useMutation({
    mutationFn: (value: DesignSummary['linkAccess']) => api.patch(`/designs/${design.id}`, { linkAccess: value }),
    onMutate: (value) => setLinkAccess(value),
    onSuccess: invalidate,
    onError: (error) => {
      setLinkAccess(design.linkAccess);
      toast(errorMessage(error), 'error');
    },
  });
  const isLink = linkAccess !== 'NONE';
  const current = ACCESS_OPTIONS[isLink ? 1 : 0];

  return (
    <Dialog open onClose={onClose} title="แชร์ดีไซน์">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar email={me.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-csmju-caption font-semibold text-ink">{me.email.split('@')[0]}</p>
            <p className="truncate text-csmju-caption text-muted">{me.email}</p>
          </div>
          <span className="text-csmju-caption font-semibold text-ink">เจ้าของ</span>
        </div>
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-csmju-caption text-muted">
          การเพิ่มคนทีละคนด้วยชื่อหรืออีเมลยังทำไม่ได้ เพราะระบบกลาง CSMJU2030 ยังไม่เปิดให้ระบบย่อยค้นรายชื่อผู้ใช้ — ใช้การแชร์ด้วยลิงก์แทน
        </p>
        <div className="h-px bg-line" />
        <div>
          <p className="mb-2 text-csmju-caption font-semibold text-ink">ระดับการเข้าถึง</p>
          <div className="relative flex gap-2">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={picker === 'access'}
              onClick={() => setPicker(picker === 'access' ? null : 'access')}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink">{current.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-csmju-caption font-semibold text-ink">{current.title}</span>
                {isLink && <span className="block text-csmju-caption text-muted">ต้องมีลิงก์เพื่อเข้าถึง</span>}
              </span>
              <ChevronDown aria-hidden className="size-5 text-muted" />
            </button>
            {isLink && (
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={picker === 'role'}
                onClick={() => setPicker(picker === 'role' ? null : 'role')}
                className="flex min-h-14 shrink-0 items-center gap-2 rounded-xl px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
              >
                {linkAccess === 'EDIT' ? 'แก้ไขได้' : linkAccess === 'COMMENT' ? 'แสดงความคิดเห็นได้' : 'ดูได้'}
                <ChevronDown aria-hidden className="size-4" />
              </button>
            )}
            {picker === 'access' && (
              <ul role="listbox" aria-label="ระดับการเข้าถึง" className="csmju-pop absolute top-full left-0 z-10 mt-1 w-full rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
                {ACCESS_OPTIONS.map((option) => {
                  const selected = option.value === current.value;

                  return (
                    <li key={option.value} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicker(null);
                          save.mutate(option.value === 'private' ? 'NONE' : linkAccess === 'NONE' ? 'VIEW' : linkAccess);
                        }}
                        className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface-muted"
                      >
                        <span className="mt-0.5 text-ink">{option.icon}</span>
                        <span className="flex-1">
                          <span className="block text-csmju-caption font-semibold text-ink">{option.title}</span>
                          <span className="block text-csmju-caption text-muted">{option.description}</span>
                        </span>
                        {selected && <Check aria-hidden className="size-5 text-ink" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {picker === 'role' && (
              <ul role="listbox" aria-label="สิทธิ์ของผู้มีลิงก์" className="csmju-pop absolute top-full right-0 z-10 mt-1 w-56 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
                {(
                  [
                    ['EDIT', 'แก้ไขได้'],
                    ['COMMENT', 'แสดงความคิดเห็นได้'],
                    ['VIEW', 'ดูได้'],
                  ] as const
                ).map(([value, label]) => (
                  <li key={value} role="option" aria-selected={linkAccess === value}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicker(null);
                        save.mutate(value);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted"
                    >
                      <span className="flex-1">{label}</span>
                      {linkAccess === value && <Check aria-hidden className="size-5" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            void copyDesignLink(design.id)
              .then(() => toast(isLink ? 'คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย' : 'คัดลอกลิงก์แล้ว — ตอนนี้เปิดได้เฉพาะคุณ'))
              .catch(() => toast('คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาตให้เขียนคลิปบอร์ด', 'error'));
          }}
        >
          <Link2 aria-hidden className="size-4" /> คัดลอกลิงก์
        </Button>
      </div>
    </Dialog>
  );
}

// ── แผง "รายละเอียด" ด้านขวา (ภาพบรีฟ "เมื่อกดรายละเอียด") ─────────────

export function DetailsPanel({ design, onClose, onShare }: { design: DesignSummary; onClose: () => void; onShare: () => void }) {
  const me = useMe();
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.list<Folder>('/folders?limit=100') });
  const [openDetails, setOpenDetails] = useState(true);
  const [openTags, setOpenTags] = useState(true);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.focus();

    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const folderName = folders.data?.items.find((f) => f.id === design.folderId)?.name;
  const date = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const rows: [string, ReactNode][] = [
    ['บันทึกใน', folderName ?? 'โปรเจกต์'],
    ['ประเภท', designTypeLabel(design.designType)],
    ['หมวดหมู่', designTypeGroup(design.designType)?.label ?? 'กำหนดเอง'],
    ['เจ้าของ', design.access === 'OWNER' ? me.email.split('@')[0] : 'ผู้แชร์ลิงก์'],
    ['วันที่แก้ไข', date(design.updatedAt)],
    ['วันที่สร้าง', date(design.createdAt)],
  ];

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={`รายละเอียดของ ${design.title}`}
      className="csmju-slide-in fixed top-2 right-2 bottom-2 z-40 flex w-96 max-w-full flex-col rounded-3xl border border-line bg-surface shadow-csmju-lg outline-none"
    >
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <h2 className="truncate text-csmju-h3 font-bold text-ink">{design.title}</h2>
        <IconButton label="ปิดรายละเอียด" onClick={onClose}>
          <X aria-hidden className="size-5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt={`ภาพย่อของ ${design.title}`} />

        <section className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-csmju-caption font-semibold text-ink">คนที่มีสิทธิ์เข้าถึง</h3>
            <span className="text-csmju-caption text-muted">
              {design.linkAccess === 'NONE' ? 'เฉพาะเจ้าของ' : design.linkAccess === 'EDIT' ? 'ทุกคนที่มีลิงก์ · แก้ไขได้' : 'ทุกคนที่มีลิงก์ · ดูได้'}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Avatar email={me.email} size="sm" />
            {design.access === 'OWNER' && (
              <IconButton label="แชร์ดีไซน์นี้" onClick={onShare} className="size-9 rounded-full border border-line-strong">
                <Plus aria-hidden className="size-4" />
              </IconButton>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line p-4">
          <button type="button" onClick={() => setOpenDetails((v) => !v)} aria-expanded={openDetails} className="flex min-h-11 w-full items-center justify-between text-csmju-caption font-semibold text-ink">
            รายละเอียด
            {openDetails ? <ChevronUp aria-hidden className="size-5" /> : <ChevronDown aria-hidden className="size-5" />}
          </button>
          {openDetails && (
            <dl className="grid grid-cols-2 gap-y-2 text-csmju-caption">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="font-medium text-ink">{label}</dt>
                  <dd className="truncate text-right text-body">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="rounded-2xl border border-line p-4">
          <button type="button" onClick={() => setOpenTags((v) => !v)} aria-expanded={openTags} className="flex min-h-11 w-full items-center justify-between text-csmju-caption font-semibold text-ink">
            แท็ก
            {openTags ? <ChevronUp aria-hidden className="size-5" /> : <ChevronDown aria-hidden className="size-5" />}
          </button>
          {openTags && <TagEditor design={design} />}
        </section>
      </div>
    </aside>
  );
}

function TagEditor({ design }: { design: DesignSummary }) {
  const [tags, setTags] = useState(design.tags);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const toast = useToast();
  const invalidate = useInvalidateDesigns();
  const editable = design.access === 'OWNER';
  const save = useMutation({
    mutationFn: (next: string[]) => api.patch<DesignSummary>(`/designs/${design.id}`, { tags: next }),
    onMutate: (next) => setTags(next),
    onSuccess: (saved) => {
      setTags(saved.tags);
      invalidate();
    },
    onError: (error) => {
      setTags(design.tags);
      toast(errorMessage(error), 'error');
    },
  });

  const add = () => {
    const tag = draft.trim().slice(0, 30);

    setDraft('');
    setAdding(false);

    if (tag && !tags.includes(tag)) save.mutate([...tags, tag]);
  };

  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }

    if (event.key === 'Escape') {
      event.stopPropagation();
      setAdding(false);
      setDraft('');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.length === 0 && !adding && <p className="w-full text-csmju-caption text-muted">ยังไม่มีแท็ก — ใช้แท็กช่วยจัดหมวดดีไซน์ของคุณเอง</p>}
      {tags.map((tag) => (
        <span key={tag} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary-soft pr-1 pl-3 text-csmju-caption text-primary">
          {tag}
          {editable && (
            <button type="button" aria-label={`ลบแท็ก ${tag}`} onClick={() => save.mutate(tags.filter((t) => t !== tag))} className="inline-flex size-7 items-center justify-center rounded-full hover:bg-primary-soft-hover">
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </span>
      ))}
      {editable &&
        (adding ? (
          <input
            autoFocus
            aria-label="ชื่อแท็กใหม่"
            value={draft}
            maxLength={30}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={add}
            placeholder="พิมพ์แล้วกด Enter"
            className="min-h-9 w-40 rounded-full border border-primary bg-surface px-3 text-csmju-caption text-ink outline-none"
          />
        ) : (
          tags.length < 20 && (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-csmju-caption font-medium text-ink hover:bg-surface-muted">
              <Plus aria-hidden className="size-4" /> เพิ่มแท็ก
            </button>
          )
        ))}
    </div>
  );
}
