'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUp, House, Images, PanelLeft, Search, SquareCheckBig, SquarePen, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cx } from '@/components/csmju/primitives';
import { AnswerBubble } from '@/components/shell/assistant-answer';
import { SUGGESTIONS } from '@/components/shell/help-assistant';
import { answerQuestion, type AssistantAnswer } from '@/lib/assistant';
import { useMe } from '@/lib/csmju/session';
import { relativeTime } from '@/lib/format';

interface Turn {
  id: number;
  question: string;
  answer: AssistantAnswer | null;
}

interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  turns: Turn[];
}

/// ประวัติแชทเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น (ไม่ใช่ความลับ ไม่มี token) — ไม่ส่งไปเก็บที่ใด
const STORAGE_KEY = 'csmju-canvas:assistant-chats';
const MAX_CHATS = 30;

function loadChats(): Chat[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as Chat[]) : [];
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
  } catch {
    // storage เต็มหรือถูกบล็อก — ใช้ได้ต่อแค่ไม่จำประวัติ
  }
}

/// ผู้ช่วยเต็มหน้า (แท็บ "ผู้ช่วย" บนมือถือ) — หน้าตาตามภาพบรีฟ "Canva ai"
///
/// ตอบด้วยการค้นจากคู่มือ เทมเพลต และงานของผู้ใช้จริง (ไม่ใช้ LLM ตามการตัดสินใจของ PL)
/// ไม่มีปุ่มไมค์: การแปลงเสียงของเบราว์เซอร์ส่งเสียงไปเซิร์ฟเวอร์ภายนอก ซึ่งขัดข้อห้ามของโครงการ
export default function AssistantPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [chats, setChats] = useState<Chat[]>(() => (typeof window === 'undefined' ? [] : loadChats()));
  const [chatId, setChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const nextId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const chat = chats.find((c) => c.id === chatId) ?? null;
  const name = me.email.split('@')[0];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat?.turns.length, busy]);

  const update = (fn: (chats: Chat[]) => Chat[]) => {
    setChats((current) => {
      const next = fn(current);

      saveChats(next);

      return next;
    });
  };

  const ask = async (question: string) => {
    const q = question.trim();

    if (!q || busy) return;

    nextId.current += 1;

    const turnId = nextId.current;
    const id = chatId ?? `chat-${Date.now().toString(36)}-${turnId}`;

    setDraft('');
    setBusy(true);
    setChatId(id);
    update((current) => {
      const existing = current.find((c) => c.id === id);
      const turn = { id: turnId, question: q, answer: null };
      const updated: Chat = existing
        ? { ...existing, turns: [...existing.turns, turn], updatedAt: new Date().toISOString() }
        : { id, title: q.slice(0, 60), updatedAt: new Date().toISOString(), turns: [turn] };

      return [updated, ...current.filter((c) => c.id !== id)];
    });

    const answer = await answerQuestion(q, queryClient);

    update((current) =>
      current.map((c) => (c.id === id ? { ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, answer } : t)) } : c)),
    );
    setBusy(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <div className="relative flex min-h-dvh flex-col md:min-h-panel">
      <div aria-hidden className="csmju-hero pointer-events-none absolute inset-x-0 top-0 h-64" />

      <header className="relative flex items-center gap-1 px-3 pt-3">
        {chat ? (
          <IconLink label="กลับไปหน้าเริ่มต้นของผู้ช่วย" onClick={() => setChatId(null)}>
            <ArrowLeft aria-hidden className="size-6" />
          </IconLink>
        ) : (
          <>
            <Link href="/" aria-label="หน้าหลัก" title="หน้าหลัก" className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface/60">
              <House aria-hidden className="size-6" />
            </Link>
            <IconLink label="แชทล่าสุด" onClick={() => setDrawer(true)}>
              <PanelLeft aria-hidden className="size-6" />
            </IconLink>
          </>
        )}
        <span className="flex-1" />
        <IconLink label="เริ่มแชทใหม่" onClick={() => setChatId(null)}>
          <SquarePen aria-hidden className="size-6" />
        </IconLink>
      </header>

      {chat ? (
        <>
          <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
            <ol className="mx-auto flex max-w-2xl flex-col gap-5 pt-4">
              {chat.turns.map((turn) => (
                <li key={turn.id} className="flex flex-col gap-3">
                  <p className="csmju-fade-in csmju-hero max-w-4/5 self-end rounded-3xl px-5 py-3 text-csmju-body text-ink">{turn.question}</p>
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="csmju-gradient-button mt-1 size-9 shrink-0 rounded-full" />
                    {turn.answer ? (
                      <AnswerBubble question={turn.question} answer={turn.answer} onNavigate={() => undefined} />
                    ) : (
                      <span role="status" className="csmju-gradient-text mt-2 animate-pulse font-semibold">กำลังค้นหา…</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <form onSubmit={submit} className="relative mx-auto w-full max-w-2xl px-4 pb-24 md:pb-6">
            <div className="csmju-search flex items-center gap-2 rounded-3xl py-2 pr-2 pl-5">
              <label htmlFor="assistant-followup" className="sr-only">ถามต่อ</label>
              <input
                id="assistant-followup"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={200}
                placeholder="เราควรจะทำงานไหนต่อให้เสร็จ?"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-csmju-body text-ink placeholder:text-muted focus:outline-none"
              />
              <SendButton disabled={!draft.trim() || busy} />
            </div>
          </form>
        </>
      ) : (
        <div className="csmju-fade-in relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 pb-28 md:pb-10">
          <h1 className="csmju-gradient-text text-csmju-h1 font-bold md:text-csmju-display">วันนี้เราจะดีไซน์อะไรกันดี {name}?</h1>
          <form onSubmit={submit} className="mt-6">
            <div className="csmju-search rounded-3xl p-4">
              <label htmlFor="assistant-question" className="sr-only">คำถามถึงผู้ช่วย</label>
              <textarea
                id="assistant-question"
                rows={3}
                value={draft}
                maxLength={200}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
                placeholder="เราควรจะทำงานไหนต่อให้เสร็จ?"
                className="w-full resize-none bg-transparent text-csmju-body text-ink placeholder:text-muted focus:outline-none"
              />
              <div className="flex justify-end">
                <SendButton disabled={!draft.trim() || busy} />
              </div>
            </div>
          </form>
          <ul className="mt-5 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => void ask(s)} className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-csmju-caption text-ink hover:bg-surface-muted">
                  {s}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-csmju-caption text-muted">ผู้ช่วยค้นจากคู่มือ เทมเพลต และงานของคุณใน CS Canvas เท่านั้น — ไม่ได้ใช้ AI ภายนอก</p>
        </div>
      )}

      {drawer && (
        <HistoryDrawer
          chats={chats}
          onClose={() => setDrawer(false)}
          onOpen={(id) => {
            setChatId(id);
            setDrawer(false);
          }}
          onNew={() => {
            setChatId(null);
            setDrawer(false);
          }}
          onDelete={(id) => {
            update((current) => current.filter((c) => c.id !== id));
            if (chatId === id) setChatId(null);
          }}
        />
      )}
    </div>
  );
}

function IconLink({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface/60">
      {children}
    </button>
  );
}

function SendButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label="ส่งคำถาม"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-inverse transition-colors hover:bg-primary-hover disabled:bg-surface-muted disabled:text-muted"
    >
      <ArrowUp aria-hidden className="size-5" />
    </button>
  );
}

/// ลิ้นชัก "แชทล่าสุด" (ภาพบรีฟ "Canva ai 1") — ค้นหา เปิด ลบ และทางลัดไปงาน/คลัง
function HistoryDrawer({
  chats,
  onClose,
  onOpen,
  onNew,
  onDelete,
}: {
  chats: Chat[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const shown = q.trim() ? chats.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())) : chats;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <aside aria-label="แชทล่าสุด" className="csmju-slide-in flex w-80 max-w-full flex-col bg-surface shadow-csmju-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-csmju-h3 font-bold text-ink">แชทล่าสุด</h2>
          <div className="flex">
            <IconLink label="เริ่มแชทใหม่" onClick={onNew}>
              <SquarePen aria-hidden className="size-5" />
            </IconLink>
            <IconLink label="ปิด" onClick={onClose}>
              <X aria-hidden className="size-5" />
            </IconLink>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <label htmlFor="chat-search" className="sr-only">ค้นหาแชทล่าสุด</label>
            <input id="chat-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาแชทล่าสุด" className="min-h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-csmju-caption text-ink focus:border-primary focus:outline-none" />
          </div>
          {shown.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-4 text-center">
              <p className="text-csmju-caption font-semibold text-ink">{q ? 'ไม่พบแชทที่ค้นหา' : 'แชททั้งหมดของคุณจะอยู่ที่นี่'}</p>
              <p className="mt-1 text-csmju-caption text-muted">เริ่มแชทใหม่แล้วถามเรื่องการใช้งาน CS Canvas ได้เลย · ประวัติเก็บในเครื่องนี้เท่านั้น</p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {shown.map((c) => (
                <li key={c.id} className="group flex items-center gap-1 rounded-xl hover:bg-surface-muted">
                  <button type="button" onClick={() => onOpen(c.id)} className="min-h-11 min-w-0 flex-1 px-3 py-2 text-left">
                    <span className="block truncate text-csmju-caption font-medium text-ink">{c.title}</span>
                    <span className="block text-csmju-caption text-muted">{relativeTime(c.updatedAt)}</span>
                  </button>
                  <button type="button" onClick={() => onDelete(c.id)} aria-label={`ลบแชท ${c.title}`} className="inline-flex size-11 items-center justify-center rounded-xl text-muted opacity-100 hover:text-danger md:opacity-0 md:group-hover:opacity-100">
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav aria-label="ทางลัด" className="border-t border-line p-2">
          <Link href="/projects" className={cx('flex min-h-12 items-center gap-3 rounded-xl px-3 text-csmju-body text-ink hover:bg-surface-muted')}>
            <SquareCheckBig aria-hidden className="size-6" /> งาน
          </Link>
          <Link href="/projects?view=uploads" className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-csmju-body text-ink hover:bg-surface-muted">
            <Images aria-hidden className="size-6" /> คลัง
          </Link>
        </nav>
      </aside>
      <button type="button" aria-label="ปิดแชทล่าสุด" onClick={onClose} className="flex-1 bg-inverse/40" />
    </div>
  );
}
