'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/csmju/api';
import { thumbnailOf } from '@/lib/editor/export';
import { useEditor } from '@/lib/editor/store';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

const DEBOUNCE_MS = 1200;

/// บันทึกอัตโนมัติ: รอให้หยุดแก้ 1.2 วินาทีแล้ว PATCH ทั้งก้อน (JSON state + ขนาด + ภาพย่อ)
///
/// ระหว่างบันทึกถ้ามีการแก้เพิ่ม จะบันทึกซ้ำอีกรอบเมื่อรอบแรกเสร็จ — ไม่ส่งพร้อมกันสองคำขอ
/// เพราะคำขอที่มาถึงทีหลังอาจเป็นข้อมูลเก่ากว่า
export function useAutosave(needsThumbnail = false) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const saving = useRef(false);
  const savedRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    savedRevision.current = useEditor.getState().revision;

    const save = async () => {
      if (saving.current) return;

      const state = useEditor.getState();
      const revision = state.revision;

      if (revision === savedRevision.current || !state.designId || state.access === 'VIEW') return;

      saving.current = true;
      setStatus('saving');

      try {
        const thumbnail = await thumbnailOf(state.doc.pages[0], { width: state.baseWidth, height: state.baseHeight }).catch(
          () => undefined,
        );

        await api.patch(`/designs/${state.designId}`, {
          document: state.doc,
          width: state.baseWidth,
          height: state.baseHeight,
          ...(thumbnail ? { thumbnail } : {}),
        });
        savedRevision.current = revision;
        setStatus(useEditor.getState().revision === revision ? 'saved' : 'pending');
      } catch {
        setStatus('error');
      } finally {
        saving.current = false;

        if (useEditor.getState().revision !== savedRevision.current) schedule();
      }
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
    };

    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.revision !== prev.revision && state.revision !== savedRevision.current) {
        setStatus('pending');
        schedule();
      }
    });

    // ปิดแท็บระหว่างที่ยังไม่บันทึก — ให้เบราว์เซอร์ถามก่อน
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (useEditor.getState().revision !== savedRevision.current) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', beforeUnload);

    // งานที่สร้างจากเทมเพลตตั้งต้นยังไม่มีภาพย่อ — บันทึกหนึ่งครั้งเพื่อสร้างภาพย่อให้การ์ดในหน้าแรก
    if (needsThumbnail) {
      savedRevision.current = -1;
      schedule();
    }

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', beforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [needsThumbnail]);

  const retry = () => {
    setStatus('pending');
    useEditor.setState((s) => ({ revision: s.revision + 1 }));
  };

  return { status, retry };
}
