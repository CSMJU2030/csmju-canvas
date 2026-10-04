import { BookOpen, LayoutTemplate, Palette } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AssistantAnswer } from '@/lib/assistant';

/// จุดกระพริบระหว่างค้นคำตอบ (ใช้ทั้งปุ่ม ? และหน้าผู้ช่วยเต็มจอ)
export function Typing() {
  return (
    <span role="status" aria-label="กำลังค้นหาคำตอบ" className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden className="size-2 animate-bounce rounded-full bg-muted motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

export function AnswerBubble({ question, answer, onNavigate }: { question: string; answer: AssistantAnswer; onNavigate: () => void }) {
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
