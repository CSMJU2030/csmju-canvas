import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HELP_ARTICLES } from '@/lib/help-articles';

export function generateStaticParams() {
  return HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  return { title: HELP_ARTICLES.find((a) => a.slug === slug)?.title ?? 'คู่มือ' };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = HELP_ARTICLES.find((a) => a.slug === slug);

  if (!article) notFound();

  return (
    <article className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <Link href="/help" className="inline-flex min-h-11 items-center text-csmju-caption font-medium text-primary hover:underline">
        ← คู่มือทั้งหมด
      </Link>
      <h1 className="mt-2 text-csmju-h1 font-bold text-ink">{article.title}</h1>
      <p className="mt-1 text-csmju-body text-muted">{article.summary}</p>
      <ol className="mt-6 list-decimal space-y-3 pl-6 text-csmju-body text-body">
        {article.body.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      {article.action && (
        <Link
          href={article.action.href}
          className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-csmju-caption font-medium text-on-inverse hover:bg-primary-hover"
        >
          {article.action.label}
        </Link>
      )}
    </article>
  );
}
