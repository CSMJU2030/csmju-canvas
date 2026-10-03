'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/// แถวการ์ดเลื่อนแนวนอนพร้อมปุ่มลูกศรวงกลมสีขาวแบบ Canva
/// ลูกศรโผล่เฉพาะฝั่งที่ยังเลื่อนต่อได้ · มือถือใช้นิ้วปัดได้ตามปกติ
export function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = ref.current;

    if (!el) return;

    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;

    update();

    const observer = new ResizeObserver(update);

    observer.observe(el);
    el.addEventListener('scroll', update, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [update]);

  const scroll = (direction: 1 | -1) => {
    const el = ref.current;

    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <ul ref={ref} aria-label={label} className="csmju-scroll-x flex snap-x gap-4 overflow-x-auto scroll-smooth pb-1">
        {children}
      </ul>
      {!edges.start && (
        <ArrowButton side="left" onClick={() => scroll(-1)} label={`เลื่อน${label}ไปทางซ้าย`}>
          <ChevronLeft aria-hidden className="size-5" />
        </ArrowButton>
      )}
      {!edges.end && (
        <ArrowButton side="right" onClick={() => scroll(1)} label={`เลื่อน${label}ไปทางขวา`}>
          <ChevronRight aria-hidden className="size-5" />
        </ArrowButton>
      )}
    </div>
  );
}

function ArrowButton({ side, onClick, label, children }: { side: 'left' | 'right'; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-csmju-md hover:bg-surface-muted md:inline-flex ${side === 'left' ? '-left-3' : '-right-3'}`}
    >
      {children}
    </button>
  );
}
