'use client';

import { useQuery } from '@tanstack/react-query';
import { LayoutTemplate } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '@/lib/csmju/api';
import { categoryLabel, designType as findDesignType, designTypeGroup, designTypeLabel, type DesignType } from '@/lib/design-types';
import { renderPageToCanvas } from '@/lib/editor/render';
import { normalizeDocument } from '@/lib/editor/types';
import { relativeTime } from '@/lib/format';
import type { DesignSummary, Template, TemplateSummary } from '@/lib/types';
import { cx } from '../csmju/primitives';
import { TypeArt } from './type-art';

/// ภาพย่อบนพื้นเทาอ่อนขอบมน (การ์ด "ดีไซน์ต่อ" ของ Canva)
/// ไม่มีภาพย่อ = ภาพประกอบของประเภทงาน
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
  const type = findDesignType(designType) ?? { key: designType, width, height, group: 'document' as const };

  return (
    <span className="flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted p-4 transition-colors group-hover:bg-primary-soft">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- ภาพย่อเป็น data URL จากฐานข้อมูล next/image ช่วยอะไรไม่ได้
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full rounded object-contain shadow-csmju-md"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      ) : (
        <TypeArt type={type} className="h-full w-full" />
      )}
    </span>
  );
}

/// จุดสีเล็กหน้าประเภทงาน (แบบไอคอนวงกลมเล็กใต้การ์ดของ Canva)
function TypeDot({ designType }: { designType: string }) {
  const group = designTypeGroup(designType);
  const Icon = group?.icon ?? LayoutTemplate;

  return (
    <span className={cx('inline-flex size-5 shrink-0 items-center justify-center rounded-full text-on-inverse', group?.tone ?? 'bg-chart-6')}>
      <Icon aria-hidden className="size-3" />
    </span>
  );
}

export function DesignCard({ design, menu, href }: { design: DesignSummary; menu?: ReactNode; href?: string }) {
  const body = (
    <>
      <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt={`ภาพย่อของ ${design.title}`} />
      <span className="mt-2 block truncate text-csmju-caption font-semibold text-ink">{design.title}</span>
      <span className="flex items-center gap-1.5 text-csmju-caption text-muted">
        <TypeDot designType={design.designType} />
        <span className="truncate">
          {designTypeLabel(design.designType).replace(/\s*\(.*\)$/, '')} • แก้ไข {relativeTime(design.updatedAt)}
        </span>
      </span>
    </>
  );

  return (
    <div className="group relative">
      {href ? (
        <Link href={href} className="block rounded-xl">
          {body}
        </Link>
      ) : (
        <div>{body}</div>
      )}
      {menu && <div className="absolute top-2 right-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">{menu}</div>}
    </div>
  );
}

/// ไทล์ประเภทงาน: ภาพประกอบบนพื้นเทา + ชื่อด้านล่าง (แถว "ใช้บ่อย" "ยอดนิยม")
export function TypeTile({ type, onClick, disabled }: { type: DesignType; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group block w-full text-left disabled:opacity-60">
      <span className="flex aspect-4/3 w-full items-center justify-center rounded-xl bg-surface-muted p-3 transition-colors group-hover:bg-primary-soft">
        <TypeArt type={type} className="h-full w-full" />
      </span>
      <span className="mt-2 block truncate text-csmju-caption text-ink">{type.label}</span>
    </button>
  );
}

/// การ์ดเทมเพลตขนาดใหญ่ (แถว "เทมเพลตสำหรับคุณ") — ภาพเต็มกรอบขอบมน
export function TemplateCard({
  template,
  onUse,
  footer,
  size = 'md',
}: {
  template: TemplateSummary;
  onUse: () => void;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const rendered = useRenderedPreview(template);
  const src = template.thumbnail ?? rendered ?? null;

  return (
    <div className="group">
      <button type="button" onClick={onUse} className="block w-full text-left" aria-label={`ใช้เทมเพลต ${template.title}`}>
        {size === 'lg' ? (
          <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-muted transition-shadow group-hover:shadow-csmju-lg">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- ภาพตัวอย่างวาดจาก canvas ในเครื่อง
              <img src={src} alt={`ตัวอย่างเทมเพลต ${template.title}`} className="h-full w-full object-contain" />
            ) : (
              <TypeArt type={findDesignType(template.designType) ?? { key: template.designType, width: template.width, height: template.height, group: 'document' }} className="h-2/3 w-2/3" />
            )}
          </span>
        ) : (
          <Thumbnail src={src} width={template.width} height={template.height} designType={template.designType} alt={`ตัวอย่างเทมเพลต ${template.title}`} />
        )}
        <span className="mt-2 block truncate text-csmju-caption font-semibold text-ink">{template.title}</span>
        <span className="block truncate text-csmju-caption text-muted">
          {categoryLabel(template.category)} • ใช้แล้ว {template.usageCount.toLocaleString('th-TH')} ครั้ง
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
      const scale = Math.min(1, 640 / Math.max(full.width, full.height));
      const canvas = await renderPageToCanvas(doc.pages[0], { width: full.width, height: full.height }, scale, {
        background: doc.pages[0].background ? undefined : 'rgb(255 255 255)',
      });

      return canvas.toDataURL('image/jpeg', 0.85);
    },
    enabled: !template.thumbnail,
    staleTime: Infinity,
  });

  return data;
}
