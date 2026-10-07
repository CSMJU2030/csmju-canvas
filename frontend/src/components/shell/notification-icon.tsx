import { ArchiveRestore, Flag, LayoutTemplate, MessageCircle, ShieldAlert, Trash2 } from 'lucide-react';
import type { NotificationItem } from '@/lib/types';

/// ไอคอนของการแจ้งเตือนแต่ละชนิด (ป๊อปอัปแจ้งเตือนบนแถบซ้าย)
export function NotificationIcon({ kind }: { kind: NotificationItem['kind'] }) {
  const Icon =
    kind === 'TEMPLATE_USED'
      ? LayoutTemplate
      : kind === 'COMMENT_ADDED'
        ? MessageCircle
        : kind === 'REPORT_UPDATED'
          ? Flag
          : kind === 'CONTENT_MODERATED'
            ? ShieldAlert
            : kind === 'DESIGN_RESTORED'
              ? ArchiveRestore
              : Trash2;

  return <Icon aria-hidden className="size-5" />;
}
