'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, CircleHelp, PanelRight, PanelRightClose, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { answerQuestion, type AssistantAnswer } from '@/lib/assistant';
import { cx } from '../csmju/primitives';
import { AnswerBubble, Typing } from './assistant-answer';

interface Turn {
  id: number;
  question: string;
  answer: AssistantAnswer | null;
}

export const SUGGESTIONS = ['เริ่มสร้างงานใหม่', 'ดาวน์โหลด png โปร่งใส', 'แชร์ดีไซน์ให้เพื่อน', 'กู้คืนงานจากถังขยะ', 'คีย์ลัด'];

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

    const answer = await answerQuestion(q, queryClient);

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
        // มือถือมีแท็บ "ผู้ช่วย" ที่แถบล่างแทนปุ่มนี้
        className="group fixed right-4 bottom-6 z-30 hidden size-14 items-center justify-center rounded-full bg-primary text-on-inverse shadow-csmju-lg hover:bg-primary-hover md:inline-flex"
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
