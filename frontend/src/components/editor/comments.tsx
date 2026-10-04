'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bold, Check, ChevronDown, Ellipsis, Italic, List, MessageCirclePlus, Quote, RotateCcw, SendHorizontal, Smile, Strikethrough, Trash2, X,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { ErrorState, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { layerLabel } from '@/lib/editor/factory';
import { boundingBox } from '@/lib/editor/geometry';
import { canComment, currentPage, useEditor } from '@/lib/editor/store';
import { useEditorUi } from '@/lib/editor/ui-store';

/// ความคิดเห็นบนงาน (ภาพบรีฟ "ความคิดเห็น") — แผงด้านขวา · หมุดบนผืนผ้าใบ · ตอบกลับ · อีโมจิ · แก้ไขแล้ว
///
/// ระบบไม่เก็บชื่อผู้ใช้ — ความคิดเห็นของคนอื่นแสดงเป็น "ผู้ร่วมงาน #รหัส" (รหัสสั้นที่หลังบ้านคำนวณ)

export interface CommentItem {
  id: string;
  designId: string;
  pageId: string;
  elementId: string | null;
  parentId: string | null;
  body: string;
  author: 'me' | 'owner' | 'collaborator';
  authorTag: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  resolvedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

const REACTIONS = ['❤️', '👍', '👏', '😂', '😮', '🤔'];
const EMOJI = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '🤗', '🤔', '🤨', '😐', '😶',
  '😏', '😌', '😴', '😮', '😲', '😳', '🥺', '😢', '😭', '😤', '😡', '🤯', '😱', '🥳', '😎', '🤓', '👍', '👎', '👏', '🙌', '🙏', '💪', '👌', '✌️',
  '🤝', '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💯', '🔥', '✨', '⭐', '🎉', '🎊', '✅', '❌', '⚠️', '💡', '📌', '📎', '✏️', '📝', '🎨',
];

export function authorName(c: Pick<CommentItem, 'author' | 'authorTag'>): string {
  return c.author === 'me' ? 'คุณ' : c.author === 'owner' ? 'เจ้าของงาน' : `ผู้ร่วมงาน #${c.authorTag}`;
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);

  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;

  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export function useComments() {
  const designId = useEditor((s) => s.designId);
  const open = useEditorUi((s) => s.commentsOpen);

  return useQuery({
    queryKey: ['comments', designId],
    queryFn: () => api.list<CommentItem>(`/designs/${designId}/comments?limit=100`),
    enabled: Boolean(designId),
    refetchInterval: open ? 20_000 : false,
  });
}

/// ข้อความแบบจัดรูปแบบอย่างง่าย: **หนา** _เอียง_ ~~ขีดฆ่า~~ · ขึ้นต้นบรรทัด "- " = รายการ · "> " = อ้างอิง
function RichText({ text }: { text: string }) {
  const inline = (line: string, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|_[^_]+_|~~[^~]+~~)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;

    while ((m = pattern.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));

      const token = m[0];

      if (token.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{token.slice(2, -2)}</strong>);
      else if (token.startsWith('~~')) out.push(<s key={`${key}-${i++}`}>{token.slice(2, -2)}</s>);
      else out.push(<em key={`${key}-${i++}`}>{token.slice(1, -1)}</em>);
      last = m.index + token.length;
    }

    if (last < line.length) out.push(line.slice(last));

    return out;
  };

  return (
    <div className="text-csmju-caption break-words text-ink">
      {text.split('\n').map((line, i) =>
        line.startsWith('> ') ? (
          <blockquote key={i} className="border-l-2 border-line-strong pl-2 text-muted">
            {inline(line.slice(2), `q${i}`)}
          </blockquote>
        ) : line.startsWith('- ') ? (
          <p key={i} className="pl-3">
            • {inline(line.slice(2), `l${i}`)}
          </p>
        ) : (
          <p key={i}>{line ? inline(line, `p${i}`) : ' '}</p>
        ),
      )}
    </div>
  );
}

function Composer({ placeholder, onSend, autoFocus, busy }: { placeholder: string; onSend: (body: string) => void; autoFocus?: boolean; busy?: boolean }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const wrap = (before: string, after = before) => {
    const el = ref.current;

    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${text.slice(0, start)}${before}${text.slice(start, end) || 'ข้อความ'}${after}${text.slice(end)}`;

    setText(next);
    requestAnimationFrame(() => el.focus());
  };
  const prefix = (mark: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;

    setText(`${text.slice(0, lineStart)}${mark}${text.slice(lineStart)}`);
    requestAnimationFrame(() => el?.focus());
  };
  const insert = (value: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;

    setText(`${text.slice(0, start)}${value}${text.slice(start)}`);
    setOpen(false);
    requestAnimationFrame(() => el?.focus());
  };
  const send = () => {
    if (!text.trim() || busy) return;

    onSend(text.trim());
    setText('');
  };

  return (
    <div className="rounded-xl border border-line-strong bg-surface focus-within:border-primary">
      <label className="sr-only" htmlFor={`composer-${placeholder}`}>{placeholder}</label>
      <textarea
        id={`composer-${placeholder}`}
        ref={ref}
        value={text}
        maxLength={2000}
        rows={2}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        className="block w-full resize-none rounded-t-xl bg-transparent px-3 pt-2 text-csmju-caption text-ink placeholder:text-muted focus:outline-none"
      />
      <div className="flex items-center gap-0.5 px-1 pb-1">
        <IconTiny label="อีโมจิ" buttonRef={anchorRef} onClick={() => setOpen((v) => !v)}>
          <Smile aria-hidden className="size-4" />
        </IconTiny>
        <IconTiny label="ตัวหนา" onClick={() => wrap('**')}>
          <Bold aria-hidden className="size-4" />
        </IconTiny>
        <IconTiny label="ตัวเอียง" onClick={() => wrap('_')}>
          <Italic aria-hidden className="size-4" />
        </IconTiny>
        <IconTiny label="รายการ" onClick={() => prefix('- ')}>
          <List aria-hidden className="size-4" />
        </IconTiny>
        <IconTiny label="ขีดฆ่า" onClick={() => wrap('~~')}>
          <Strikethrough aria-hidden className="size-4" />
        </IconTiny>
        <IconTiny label="ข้อความที่ยกมา" onClick={() => prefix('> ')}>
          <Quote aria-hidden className="size-4" />
        </IconTiny>
        <button
          type="button"
          aria-label="ส่ง (Ctrl+Enter)"
          title="ส่ง (Ctrl+Enter)"
          disabled={!text.trim() || busy}
          onClick={send}
          className="ml-auto inline-flex size-8 items-center justify-center rounded-full bg-primary text-on-inverse disabled:opacity-40"
        >
          <SendHorizontal aria-hidden className="size-4" />
        </button>
      </div>
      <FloatingPanel open={open} menuRef={menuRef} label="เลือกอีโมจิ" className="w-72 rounded-xl border border-line bg-surface p-2 shadow-csmju-lg">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI.map((e) => (
            <button key={e} type="button" aria-label={`ใส่อีโมจิ ${e}`} onClick={() => insert(e)} className="inline-flex size-8 items-center justify-center rounded-lg text-csmju-body hover:bg-surface-muted">
              {e}
            </button>
          ))}
        </div>
      </FloatingPanel>
    </div>
  );
}

function IconTiny({ label, onClick, children, buttonRef }: { label: string; onClick: () => void; children: ReactNode; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={buttonRef} type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex size-8 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
      {children}
    </button>
  );
}

type Filter = 'page' | 'all' | 'mine' | 'open' | 'resolved';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'page', label: 'หน้าปัจจุบัน' },
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'mine', label: 'คอมเมนต์ของคุณ' },
  { key: 'open', label: 'ยังไม่ได้แก้ไข' },
  { key: 'resolved', label: 'แก้ไขแล้ว' },
];

export function CommentsPanel() {
  const open = useEditorUi((s) => s.commentsOpen);

  if (!open) return null;

  return <CommentsPanelInner />;
}

function CommentsPanelInner() {
  const designId = useEditor((s) => s.designId);
  const pages = useEditor((s) => s.doc.pages);
  const page = useEditor((s) => currentPage(s));
  const selection = useEditor((s) => s.selection);
  const writable = useEditor((s) => canComment(s));
  const [filter, setFilter] = useState<Filter>('page');
  const [sort, setSort] = useState<'page' | 'recent'>('page');
  const [composing, setComposing] = useState(false);
  const comments = useComments();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { open: filterOpen, setOpen: setFilterOpen, anchorRef: filterAnchor, menuRef: filterMenu } = useAnchoredMenu('start');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['comments', designId] });
  const create = useMutation({
    mutationFn: (body: { body: string; pageId: string; elementId?: string; parentId?: string }) => api.post<CommentItem>(`/designs/${designId}/comments`, body),
    onSuccess: () => {
      refresh();
      setComposing(false);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const all = useMemo(() => comments.data?.items ?? [], [comments.data]);
  const roots = useMemo(() => {
    const pageOrder = new Map(pages.map((p, i) => [p.id, i]));
    const list = all
      .filter((c) => !c.parentId)
      .filter((c) =>
        filter === 'page' ? c.pageId === page.id : filter === 'mine' ? c.author === 'me' : filter === 'open' ? !c.resolvedAt : filter === 'resolved' ? Boolean(c.resolvedAt) : true,
      );

    return sort === 'recent'
      ? [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [...list].sort((a, b) => (pageOrder.get(a.pageId) ?? 999) - (pageOrder.get(b.pageId) ?? 999) || a.createdAt.localeCompare(b.createdAt));
  }, [all, filter, sort, page.id, pages]);
  const target = selection.length === 1 ? page.elements.find((el) => el.id === selection[0]) : undefined;

  return (
    <aside aria-label="ความคิดเห็น" className="csmju-slide-in flex w-88 shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-2">
        <button ref={filterAnchor} type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
          {FILTERS.find((f) => f.key === filter)?.label}
          <ChevronDown aria-hidden className="size-4" />
        </button>
        <FloatingPanel open={filterOpen} menuRef={filterMenu} label="กรองความคิดเห็น" className="w-56 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
          <p className="px-3 pt-1 text-csmju-caption text-muted">กรองตาม</p>
          {FILTERS.map((f) => (
            <MenuCheck key={f.key} label={f.label} checked={filter === f.key} onClick={() => { setFilter(f.key); setFilterOpen(false); }} />
          ))}
          <div role="separator" className="my-1 h-px bg-line" />
          <p className="px-3 text-csmju-caption text-muted">เรียงตาม</p>
          <MenuCheck label="หน้า" checked={sort === 'page'} onClick={() => { setSort('page'); setFilterOpen(false); }} />
          <MenuCheck label="ล่าสุด" checked={sort === 'recent'} onClick={() => { setSort('recent'); setFilterOpen(false); }} />
        </FloatingPanel>
        <button type="button" aria-label="ปิดความคิดเห็น" onClick={() => useEditorUi.getState().set({ commentsOpen: false })} className="ml-auto inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {writable && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="mb-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-csmju-caption font-semibold text-primary hover:bg-primary-soft"
          >
            <MessageCirclePlus aria-hidden className="size-5" /> เพิ่มคอมเมนต์{target ? ` ที่ "${layerLabel(target).slice(0, 20)}"` : ' ในหน้านี้'}
          </button>
        )}
        {composing && (
          <div className="mb-3">
            <p className="mb-1 text-csmju-caption text-muted">
              หน้า {pages.indexOf(page) + 1}
              {target ? ` · ${layerLabel(target)}` : ' · ทั้งหน้า'}
            </p>
            <Composer
              autoFocus
              busy={create.isPending}
              placeholder="เพิ่มความคิดเห็น"
              onSend={(body) => create.mutate({ body, pageId: page.id, elementId: target?.id })}
            />
            <button type="button" onClick={() => setComposing(false)} className="mt-1 min-h-9 px-1 text-csmju-caption text-muted hover:text-ink">
              ยกเลิก
            </button>
          </div>
        )}
        {comments.isLoading ? (
          <Spinner />
        ) : comments.isError ? (
          <ErrorState message={errorMessage(comments.error)} onRetry={() => void comments.refetch()} />
        ) : roots.length === 0 ? (
          <p className="px-2 py-6 text-center text-csmju-caption text-muted">{filter === 'page' ? 'ไม่มีคอมเมนต์ในหน้านี้' : 'ไม่มีคอมเมนต์ตามตัวกรองนี้'}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {roots.map((c) => (
              <li key={c.id}>
                <Thread comment={c} replies={all.filter((r) => r.parentId === c.id)} writable={writable} onChanged={refresh} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function MenuCheck({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} onClick={onClick} className="flex min-h-10 w-full items-center px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
      <span className="flex-1">{label}</span>
      {checked && <Check aria-hidden className="size-4" />}
    </button>
  );
}

function Thread({ comment, replies, writable, onChanged }: { comment: CommentItem; replies: CommentItem[]; writable: boolean; onChanged: () => void }) {
  const designId = useEditor((s) => s.designId);
  const pages = useEditor((s) => s.doc.pages);
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const pageIndex = pages.findIndex((p) => p.id === comment.pageId);
  const element = pageIndex >= 0 && comment.elementId ? pages[pageIndex].elements.find((el) => el.id === comment.elementId) : undefined;
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/design-comments/${id}`, body),
    onSuccess: onChanged,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/design-comments/${id}`),
    onSuccess: onChanged,
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const reply = useMutation({
    mutationFn: (body: string) => api.post(`/designs/${designId}/comments`, { body, pageId: comment.pageId, parentId: comment.id }),
    onSuccess: () => {
      setReplying(false);
      onChanged();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const focus = () => {
    const state = useEditor.getState();

    if (pageIndex >= 0) state.setPageIndex(pageIndex);
    if (element) state.select([element.id]);
  };

  return (
    <article className={cx('rounded-2xl border p-3', comment.resolvedAt ? 'border-line bg-surface-muted/60' : 'border-line-strong')}>
      <CommentBody comment={comment} writable={writable} onPatch={(body) => patch.mutate({ id: comment.id, body })} onDelete={() => window.confirm('ลบความคิดเห็นนี้และการตอบกลับทั้งหมด?') && remove.mutate(comment.id)} resolvable />
      <button type="button" onClick={focus} className="mt-2 inline-flex min-h-8 items-center rounded-lg bg-surface-muted px-2 text-csmju-caption text-body hover:bg-primary-soft">
        {pageIndex >= 0 ? `หน้า ${pageIndex + 1}` : 'หน้าที่ถูกลบแล้ว'}
        {element ? ` · ${layerLabel(element).slice(0, 24)}` : comment.elementId ? ' · ชิ้นงานที่ถูกลบแล้ว' : ''}
      </button>
      {replies.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3 border-l-2 border-line pl-3">
          {replies.map((r) => (
            <li key={r.id}>
              <CommentBody comment={r} writable={writable} onPatch={(body) => patch.mutate({ id: r.id, body })} onDelete={() => remove.mutate(r.id)} />
            </li>
          ))}
        </ul>
      )}
      {writable &&
        (replying ? (
          <div className="mt-3">
            <Composer autoFocus busy={reply.isPending} placeholder="ตอบกลับ" onSend={(body) => reply.mutate(body)} />
          </div>
        ) : (
          <button type="button" onClick={() => setReplying(true)} className="mt-2 min-h-9 px-1 text-csmju-caption font-semibold text-primary hover:underline">
            ตอบกลับ
          </button>
        ))}
    </article>
  );
}

function CommentBody({
  comment,
  writable,
  onPatch,
  onDelete,
  resolvable = false,
}: {
  comment: CommentItem;
  writable: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  resolvable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('end');
  const { open: reactOpen, setOpen: setReactOpen, anchorRef: reactAnchor, menuRef: reactMenu } = useAnchoredMenu('start');

  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-full text-csmju-caption font-bold text-on-inverse', comment.author === 'me' ? 'bg-primary' : comment.author === 'owner' ? 'bg-type-orange' : 'bg-type-teal')}>
          {comment.author === 'me' ? 'ฉ' : comment.author === 'owner' ? 'จ' : comment.authorTag.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-csmju-caption font-semibold text-ink">{authorName(comment)}</span>
          <span className="block text-csmju-caption text-muted">
            {timeAgo(comment.createdAt)}
            {comment.resolvedAt && ' · แก้ไขแล้ว'}
          </span>
        </span>
        {resolvable && writable && (
          <button
            type="button"
            aria-label={comment.resolvedAt ? 'เปิดความคิดเห็นอีกครั้ง' : 'ทำเครื่องหมายว่าแก้ไขแล้ว'}
            title={comment.resolvedAt ? 'เปิดอีกครั้ง' : 'แก้ไขแล้ว'}
            onClick={() => onPatch({ resolved: !comment.resolvedAt })}
            className="inline-flex size-8 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
          >
            {comment.resolvedAt ? <RotateCcw aria-hidden className="size-4" /> : <Check aria-hidden className="size-4" />}
          </button>
        )}
        {(comment.canEdit || comment.canDelete) && (
          <>
            <button ref={anchorRef} type="button" aria-label="ตัวเลือกความคิดเห็น" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex size-8 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
              <Ellipsis aria-hidden className="size-4" />
            </button>
            <FloatingPanel open={open} menuRef={menuRef} label="ตัวเลือกความคิดเห็น" className="w-44 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
              {comment.canEdit && (
                <button type="button" role="menuitem" onClick={() => { setOpen(false); setEditing(true); }} className="flex min-h-10 w-full items-center px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
                  แก้ไขข้อความ
                </button>
              )}
              {comment.canDelete && (
                <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-csmju-caption text-danger hover:bg-surface-muted">
                  <Trash2 aria-hidden className="size-4" /> ลบ
                </button>
              )}
            </FloatingPanel>
          </>
        )}
      </div>
      <div className="mt-1.5 pl-9">
        {editing ? (
          <EditBox
            initial={comment.body}
            onCancel={() => setEditing(false)}
            onSave={(body) => {
              onPatch({ body });
              setEditing(false);
            }}
          />
        ) : (
          <RichText text={comment.body} />
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {comment.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              disabled={!writable}
              aria-pressed={r.mine}
              aria-label={`${r.emoji} ${r.count} คน`}
              onClick={() => onPatch({ reaction: r.emoji })}
              className={cx('inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-csmju-caption', r.mine ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink')}
            >
              {r.emoji} {r.count}
            </button>
          ))}
          {writable && (
            <>
              <button ref={reactAnchor} type="button" aria-label="เพิ่มอีโมจิ" aria-expanded={reactOpen} onClick={() => setReactOpen((v) => !v)} className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-ink">
                <Smile aria-hidden className="size-4" />
              </button>
              <FloatingPanel open={reactOpen} menuRef={reactMenu} label="เลือกรีแอกชัน" className="flex gap-1 rounded-full border border-line bg-surface p-1 shadow-csmju-lg">
                {REACTIONS.map((e) => (
                  <button key={e} type="button" aria-label={`รีแอกชัน ${e}`} onClick={() => { onPatch({ reaction: e }); setReactOpen(false); }} className="inline-flex size-9 items-center justify-center rounded-full text-csmju-body hover:bg-surface-muted">
                    {e}
                  </button>
                ))}
              </FloatingPanel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (body: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);

  return (
    <div className="flex flex-col gap-1">
      <label className="sr-only" htmlFor="edit-comment">แก้ไขความคิดเห็น</label>
      <textarea id="edit-comment" value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} className="w-full resize-none rounded-lg border border-line-strong bg-surface p-2 text-csmju-caption text-ink focus:border-primary focus:outline-none" />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onCancel} className="min-h-9 rounded-lg px-3 text-csmju-caption text-ink hover:bg-surface-muted">
          ยกเลิก
        </button>
        <button type="button" disabled={!text.trim()} onClick={() => onSave(text.trim())} className="min-h-9 rounded-lg bg-primary px-3 text-csmju-caption font-semibold text-on-inverse disabled:opacity-40">
          บันทึก
        </button>
      </div>
    </div>
  );
}

/// หมุดความคิดเห็นบนผืนผ้าใบ (มุมขวาบนของชิ้นงาน หรือของหน้า) — กดเพื่อเปิดแผงความคิดเห็น
export function CommentPins() {
  const show = useEditorUi((s) => s.commentPins);
  const page = useEditor((s) => currentPage(s));
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const width = useEditor((s) => s.width);
  const comments = useComments();

  if (!show) return null;

  const threads = (comments.data?.items ?? []).filter((c) => !c.parentId && !c.resolvedAt && c.pageId === page.id);
  const groups = new Map<string, CommentItem[]>();

  for (const c of threads) {
    const key = c.elementId && page.elements.some((el) => el.id === c.elementId) ? c.elementId : 'page';

    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  return (
    <>
      {[...groups.entries()].map(([key, list]) => {
        const el = key === 'page' ? null : page.elements.find((e) => e.id === key)!;
        const box = el ? boundingBox(el) : { x: 0, y: 0, width, height: 0 };
        const left = pan.x + (box.x + box.width) * zoom;
        const top = pan.y + box.y * zoom;
        const first = list[0];

        return (
          <button
            key={key}
            type="button"
            aria-label={`ความคิดเห็น ${list.length} รายการ${el ? ` ที่ ${layerLabel(el)}` : ' ในหน้านี้'}`}
            title={first.body.slice(0, 80)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              useEditorUi.getState().set({ commentsOpen: true });
              if (el) useEditor.getState().select([el.id]);
            }}
            className="absolute z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full rounded-bl-none bg-primary text-csmju-caption font-bold text-on-inverse shadow-csmju-md ring-2 ring-surface"
            style={{ left: left + 6, top: top - 6 }}
          >
            {list.length}
          </button>
        );
      })}
    </>
  );
}
