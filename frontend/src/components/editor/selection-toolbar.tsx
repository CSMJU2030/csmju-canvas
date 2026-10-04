'use client';

import { Copy, Ellipsis, Lock, LockOpen, Trash2 } from 'lucide-react';
import { selectionBox, currentPage, useEditor } from '@/lib/editor/store';
import { useEditorUi } from '@/lib/editor/ui-store';

/// แถบลอยใต้/เหนือชิ้นงานที่เลือก (ล็อก · ทำสำเนา · ลบ · …) แบบ Canva
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
  // อยู่ใต้กรอบเป็นหลักแบบ Canva · ถ้าชิดขอบล่างเกินไปย้ายไปไว้เหนือกรอบ
  const container = typeof document !== 'undefined' ? document.querySelector('canvas[aria-label^="ผืนผ้าใบ"]')?.clientHeight ?? 800 : 800;
  const placeAbove = bottom + 120 > container && top > 140;
  const state = useEditor.getState;

  return (
    <div
      role="toolbar"
      aria-label="จัดการชิ้นงานที่เลือก"
      className="pointer-events-auto absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-csmju-lg"
      style={{ left: centerX, top: placeAbove ? top - 104 : bottom + 40 }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ToolButton label={locked ? 'ปลดล็อก (Alt+Shift+L)' : 'ล็อก (Alt+Shift+L)'} onClick={() => state().updateElements(selection, () => ({ locked: !locked }))}>
        {locked ? <Lock aria-hidden className="size-5" /> : <LockOpen aria-hidden className="size-5" />}
      </ToolButton>
      <ToolButton label="ทำสำเนา (Ctrl+D)" onClick={() => state().duplicateSelected()}>
        <Copy aria-hidden className="size-5" />
      </ToolButton>
      <ToolButton label="ลบ (Delete)" onClick={() => state().removeSelected()} disabled={locked}>
        <Trash2 aria-hidden className="size-5" />
      </ToolButton>
      <ToolButton
        label="ตัวเลือกเพิ่มเติม"
        onClick={(event) => {
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

          useEditorUi.getState().openContextMenu({ x: rect.left, y: rect.bottom + 6 });
        }}
      >
        <Ellipsis aria-hidden className="size-5" />
      </ToolButton>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: (event: React.MouseEvent) => void; disabled?: boolean; children: React.ReactNode }) {
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
