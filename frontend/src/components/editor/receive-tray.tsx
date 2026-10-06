'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShieldAlert, X } from 'lucide-react';
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { cx, useToast } from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { IMAGE_SOURCES, needsPermission, sourceUrl, useSourceIntent, type ImageSourceSite, type KnownSite } from '@/lib/editor/image-sources';
import { insertImported } from '@/lib/editor/insert-asset';
import { canEditDoc, useEditor } from '@/lib/editor/store';
import type { Asset } from '@/lib/types';
import { ReceiveDropZone, useReceiveImport, useReceiveStatus } from './receive-import';

/// "ถาดรับภาพ": หน้าต่าง CS Canvas เล็ก ๆ ที่ลอยอยู่เหนือทุกหน้าต่าง (Document Picture-in-Picture · Chrome/Edge 116+)
///
/// PL อยากให้เปิดแหล่งภาพ "ข้างใน CS Canvas" แต่เว็บอย่าง Pinterest ห้ามฝัง (iframe) — จึงเปิดเว็บนั้นในแท็บปกติ
/// แล้วลอยถาดนี้ไว้ด้านบน ผู้ใช้ลากภาพหรือกด Ctrl+V ในถาด ภาพก็เข้าไปในงานที่เปิดอยู่ทันที
/// เบราว์เซอร์ที่ไม่มี API นี้ได้หน้าต่างป๊อปอัปเล็กที่มีถาดเดียวกัน (แต่ไม่ลอยเหนือหน้าต่างอื่น)
///
/// ไม่ฝัง ไม่ดึงหน้าเว็บอื่น และไม่ส่งข้อมูลไปเว็บอื่น — ถาดใช้ตรรกะนำเข้าเดียวกับการวางบนหน้าแก้ไข

const TRAY_WINDOW_NAME = 'csmju-canvas-receive-tray';
const TRAY_SIZE = { width: 360, height: 520 };

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

interface TrayState {
  win: Window | null;
  container: HTMLElement | null;
  /// true = ลอยเหนือทุกหน้าต่าง (PiP) · false = ป๊อปอัปธรรมดา
  pip: boolean;
  site: KnownSite | null;
}

export const useReceiveTray = create<TrayState>(() => ({ win: null, container: null, pip: false, site: null }));

export function hasPictureInPicture(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

/// เตรียมเอกสารของถาด: คัดลอกสไตล์ของหน้าแก้ไข (URL เต็ม) แบบเดียวกับหน้าต่างผู้พรีเซนต์ แล้วล้างของค้าง
function setupTrayDocument(win: Window): HTMLElement {
  const doc = win.document;

  doc.title = 'ถาดรับภาพ · CS Canvas';
  doc.documentElement.lang = 'th';
  doc.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') ?? 'light');
  doc.head.querySelectorAll('[data-csc-clone]').forEach((node) => node.remove());

  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    const copy = node.cloneNode(true) as HTMLElement;

    if (node instanceof HTMLLinkElement) copy.setAttribute('href', node.href);
    copy.setAttribute('data-csc-clone', '');
    doc.head.appendChild(copy);
  }

  doc.body.className = `${document.body.className} bg-surface`;
  doc.body.replaceChildren();

  const root = doc.createElement('div');

  root.id = 'csc-receive-tray-root';
  doc.body.appendChild(root);

  return root;
}

function attach(win: Window, pip: boolean, site: KnownSite | null) {
  const container = setupTrayDocument(win);
  const onClosed = () => {
    if (useReceiveTray.getState().win === win) useReceiveTray.setState({ win: null, container: null });
    window.removeEventListener('pagehide', onLeave);
  };
  const onLeave = () => win.close();

  win.addEventListener('pagehide', onClosed);
  win.addEventListener('beforeunload', onClosed);
  window.addEventListener('pagehide', onLeave);
  useReceiveTray.setState({ win, container, pip, site });
}

function openPopupTray(site: KnownSite | null): boolean {
  const left = Math.max(0, (window.screenX ?? 0) + window.outerWidth - TRAY_SIZE.width - 40);
  const top = Math.max(0, (window.screenY ?? 0) + 120);
  const win = window.open('', TRAY_WINDOW_NAME, `popup=yes,width=${TRAY_SIZE.width},height=${TRAY_SIZE.height},left=${left},top=${top}`);

  if (!win) return false;

  attach(win, false, site);
  win.focus();

  return true;
}

/// เปิดถาดรับภาพ — ต้องเรียกตรงในตัวจัดการคลิก (เบราว์เซอร์ยอมเปิดหน้าต่างเมื่อผู้ใช้กดเท่านั้น)
/// onBlocked = เปิดไม่ได้ (ถูกบล็อกป๊อปอัป) ให้ผู้เรียกแจ้งผู้ใช้
export function openReceiveTray(site: KnownSite | null, onBlocked: (message: string) => void) {
  const current = useReceiveTray.getState();

  if (site) useSourceIntent.getState().remember(site);

  if (current.win && !current.win.closed) {
    useReceiveTray.setState({ site: site ?? current.site });
    current.win.focus();
    return;
  }

  const blocked = 'เบราว์เซอร์บล็อกหน้าต่างถาดรับภาพ — อนุญาตป๊อปอัปสำหรับ CS Canvas แล้วลองอีกครั้ง';
  const dpip = (window as Window & { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;

  if (dpip) {
    dpip
      .requestWindow(TRAY_SIZE)
      .then((win) => attach(win, true, site))
      .catch(() => {
        if (!openPopupTray(site)) onBlocked(blocked);
      });
    return;
  }

  if (!openPopupTray(site)) onBlocked(blocked);
}

/// ลิงก์ "เปิดแหล่งภาพในแท็บใหม่ + ถาดรับภาพ" · เป็นลิงก์จริง (เบราว์เซอร์ไม่บล็อกการเปิดแท็บ) และเปิดถาดในคลิกเดียวกัน
export function TrayLink({ source, q, className, children }: { source: ImageSourceSite; q: string; className?: string; children: ReactNode }) {
  const toast = useToast();

  return (
    <a
      href={sourceUrl(source, q)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => openReceiveTray(source.key, (message) => toast(message, 'error'))}
      className={className}
    >
      {children}
    </a>
  );
}

/// บรรทัดอธิบายวิธีใช้ถาดรับภาพ (หนึ่งบรรทัดตามที่ PL ขอ)
export function trayHint(): string {
  return hasPictureInPicture()
    ? 'ถาดรับภาพจะลอยเหนือทุกหน้าต่าง: เปิดเว็บในแท็บใหม่แล้วลากภาพหรือกด Ctrl+V ในถาด ภาพเข้างานนี้ทันที'
    : 'ถาดรับภาพเปิดเป็นหน้าต่างเล็กข้างจอ (เบราว์เซอร์นี้ลอยเหนือทุกหน้าต่างไม่ได้ — Chrome/Edge ทำได้): ลากภาพหรือกด Ctrl+V ในถาด ภาพเข้างานนี้ทันที';
}

export function closeReceiveTray() {
  const win = useReceiveTray.getState().win;

  if (win && !win.closed) win.close();
  useReceiveTray.setState({ win: null, container: null });
}

/// แสดงเนื้อหาของถาดในหน้าต่างของมัน (portal อยู่ใน React tree เดียวกับหน้าแก้ไข จึงใช้ store ของงานได้ตรง ๆ)
export function ReceiveTrayPortal() {
  const win = useReceiveTray((s) => s.win);
  const container = useReceiveTray((s) => s.container);

  if (!win || !container) return null;

  return createPortal(<TrayContent win={win} />, container);
}

const RECENT_LIMIT = 6;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;

  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
}

function TrayContent({ win }: { win: Window }) {
  const pip = useReceiveTray((s) => s.pip);
  const site = useReceiveTray((s) => s.site);
  const title = useEditor((s) => s.title);
  const pageNumber = useEditor((s) => s.pageIndex + 1);
  const editable = useEditor((s) => canEditDoc(s));
  const { fromTransfer, fromClipboard } = useReceiveImport();
  const { busy, result, run } = useReceiveStatus();
  const [over, setOver] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);
  const source = IMAGE_SOURCES.find((s) => s.key === site) ?? null;
  // ภาพล่าสุดที่เข้าคลังของฉัน (การนำเข้าสั่งรีเฟรชคิวรี ['assets'] เองอยู่แล้ว)
  const recent = useQuery({
    queryKey: ['assets', 'tray-recent'],
    queryFn: () => api.list<Asset>(`/assets${qs({ kind: 'image', limit: RECENT_LIMIT })}`),
  });

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    if (isTyping(event.target)) return;
    event.preventDefault();
    void run(() => fromTransfer(event.clipboardData));
  });
  const onDrop = useEffectEvent((event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void run(() => fromTransfer(event.dataTransfer));
  });

  // ถาดเป็นหน้าต่างแยก — ฟัง Ctrl+V และการลากวางที่หน้าต่างของถาดเอง (ไม่ใช่ของหน้าแก้ไข)
  useEffect(() => {
    const paste = (event: ClipboardEvent) => onPaste(event);
    const dragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setOver(true);
    };
    const dragLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setOver(false);
    };
    const drop = (event: DragEvent) => onDrop(event);

    win.addEventListener('paste', paste);
    win.addEventListener('dragover', dragOver);
    win.addEventListener('dragleave', dragLeave);
    win.addEventListener('drop', drop);

    return () => {
      win.removeEventListener('paste', paste);
      win.removeEventListener('dragover', dragOver);
      win.removeEventListener('dragleave', dragLeave);
      win.removeEventListener('drop', drop);
    };
  }, [win]);

  const reinsert = async (asset: Asset) => {
    setInsertError(null);

    if (!canEditDoc(useEditor.getState())) {
      setInsertError('งานนี้เปิดแบบดูหรือแสดงความคิดเห็นได้อย่างเดียว');
      return;
    }

    try {
      await insertImported(asset);
    } catch {
      setInsertError('เปิดรูปนี้ไม่ได้ อาจถูกลบไปแล้ว');
    }
  };

  return (
    <div className="flex min-h-dvh flex-col gap-3 bg-surface p-3 text-body">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-csmju-body font-bold text-ink">ถาดรับภาพ</h1>
          <p className="truncate text-csmju-caption text-muted">
            ใส่ลงหน้า {pageNumber} ของ “{title || 'งานไม่มีชื่อ'}”
          </p>
        </div>
        <button
          type="button"
          onClick={closeReceiveTray}
          aria-label="ปิดถาดรับภาพ"
          title="ปิดถาดรับภาพ"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-surface-muted"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <p className="text-csmju-caption text-body">
        {pip ? 'ถาดนี้ลอยอยู่เหนือทุกหน้าต่าง' : 'วางหน้าต่างนี้ไว้ข้างเว็บที่เปิดอยู่'} — คัดลอกหรือลากภาพจากเว็บมาวางในถาด ภาพจะเข้าไปในงานที่เปิดอยู่ทันที
      </p>

      {!editable ? (
        <p role="alert" className="rounded-xl bg-warning-bg px-3 py-2 text-csmju-caption text-warning">งานนี้เปิดแบบดูหรือแสดงความคิดเห็นได้อย่างเดียว ใส่ภาพไม่ได้</p>
      ) : (
        <ReceiveDropZone interactive={false} over={over} busy={busy} result={result} onClipboard={() => void run(fromClipboard)} />
      )}

      {source && (
        <div className="flex flex-col gap-1">
          {needsPermission(source.key) && (
            <p className="flex gap-1.5 rounded-lg bg-warning-bg px-2 py-1 text-csmju-caption text-warning">
              <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{source.licence}</span>
            </p>
          )}
          <a
            href={sourceUrl(source, '')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
          >
            <ExternalLink aria-hidden className="size-4" /> เปิด {source.name} อีกแท็บ
          </a>
        </div>
      )}

      <section aria-label="ภาพล่าสุดในคลังของฉัน" className="flex flex-col gap-2">
        <h2 className="text-csmju-caption font-bold text-ink">ภาพล่าสุด · กดเพื่อใส่ลงหน้าอีกครั้ง</h2>
        {recent.isLoading ? (
          <p className="text-csmju-caption text-muted">กำลังโหลด…</p>
        ) : recent.isError ? (
          <button type="button" onClick={() => void recent.refetch()} className="min-h-11 rounded-xl border border-line-strong px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
            โหลดภาพล่าสุดไม่ได้ · ลองอีกครั้ง
          </button>
        ) : recent.data!.items.length === 0 ? (
          <p className="text-csmju-caption text-muted">ยังไม่มีภาพ — ภาพที่วางในถาดจะขึ้นที่นี่</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {recent.data!.items.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => void reinsert(asset)}
                  aria-label={`ใส่ ${asset.fileName} ลงหน้าอีกครั้ง`}
                  title={asset.fileName}
                  className={cx('csmju-checker block aspect-square w-full overflow-hidden rounded-xl border border-line hover:shadow-csmju-md disabled:opacity-60')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- รูปผ่าน API ที่ต้องมี session · URL เต็มเพราะอยู่ในหน้าต่างแยก */}
                  <img src={`${window.location.origin}${asset.contentUrl}`} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {insertError && <p role="alert" className="text-csmju-caption text-danger">{insertError}</p>}
      </section>
    </div>
  );
}
