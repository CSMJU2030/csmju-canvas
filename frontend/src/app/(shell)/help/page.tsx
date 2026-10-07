import type { Metadata } from 'next';
import Link from 'next/link';
import { HELP_ARTICLES } from '@/lib/help-articles';

export const metadata: Metadata = { title: 'คู่มือการใช้งาน' };

export default function HelpIndexPage() {
  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="text-csmju-h1 font-bold text-ink">คู่มือการใช้งาน</h1>
      <p className="mt-1 text-csmju-body text-muted">ทุกเรื่องที่ทำได้ใน CS Canvas · ถามผู้ช่วยได้จากปุ่ม ? มุมขวาล่าง</p>
      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {HELP_ARTICLES.map((article) => (
          <li key={article.slug}>
            <Link href={`/help/${article.slug}`} className="block rounded-2xl border border-line p-4 hover:bg-surface-muted">
              <span className="block text-csmju-body font-semibold text-ink">{article.title}</span>
              <span className="block text-csmju-caption text-muted">{article.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
