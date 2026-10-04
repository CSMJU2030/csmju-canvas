'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, BookOpen, CircleHelp, LayoutTemplate, Palette, PanelRight, PanelRightClose, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, qs } from '@/lib/csmju/api';
import { searchHelp, type HelpArticle } from '@/lib/help-articles';
import type { DesignSummary, TemplateSummary } from '@/lib/types';
import { cx } from '../csmju/primitives';

interface Answer {
  articles: HelpArticle[];
  templates: TemplateSummary[];
  designs: DesignSummary[];
  failed: boolean;
}

interface Turn {
  id: number;
  question: string;
  answer: Answer | null;
}

const SUGGESTIONS = ['เริ่มสร้างงานใหม่', 'ดาวน์โหลด png โปร่งใส', 'แชร์ดีไซน์ให้เพื่อน', 'กู้คืนงานจากถังขยะ', 'คีย์ลัด'];

/// ผู้ช่วย CS Canvas (ปุ่ม ?) — หน้าตาตามภาพบรีฟ "AI" และ "AI 1.1"
///
/// ตอบด้วยการค้นจากคู่มือ เทมเพลต และงานของผู้ใช้จริงในระบบ ไม่ส่งคำถามออกนอกระบบ
/// และไม่ใช้ LLM (การตัดสินใจของ PL 4 ต.ค. 2569) · คำถามนอกเรื่องได้คำตอบตรง ๆ ว่าช่วยได้แค่เรื่องใด
export function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [docked, setDocked] = useState(false);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  // เปิดจากเมนูบัญชี → ความช่วยเหลือและฟีดแบ็ก → ผู้ช่วย
  useEffect(() => {
    const openHelp = () => setOpen(true);

    window.addEventListener('csmju:open-help', openHelp);

    return () => window.removeEventListener('csmju:open-help', openHelp);
  }, []);

  useEffect(() => {
    if (!open) return;

    inputRef.current?.focus();

    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const ask = async (question: string) => {
    const q = question.trim();

    if (!q || busy) return;

    nextId.current += 1;

    const id = nextId.current;

    setDraft('');
    setBusy(true);
    setTurns((current) => [...current, { id, question: q, answer: null }]);

    let answer: Answer;

    try {
      const [templates, designs] = await Promise.all([
        queryClient.fetchQuery({ queryKey: ['help', 'templates', q], queryFn: () => api.list<TemplateSummary>(`/templates${qs({ q, limit: 4 })}`) }),
        queryClient.fetchQuery({ queryKey: ['help', 'designs', q], queryFn: () => api.list<DesignSummary>(`/designs${qs({ q, limit: 4 })}`) }),
      ]);

      answer = { articles: searchHelp(q, 3), templates: templates.items, designs: designs.items, failed: false };
    } catch {
      answer = { articles: searchHelp(q, 3), templates: [], designs: [], failed: true };
    }

    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
    setBusy(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="help-panel"
        aria-label="ผู้ช่วย CS Canvas"
        title="ผู้ช่วย CS Canvas"
        className="group fixed right-4 bottom-20 z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-on-inverse shadow-csmju-lg hover:bg-primary-hover md:bottom-6"
      >
        {open ? <X aria-hidden className="size-6" /> : <CircleHelp aria-hidden className="csmju-wiggle size-7" />}
      </button>

      {open && (
        <section
          id="help-panel"
          role="dialog"
          aria-label="ผู้ช่วย CS Canvas"
          className={cx(
            'csmju-pop fixed z-40 flex w-100 max-w-full flex-col overflow-hidden border border-line bg-surface shadow-csmju-lg',
            docked ? 'top-2 right-2 bottom-2 rounded-3xl' : 'right-4 bottom-36 h-160 max-h-popover rounded-3xl md:bottom-24',
          )}
        >
          {/* พื้นหลังไล่สีด้านบนแบบในภาพบรีฟ */}
          <div aria-hidden className="csmju-hero pointer-events-none absolute inset-x-0 top-0 h-72" />

          <div className="relative flex items-center justify-between px-3 pt-3">
            <button
              type="button"
              onClick={() => setDocked((v) => !v)}
              aria-label={docked ? 'ย่อเป็นหน้าต่างลอย' : 'ขยายเป็นแผงเต็มความสูง'}
              title={docked ? 'ย่อเป็นหน้าต่างลอย' : 'ขยายเป็นแผงเต็มความสูง'}
              className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface/60"
            >
              {docked ? <PanelRightClose aria-hidden className="size-5" /> : <PanelRight aria-hidden className="size-5" />}
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิดผู้ช่วย" title="ปิด" className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface/60">
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-4" aria-live="polite">
            {turns.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
                <h2 className="text-csmju-h1 leading-snug font-bold text-ink">
                  <span className="csmju-gradient-text">ขอความช่วยเหลือ</span>เกี่ยวกับ CS Canvas ได้ทุกเรื่อง
                </h2>
                <p className="mt-2 text-csmju-caption text-muted">ค้นคำตอบจากคู่มือ เทมเพลต และงานของคุณได้ทันที</p>
                <ul className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => void ask(s)} className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-csmju-caption text-ink hover:bg-surface-muted">
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="flex flex-col gap-4 pt-4">
                {turns.map((turn) => (
                  <li key={turn.id} className="flex flex-col gap-3">
                    <p className="csmju-fade-in max-w-4/5 self-end rounded-2xl rounded-br-md bg-primary px-4 py-2 text-csmju-caption text-on-inverse">{turn.question}</p>
                    {turn.answer ? <AnswerBubble question={turn.question} answer={turn.answer} onNavigate={() => setOpen(false)} /> : <Typing />}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <form onSubmit={submit} className="relative px-4 pb-2">
            <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-surface py-1.5 pr-1.5 pl-4 focus-within:border-primary">
              <label htmlFor="help-question" className="sr-only">คำถาม</label>
              <input
                id="help-question"
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="อยากให้ฉันช่วยอะไรบ้าง?"
                maxLength={200}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-csmju-caption text-ink placeholder:text-muted focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                aria-label="ส่งคำถาม"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-inverse transition-colors hover:bg-primary-hover disabled:bg-surface-muted disabled:text-muted"
              >
                <ArrowUp aria-hidden className="size-5" />
              </button>
            </div>
          </form>
          <p className="relative px-4 pb-3 text-center text-csmju-caption text-muted">ผู้ช่วยค้นจากข้อมูลใน CS Canvas เท่านั้น ไม่ได้ใช้ AI ภายนอก · ตรวจรายละเอียดในคู่มืออีกครั้ง</p>
        </section>
      )}
    </>
  );
}

function Typing() {
  return (
    <span role="status" aria-label="กำลังค้นหาคำตอบ" className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden className="size-2 animate-bounce rounded-full bg-muted motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

function AnswerBubble({ question, answer, onNavigate }: { question: string; answer: Answer; onNavigate: () => void }) {
  const top = answer.articles[0];
  const nothing = answer.articles.length === 0 && answer.templates.length === 0 && answer.designs.length === 0;

  return (
    <div className="csmju-fade-in flex max-w-full flex-col gap-3 self-start rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3 text-csmju-caption text-ink">
      {nothing ? (
        <p>
          ไม่พบคำตอบสำหรับ “{question}” — ผู้ช่วยตอบได้เฉพาะเรื่องการใช้งาน CS Canvas เทมเพลต และงานของคุณ ลองถามเช่น “ดาวน์โหลด png” หรือ “แชร์ดีไซน์”
          {answer.failed && ' (ค้นเทมเพลตและงานไม่สำเร็จ ลองอีกครั้ง)'}
        </p>
      ) : (
        <>
          {top && (
            <div>
              <p className="font-semibold">{top.title}</p>
              <p className="mt-1 text-body">{top.body[0]}</p>
            </div>
          )}
          {answer.articles.length > 0 && (
            <Group icon={<BookOpen aria-hidden className="size-4" />} title="คู่มือที่เกี่ยวข้อง">
              {answer.articles.map((a) => (
                <ResultLink key={a.slug} href={`/help/${a.slug}`} title={a.title} onNavigate={onNavigate} />
              ))}
            </Group>
          )}
          {answer.templates.length > 0 && (
            <Group icon={<LayoutTemplate aria-hidden className="size-4" />} title="เทมเพลต">
              {answer.templates.map((t) => (
                <ResultLink key={t.id} href={`/templates?q=${encodeURIComponent(t.title)}`} title={t.title} onNavigate={onNavigate} />
              ))}
            </Group>
          )}
          {answer.designs.length > 0 && (
            <Group icon={<Palette aria-hidden className="size-4" />} title="งานของคุณ">
              {answer.designs.map((d) => (
                <ResultLink key={d.id} href={`/design/${d.id}`} title={d.title} onNavigate={onNavigate} />
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-muted">
        {icon}
        {title}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function ResultLink({ href, title, onNavigate }: { href: string; title: string; onNavigate: () => void }) {
  return (
    <li>
      <Link href={href} onClick={onNavigate} className="flex min-h-11 items-center rounded-lg px-2 text-primary underline-offset-2 hover:bg-surface hover:underline">
        {title}
      </Link>
    </li>
  );
}
