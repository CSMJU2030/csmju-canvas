'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, Type, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { ErrorState, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { FONT_ACCEPT, planImport } from '@/lib/editor/file-import';
import { assetFontId, ensureFont, userFontName, useUserFonts } from '@/lib/editor/fonts';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import type { Asset } from '@/lib/types';
import { FontName } from './font-picker';
import { useMyFonts } from './use-my-fonts';

/// "ฟอนต์ของฉัน": ฟอนต์ที่ผู้ใช้อัปโหลดเอง (Canva ให้เฉพาะแบบเสียเงิน — ที่นี่ฟรี) · เก็บเป็น asset ชนิด font/*
/// นับรวมในพื้นที่ของผู้ใช้ · ข้อความอ้างด้วย `fontFamily: "asset:<uuid>"` (ดู docs/design-document.md)

/// ข้อความที่เลือกอยู่และแก้ได้ (ไม่ล็อก)
function selectedTextIds(): string[] {
  const state = useEditor.getState();

  return currentPage(state)
    .elements.filter((el) => el.type === 'text' && !el.locked && state.selection.includes(el.id))
    .map((el) => el.id);
}

/// ใช้ฟอนต์กับข้อความที่เลือก (โหลดไฟล์ฟอนต์ก่อน ไม่งั้นผืนผ้าใบวาดด้วยฟอนต์สำรองหนึ่งเฟรม)
export async function applyFontToSelection(fontId: string): Promise<number> {
  const ids = selectedTextIds();

  if (ids.length === 0 || !canEditDoc(useEditor.getState())) return 0;

  await Promise.all([ensureFont(fontId, 400), ensureFont(fontId, 700)]);
  useEditor.getState().updateElements(ids, () => ({ fontFamily: fontId }));

  return ids.length;
}

/// อัปโหลดไฟล์ฟอนต์ (เลือกจากเครื่อง ลากมาวาง หรือวางจากคลิปบอร์ด) · apply = ใช้กับข้อความที่เลือกอยู่ทันที
export function useUploadFonts() {
  const toast = useToast();
  const queryClient = useQueryClient();

  return async (files: File[], options: { apply?: boolean } = {}): Promise<Asset[]> => {
    const done: Asset[] = [];

    for (const file of files) {
      const plan = planImport(file);

      if (plan.kind !== 'font') {
        toast(plan.kind === 'unsupported' ? plan.reason : `“${file.name}” ไม่ใช่ไฟล์ฟอนต์ (TTF, OTF, WOFF, WOFF2)`, 'error');
        continue;
      }

      try {
        done.push(await api.upload<Asset>('/assets', file));
      } catch (error) {
        toast(`${file.name}: ${errorMessage(error)}`, 'error');
      }
    }

    if (done.length === 0) return done;

    useUserFonts.getState().setNames(done);
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['quotas'] });

    const applied = options.apply ? await applyFontToSelection(assetFontId(done[done.length - 1].id)) : 0;
    const name = userFontName(done[done.length - 1].fileName);

    toast(
      applied > 0
        ? `เพิ่มฟอนต์ “${name}” แล้ว และใช้กับข้อความที่เลือก`
        : done.length > 1
          ? `เพิ่ม ${done.length} ฟอนต์ใน “ฟอนต์ของฉัน” แล้ว`
          : `เพิ่มฟอนต์ “${name}” ใน “ฟอนต์ของฉัน” แล้ว · เลือกข้อความแล้วกดชื่อฟอนต์เพื่อใช้`,
    );

    return done;
  };
}

/// ส่วน "ฟอนต์ของฉัน" ในแผงฟอนต์
export function MyFontsSection({ current, canApply, onApply }: { current: string | undefined; canApply: boolean; onApply: (fontId: string) => void }) {
  const fonts = useMyFonts();
  const upload = useUploadFonts();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const send = async (files: File[]) => {
    if (files.length === 0) return;

    setBusy(true);

    try {
      await upload(files, { apply: canApply });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="ฟอนต์ของฉัน"
      className={cx('mx-2 mt-2 rounded-2xl border p-3', over ? 'border-primary bg-primary-soft' : 'border-line bg-surface-muted')}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
        void send(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-csmju-caption font-bold text-ink">ฟอนต์ของฉัน</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
        >
          <Upload aria-hidden className="size-4" /> {busy ? 'กำลังอัปโหลด…' : 'อัปโหลดฟอนต์'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FONT_ACCEPT}
          aria-label="เลือกไฟล์ฟอนต์จากเครื่อง"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);

            event.target.value = '';
            void send(files);
          }}
        />
      </div>
      {fonts.isLoading ? (
        <Spinner label="กำลังโหลดฟอนต์ของฉัน…" />
      ) : fonts.isError ? (
        <div className="mt-2">
          <ErrorState message={errorMessage(fonts.error)} onRetry={() => void fonts.refetch()} />
        </div>
      ) : fonts.data!.items.length === 0 ? (
        <p className="mt-2 flex gap-2 text-csmju-caption text-body">
          <Type aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>อัปโหลดฟอนต์ของคุณเอง (TTF, OTF, WOFF, WOFF2 ไม่เกิน 5 MB) หรือลากไฟล์มาวางที่นี่ · ใช้ได้ฟรี ตรวจสัญญาอนุญาตของฟอนต์ก่อนเผยแพร่งาน</span>
        </p>
      ) : (
        <ul className="mt-1">
          {fonts.data!.items.map((asset) => {
            const id = assetFontId(asset.id);

            return (
              <li key={asset.id}>
                <button
                  type="button"
                  disabled={!canApply}
                  onClick={() => onApply(id)}
                  aria-pressed={id === current}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface disabled:opacity-50"
                >
                  <FontName id={id} label={userFontName(asset.fileName)} className="flex-1 truncate text-csmju-body text-ink" />
                  <span className="text-csmju-caption text-muted">ของฉัน</span>
                  {id === current && <Check aria-hidden className="size-5 text-ink" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
