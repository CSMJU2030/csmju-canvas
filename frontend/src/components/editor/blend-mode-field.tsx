'use client';

import { useId } from 'react';
import { inputClass } from '@/components/csmju/primitives';
import { BLEND_MODES, isBlendMode } from '@/lib/editor/blend';
import { useEditor } from '@/lib/editor/store';
import type { CanvasElement } from '@/lib/editor/types';

/// โหมดผสมสีของชิ้นงานที่เลือก (อยู่ในกล่อง "ความโปร่งใส" ของทุกชนิด)
export function BlendModeField({ els }: { els: CanvasElement[] }) {
  const id = useId();
  const ids = els.filter((el) => !el.locked).map((el) => el.id);
  const first = els[0]?.blendMode ?? 'normal';
  const mixed = els.some((el) => (el.blendMode ?? 'normal') !== first);

  return (
    <div className="mt-4 flex flex-col gap-1">
      <label htmlFor={id} className="text-csmju-caption text-ink">
        โหมดผสมสี
      </label>
      <select
        id={id}
        value={mixed ? '' : first}
        disabled={ids.length === 0}
        onChange={(event) => {
          const value = event.target.value;

          if (!isBlendMode(value)) return;
          useEditor.getState().updateElements(ids, () => ({ blendMode: value === 'normal' ? null : value }));
        }}
        className={inputClass}
      >
        {mixed && (
          <option value="" disabled>
            หลายแบบ
          </option>
        )}
        {BLEND_MODES.map((mode) => (
          <option key={mode.key} value={mode.key}>
            {mode.label}
          </option>
        ))}
      </select>
      <p className="text-csmju-caption text-muted">ผสมสีกับสิ่งที่อยู่ข้างล่าง เช่น “คูณ” ให้พื้นขาวหายไป · “สกรีน” ให้พื้นดำหายไป</p>
    </div>
  );
}
