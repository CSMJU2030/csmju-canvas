'use client';

import { useQuery } from '@tanstack/react-query';
import { LayoutTemplate } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { categoryLabel, designTypeGroup, designTypeLabel } from '@/lib/design-types';
import { relativeTime } from '@/lib/format';
import { api } from '@/lib/csmju/api';
import { renderPageToCanvas } from '@/lib/editor/render';
import { normalizeDocument } from '@/lib/editor/types';
import type { DesignSummary, Template, TemplateSummary } from '@/lib/types';
import { cx } from '../csmju/primitives';

/// ภาพย่อในกรอบสีพื้นอ่อน · ไม่มีภาพย่อ = ไอคอนประเภทงาน
export function Thumbnail({
  src,
  width,
  height,
  designType,
  alt,
}: {
  src: string | null;
  width: number;
  height: number;
  designType: string;
  alt: string;
}) {
  const group = designTypeGroup(designType);
  const Icon = group?.icon ?? LayoutTemplate;

  return (
    <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted p-3">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- ภาพย่อเป็น data URL จากฐานข้อมูล next/image ช่วยอะไรไม่ได้
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full rounded-md object-contain shadow-csmju-sm"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      ) : (
        <Icon aria-hidden className="size-8 text-muted" />
      )}
    </span>
  );
}

export function DesignCard({ design, menu, href }: { design: DesignSummary; menu?: ReactNode; href?: string }) {
  const body = (
    <>
      <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt={`ภาพย่อของ ${design.title}`} />
      <span className="mt-2 block truncate text-csmju-caption font-semibold text-ink">{design.title}</span>
      <span className="block truncate text-csmju-caption text-muted">
        {designTypeLabel(design.designType)} · แก้ไข {relativeTime(design.updatedAt)}
      </span>
    </>
  );

  return (
    <div className="group relative rounded-2xl p-2 hover:bg-surface">
      {href ? (
        <Link href={href} className="block rounded-xl">
          {body}
        </Link>
      ) : (
        <div>{body}</div>
      )}
      {menu && <div className="absolute top-3 right-3">{menu}</div>}
    </div>
  );
}

export function TemplateCard({ template, onUse, footer }: { template: TemplateSummary; onUse: () => void; footer?: ReactNode }) {
  const rendered = useRenderedPreview(template);

  return (
    <div className={cx('rounded-2xl p-2 hover:bg-surface')}>
      <button type="button" onClick={onUse} className="block w-full text-left" aria-label={`ใช้เทมเพลต ${template.title}`}>
        <Thumbnail
          src={template.thumbnail ?? rendered ?? null}
          width={template.width}
          height={template.height}
          designType={template.designType}
          alt={`ตัวอย่างเทมเพลต ${template.title}`}
        />
        <span className="mt-2 block truncate text-csmju-caption font-semibold text-ink">{template.title}</span>
        <span className="block truncate text-csmju-caption text-muted">
          {categoryLabel(template.category)} · ใช้แล้ว {template.usageCount.toLocaleString('th-TH')} ครั้ง
        </span>
      </button>
      {footer}
    </div>
  );
}

/// เทมเพลตตั้งต้นจาก seed ไม่มีภาพย่อ (หลังบ้านวาดรูปไม่ได้) — วาดหน้าแรกจาก JSON state ในเบราว์เซอร์แทน
function useRenderedPreview(template: TemplateSummary): string | undefined {
  const { data } = useQuery({
    queryKey: ['template-preview', template.id, template.updatedAt],
    queryFn: async () => {
      const full = await api.get<Template>(`/templates/${template.id}`);
      const doc = normalizeDocument(full.document);
      const scale = Math.min(1, 480 / Math.max(full.width, full.height));
      const canvas = await renderPageToCanvas(doc.pages[0], { width: full.width, height: full.height }, scale, {
        background: doc.pages[0].background ? undefined : 'rgb(255 255 255)',
      });

      return canvas.toDataURL('image/jpeg', 0.8);
    },
    enabled: !template.thumbnail,
    staleTime: Infinity,
  });

  return data;
}
