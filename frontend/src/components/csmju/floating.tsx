'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/// เมนูลอยที่ผูกกับปุ่ม แต่วาดที่ <body> (portal) ด้วยตำแหน่ง fixed
///
/// เหตุผล: แผ่นเนื้อหาหลักตัดขอบ (overflow-hidden) เมนูของการ์ดที่ชิดขอบจึงโดนตัดหรือโดนแถบรองทับ
/// (ภาพบรีฟ "เหมือนมันทับซ้อน") · ตำแหน่งเขียนลง style ของ DOM ตรง ๆ ไม่ผ่าน state
/// เพื่อไม่ต้อง render ใหม่ทุกครั้งที่เลื่อนหน้า
export function useAnchoredMenu(align: 'start' | 'end' = 'end') {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;

      if (!anchor || !menu) return;

      const rect = anchor.getBoundingClientRect();
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const gap = 4;
      const fitsBelow = window.innerHeight - rect.bottom >= height + gap + 8;
      const top = fitsBelow || rect.top < height + gap + 8 ? rect.bottom + gap : rect.top - height - gap;
      const preferred = align === 'end' ? rect.right - width : rect.left;
      const left = Math.min(Math.max(8, preferred), window.innerWidth - width - 8);

      menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
      menu.style.left = `${left}px`;
      menu.style.visibility = 'visible';
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!anchorRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        anchorRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, anchorRef, menuRef };
}

/// กล่องเมนูที่ลอยอยู่ชั้นบนสุด — ใช้คู่กับ useAnchoredMenu
export function FloatingPanel({
  open,
  menuRef,
  className,
  children,
  label,
}: {
  open: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
  label: string;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
      className={`csmju-pop z-50 ${className ?? ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
