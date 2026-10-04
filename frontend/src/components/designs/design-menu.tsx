'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Ellipsis, ExternalLink, FolderInput, Info, LayoutTemplate, Link2, PenLine, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/csmju/api';
import { useMe } from '@/lib/csmju/session';
import { useCreateDesign } from '@/lib/create-design';
import { TEMPLATE_CATEGORIES } from '@/lib/design-types';
import { exportPages } from '@/lib/editor/export';
import { normalizeDocument } from '@/lib/editor/types';
import type { Design, DesignSummary, Folder } from '@/lib/types';
import { FloatingPanel, useAnchoredMenu } from '../csmju/floating';
import { Button, Dialog, FormField, cx, errorMessage, inputClass, useToast } from '../csmju/primitives';
import { DetailsPanel, ShareDialog, copyDesignLink } from './design-actions';

/// เมนู "…" บนการ์ดดีไซน์แบบ Canva (ภาพบรีฟ "Home แบบใหม่ 1")
///
/// หัวเมนูมีชื่องาน + ปุ่มดินสอเปลี่ยนชื่อ · รายการที่ระบบนี้ไม่มีจริง (พิมพ์ผ่านร้าน · โหมดออฟไลน์)
/// ไม่แสดง เพื่อไม่ให้มีปุ่มที่กดแล้วไม่ทำอะไร
export function DesignMenu({ design }: { design: DesignSummary }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu();
  const [dialog, setDialog] = useState<'rename' | 'folder' | 'details' | 'share' | 'publish' | null>(null);
  const create = useCreateDesign();
  const isOwner = design.access === 'OWNER';
  const canPublish = me.subsystemRole === 'EDITOR' || me.subsystemRole === 'ADMIN';


  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<DesignSummary>(`/designs/${design.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      setDialog(null);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const download = async () => {
    try {
      const full = await api.get<Design>(`/designs/${design.id}`);
      const doc = normalizeDocument(full.document);

      await exportPages(doc, { width: full.width, height: full.height }, full.title, {
        format: 'png',
        scale: 1,
        transparent: false,
        quality: 0.92,
        pageIndexes: doc.pages.map((_, i) => i),
      });
      toast(`ดาวน์โหลด “${full.title}” แล้ว`);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const item = 'flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted';

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        aria-label={`ตัวเลือกของ ${design.title}`}
        title="ตัวเลือก"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cx('inline-flex size-9 items-center justify-center rounded-lg text-on-inverse shadow-csmju-sm', open ? 'bg-primary' : 'bg-primary/90 hover:bg-primary')}
      >
        <Ellipsis aria-hidden className="size-5" />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label={`ตัวเลือกของ ${design.title}`} className="max-h-popover w-72 overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-csmju-lg">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="truncate text-csmju-body font-semibold text-ink">{design.title}</p>
              {isOwner && (
                <button type="button" aria-label="เปลี่ยนชื่อ" title="เปลี่ยนชื่อ" onClick={run(() => setDialog('rename'))} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
                  <PenLine aria-hidden className="size-4" />
                </button>
              )}
            </div>
            <p className="text-csmju-caption text-muted">
              {isOwner ? `โดย ${me.email.split('@')[0]}` : 'แชร์ด้วยลิงก์'} • {design.linkAccess === 'NONE' ? 'เฉพาะคุณ' : 'ทุกคนที่มีลิงก์'}
            </p>
          </div>
          <div className="py-1">
            <button type="button" role="menuitem" className={item} onClick={run(() => window.open(`/design/${design.id}`, '_blank', 'noopener'))}>
              <ExternalLink aria-hidden className="size-5" /> เปิดในแท็บใหม่
            </button>
            <button type="button" role="menuitem" className={item} onClick={run(() => setDialog('details'))}>
              <Info aria-hidden className="size-5" /> รายละเอียด
            </button>
            {canPublish && (
              <button type="button" role="menuitem" className={item} onClick={run(() => setDialog('publish'))}>
                <LayoutTemplate aria-hidden className="size-5" /> บันทึกเป็นเทมเพลต
              </button>
            )}
          </div>
          <div className="border-t border-line py-1">
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={run(() =>
                create.mutate({ title: `สำเนาของ ${design.title}`.slice(0, 120), copyFromDesignId: design.id }, { onError: (error) => toast(errorMessage(error), 'error') }),
              )}
            >
              <Copy aria-hidden className="size-5" /> ทำสำเนา
            </button>
            <button type="button" role="menuitem" className={item} onClick={run(() => void download())}>
              <Download aria-hidden className="size-5" /> ดาวน์โหลด (PNG)
            </button>
          </div>
          {isOwner && (
            <div className="border-t border-line py-1">
              <button type="button" role="menuitem" className={item} onClick={run(() => setDialog('folder'))}>
                <FolderInput aria-hidden className="size-5" /> ย้ายโฟลเดอร์
              </button>
              <button type="button" role="menuitem" className={item} onClick={run(() => setDialog('share'))}>
                <UserPlus aria-hidden className="size-5" /> แชร์
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={run(() =>
                  void copyDesignLink(design.id)
                    .then(() => toast(design.linkAccess === 'NONE' ? 'คัดลอกลิงก์แล้ว — ตอนนี้เปิดได้เฉพาะคุณ (เปิดแชร์ได้ที่เมนูแชร์)' : 'คัดลอกลิงก์แล้ว'))
                    .catch(() => toast('คัดลอกไม่สำเร็จ', 'error')),
                )}
              >
                <Link2 aria-hidden className="size-5" /> คัดลอกลิงก์
              </button>
            </div>
          )}
          {isOwner && (
            <div className="border-t border-line py-1">
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={run(() => update.mutate({ trashed: true }, { onSuccess: () => toast(`ย้าย “${design.title}” ไปถังขยะแล้ว`) }))}
              >
                <Trash2 aria-hidden className="size-5" /> ย้ายไปที่ถังขยะ
              </button>
            </div>
          )}
      </FloatingPanel>
      {/* portal ไปที่ body — ตัวห่อเมนูบนการ์ดจางเป็น 0 ตอนเมาส์ไม่ได้ชี้ ถ้าไม่ย้ายออก แผงจะมองไม่เห็น */}
      {dialog &&
        createPortal(
          <>
            {dialog === 'rename' && <RenameDialog initial={design.title} busy={update.isPending} onClose={() => setDialog(null)} onSave={(title) => update.mutate({ title })} />}
            {dialog === 'folder' && <MoveToFolderDialog current={design.folderId} busy={update.isPending} onClose={() => setDialog(null)} onSave={(folderId) => update.mutate({ folderId })} />}
            {dialog === 'details' && <DetailsPanel design={design} onClose={() => setDialog(null)} onShare={() => setDialog('share')} />}
            {dialog === 'share' && <ShareDialog design={design} onClose={() => setDialog(null)} />}
            {dialog === 'publish' && <PublishFromDesignDialog design={design} onClose={() => setDialog(null)} />}
          </>,
          document.body,
        )}
    </div>
  );
}

/// บันทึกดีไซน์เป็นเทมเพลตจากหน้าแรก/โปรเจกต์ (อาจารย์ บุคลากร ผู้ดูแล)
function PublishFromDesignDialog({ design, onClose }: { design: DesignSummary; onClose: () => void }) {
  const [title, setTitle] = useState(design.title);
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0].key);
  const toast = useToast();
  const queryClient = useQueryClient();
  const publish = useMutation({
    mutationFn: async () => {
      const full = await api.get<Design>(`/designs/${design.id}`);

      return api.post('/templates', {
        title: title.trim(),
        designType: full.designType,
        category,
        width: full.width,
        height: full.height,
        document: full.document,
        ...(full.thumbnail ? { thumbnail: full.thumbnail } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast('บันทึกเป็นเทมเพลตแล้ว ทุกคนในระบบเห็นและใช้ได้');
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="บันทึกเป็นเทมเพลต"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={!title.trim()} loading={publish.isPending} onClick={() => publish.mutate()}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="ชื่อเทมเพลต">
          {(props) => <input {...props} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />}
        </FormField>
        <FormField label="หมวดหมู่">
          {(props) => (
            <select {...props} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          )}
        </FormField>
      </div>
    </Dialog>
  );
}

export function RenameDialog({
  initial,
  busy,
  onClose,
  onSave,
  title = 'เปลี่ยนชื่องาน',
}: {
  initial: string;
  busy: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
  title?: string;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={!trimmed} loading={busy} onClick={() => onSave(trimmed)}>
            บันทึก
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onSave(trimmed);
        }}
      >
        <FormField label="ชื่อ" error={trimmed ? null : 'ชื่อต้องไม่ว่าง'}>
          {(props) => (
            <input {...props} autoFocus maxLength={120} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
          )}
        </FormField>
      </form>
    </Dialog>
  );
}

function MoveToFolderDialog({
  current,
  busy,
  onClose,
  onSave,
}: {
  current: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: (folderId: string | null) => void;
}) {
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.list<Folder>('/folders?limit=100') });
  const [picked, setPicked] = useState<string>(current ?? '');

  return (
    <Dialog
      open
      onClose={onClose}
      title="ย้ายไปโฟลเดอร์"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(picked || null)}>
            ย้าย
          </Button>
        </>
      }
    >
      {folders.isLoading ? (
        <p className="text-csmju-caption text-muted">กำลังโหลดโฟลเดอร์…</p>
      ) : (
        <FormField label="โฟลเดอร์" hint="สร้างโฟลเดอร์ใหม่ได้ที่หน้าโปรเจกต์">
          {(props) => (
            <select {...props} value={picked} onChange={(e) => setPicked(e.target.value)} className={inputClass}>
              <option value="">ไม่อยู่ในโฟลเดอร์</option>
              {folders.data?.items.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}
    </Dialog>
  );
}
