'use client';

import { RefreshCw, UsersRound, X } from 'lucide-react';
import { useEffect } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { FormField, cx, inputClass } from '@/components/csmju/primitives';
import { connectPresence, peerName, sendSelection, usePresence, type Peer } from '@/lib/editor/presence';
import { useEditor } from '@/lib/editor/store';

/// ส่วนหน้าจอของผู้ร่วมงานแบบสด: วงกลมผู้ร่วมงานบนแถบบน · แถบ "มีคนบันทึกงานแล้ว" · hook เชื่อมต่อ

/// เชื่อมต่อเมื่อเปิดงาน (ปิดได้ในเมนูผู้ร่วมงาน) และส่งชิ้นที่เราเลือกให้คนอื่นเห็น
export function useLivePresence() {
  const designId = useEditor((s) => s.designId);
  const enabled = usePresence((s) => s.enabled);

  useEffect(() => {
    if (!designId || !enabled) return;

    const stop = connectPresence(designId);
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.selection !== prev.selection) sendSelection(state.selection);
    });

    return () => {
      unsubscribe();
      stop();
    };
  }, [designId, enabled]);
}

function initial(p: Peer): string {
  const source = p.nickname || (p.label.startsWith('เจ้าของ') ? 'จ' : p.label.split('#')[1] ?? '?');

  return Array.from(source)[0]?.toUpperCase() ?? '?';
}

function Dot({ peer, size = 'sm' }: { peer: Peer; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-on-inverse ring-2 ring-surface', size === 'sm' ? 'size-8 text-csmju-caption' : 'size-9 text-csmju-body')}
      style={{ background: peer.color }}
    >
      {initial(peer)}
    </span>
  );
}

export function PresenceAvatars() {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('end');
  const status = usePresence((s) => s.status);
  const peers = usePresence((s) => s.peers);
  const self = usePresence((s) => s.self);
  const enabled = usePresence((s) => s.enabled);
  const websocket = usePresence((s) => s.websocket);
  const error = usePresence((s) => s.error);
  const nickname = usePresence((s) => s.nickname);
  const list = Object.values(peers);
  const shown = list.slice(0, 3);
  const statusText = !enabled
    ? 'ปิดอยู่'
    : status === 'live'
      ? websocket
        ? 'สด (WebSocket)'
        : 'สด (ผ่าน HTTP)'
      : status === 'connecting'
        ? 'กำลังเชื่อมต่อ…'
        : (error ?? 'เชื่อมต่อไม่ได้');

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`ผู้ร่วมงานแบบสด: ${list.length ? `${list.length} คนกำลังเปิดงานนี้` : 'ยังไม่มีใคร'} · ${statusText}`}
        title={`ผู้ร่วมงานแบบสด · ${statusText}`}
        className="relative inline-flex min-h-10 items-center rounded-full px-1 hover:bg-surface/20"
      >
        {shown.length ? (
          <span className="flex -space-x-2">
            {shown.map((p) => (
              <Dot key={p.peerId} peer={p} />
            ))}
            {list.length > shown.length && <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface text-csmju-caption font-bold text-ink ring-2 ring-surface">+{list.length - shown.length}</span>}
          </span>
        ) : (
          <UsersRound aria-hidden className="size-5" />
        )}
        <span aria-hidden className={cx('absolute right-0.5 bottom-1 size-2.5 rounded-full ring-2 ring-surface', enabled && status === 'live' ? 'bg-success' : enabled && status === 'connecting' ? 'bg-warning' : 'bg-muted')} />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label="ผู้ร่วมงานแบบสด" className="w-80 rounded-2xl border border-line bg-surface p-4 text-ink shadow-csmju-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-csmju-body font-bold">ผู้ร่วมงานแบบสด</h2>
          <span className="text-csmju-caption text-muted">{statusText}</span>
        </div>
        {enabled && status === 'live' && (
          <ul className="mb-4 flex flex-col gap-2">
            {self && (
              <li className="flex items-center gap-2 text-csmju-caption">
                <Dot peer={self} size="md" />
                <span className="min-w-0 flex-1 truncate">{peerName(self)} · คุณ</span>
              </li>
            )}
            {list.length === 0 ? (
              <li className="text-csmju-caption text-muted">ยังไม่มีคนอื่นเปิดงานนี้ · แชร์ลิงก์แบบแก้ไขได้เพื่อทำงานด้วยกัน</li>
            ) : (
              list.map((p) => (
                <li key={p.peerId} className="flex items-center gap-2 text-csmju-caption">
                  <Dot peer={p} size="md" />
                  <span className="min-w-0 flex-1 truncate">{peerName(p)}</span>
                  <span className="shrink-0 text-muted">{p.canEdit ? 'แก้ไขได้' : 'ดู'}</span>
                </li>
              ))
            )}
          </ul>
        )}
        <FormField label="ชื่อเล่นที่ผู้อื่นเห็น" hint="เก็บในเครื่องนี้เท่านั้น · ไม่ใส่ = ใช้ป้ายแบบไม่ระบุตัวตน">
          {(f) => <input {...f} value={nickname} maxLength={30} onChange={(e) => usePresence.getState().setNickname(e.target.value)} placeholder="เช่น พีท" className={inputClass} />}
        </FormField>
        <label className="mt-3 flex min-h-10 items-center justify-between gap-3 text-csmju-caption">
          แสดงและแชร์เคอร์เซอร์แบบสด
          <input type="checkbox" role="switch" checked={enabled} onChange={(e) => usePresence.getState().setEnabled(e.target.checked)} className="size-5 accent-primary" />
        </label>
      </FloatingPanel>
    </>
  );
}

/// มีคนบันทึกงานนี้ระหว่างที่เราเปิดอยู่ — เสนอให้โหลดเวอร์ชันล่าสุด (ถ้ามีงานที่เรายังไม่บันทึก เบราว์เซอร์จะถามก่อน)
export function SavedBanner() {
  const savedBy = usePresence((s) => s.savedBy);

  if (!savedBy) return null;

  return (
    <div role="status" className="csmju-fade-in fixed top-20 left-1/2 z-40 flex max-w-full -translate-x-1/2 items-center gap-2 rounded-full bg-inverse py-1.5 pr-1.5 pl-4 text-csmju-caption text-on-inverse shadow-csmju-lg">
      <span className="min-w-0 truncate">{peerName(savedBy)} บันทึกงานแล้ว</span>
      <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-surface/15 px-3 font-semibold hover:bg-surface/25">
        <RefreshCw aria-hidden className="size-4" /> โหลดล่าสุด
      </button>
      <button type="button" onClick={() => usePresence.getState().dismissSaved()} aria-label="ปิด" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface/15">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
