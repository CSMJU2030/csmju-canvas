'use client';

import { Music } from 'lucide-react';
import { cx } from '@/components/csmju/primitives';
import type { Asset } from '@/lib/types';

/// ภาพตัวอย่างของไฟล์อัปโหลดทุกชนิด: รูป = รูปจริง · วิดีโอ = เฟรมแรก · เสียง = ไอคอนโน้ตเพลง
///
/// `className` ใช้กับรูปและวิดีโอ (ขนาด/การจัดวาง) · ไฟล์ผ่าน API ที่ต้องมี session ของผู้ใช้
export function AssetPreview({ asset, className, alt = '', iconClassName = 'size-6' }: { asset: Pick<Asset, 'contentUrl' | 'mimeType' | 'fileName'>; className?: string; alt?: string; iconClassName?: string }) {
  if (asset.mimeType.startsWith('video/')) {
    return <video src={`${asset.contentUrl}#t=0.1`} preload="metadata" muted playsInline aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={cx('pointer-events-none', className)} />;
  }

  if (asset.mimeType.startsWith('audio/')) {
    return (
      <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className="flex size-full items-center justify-center bg-linear-to-br from-type-red to-type-pink text-on-inverse">
        <Music aria-hidden className={iconClassName} />
      </span>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session
  return <img src={asset.contentUrl} alt={alt} loading="lazy" className={className} />;
}
