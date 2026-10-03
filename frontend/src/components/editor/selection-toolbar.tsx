'use client';

import { BringToFront, Copy, Lock, LockOpen, SendToBack, Trash2 } from 'lucide-react';
import { selectionBox, currentPage, useEditor } from '@/lib/editor/store';

/// แถบลอยเหนือชิ้นงานที่เลือก (ทำสำเนา · ล็อก · ลบ · ยกขึ้น/ส่งลง) แบบ Canva
///
/// คำนวณตำแหน่งจากกรอบของสิ่งที่เลือกในพิกัดจอ — อยู่เหนือกรอบ ถ้าชิดขอบบนเกินไปย้ายไปอยู่ใต้กรอบ
export function SelectionToolbar() {
  const selection = useEditor((s) => s.selection);
  const page = useEditor((s) => currentPage(s));
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const editing = useEditor((s) => s.editingTextId);

  if (selection.length === 0 || editing) return null;

  const box = selectionBox(page, selection);

  if (!box) return null;

  const selected = page.elements.filter((el) => selection.includes(el.id));
  const locked = selected.every((el) => el.locked);
  const centerX = pan.x + (box.x + box.width / 2) * zoom;
  const top = pan.y + box.y * zoom;
  const bottom = pan.y + (box.y + box.height) * zoom;
  const placeAbove = top > 120;
  const state = useEditor.getState;

  return (
    <div
      role="toolbar"
      aria-label="จัดการชิ้นงานที่เลือก"
      className="pointer-events-auto absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-csmju-lg"
      style={{ left: centerX, top: placeAbove ? top - 96 : bottom + 44 }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ToolButton label="ทำสำเนา (Ctrl+D)" onClick={() => state().duplicateSelected()}>
        <Copy aria-hidden className="size-5" />
      </ToolButton>
      <ToolButton label="ยกขึ้นหน้าสุด" onClick={() => state().reorderSelected('front')}>
        <BringToFront aria-hidden className="size-5" />
      </ToolButton>
      <ToolButton label="ส่งไปหลังสุด" onClick={() => state().reorderSelected('back')}>
        <SendToBack aria-hidden className="size-5" />
      </ToolButton>
      <ToolButton label={locked ? 'ปลดล็อก' : 'ล็อก'} onClick={() => state().updateElements(selection, () => ({ locked: !locked }))}>
        {locked ? <Lock aria-hidden className="size-5" /> : <LockOpen aria-hidden className="size-5" />}
      </ToolButton>
      <ToolButton label="ลบ (Delete)" onClick={() => state().removeSelected()} disabled={locked}>
        <Trash2 aria-hidden className="size-5" />
      </ToolButton>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}
