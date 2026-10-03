'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Ellipsis, FolderInput, PenLine, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/csmju/api';
import { useCreateDesign } from '@/lib/create-design';
import type { DesignSummary, Folder } from '@/lib/types';
import { Button, Dialog, FormField, Menu, errorMessage, inputClass, useToast } from '../csmju/primitives';

/// เมนู "…" บนการ์ดงาน: เปลี่ยนชื่อ · ทำสำเนา · ย้ายโฟลเดอร์ · ย้ายไปถังขยะ
export function DesignMenu({ design }: { design: DesignSummary }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<'rename' | 'folder' | null>(null);
  const create = useCreateDesign();

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

  return (
    <>
      <Menu
        label={`ตัวเลือกของ ${design.title}`}
        trigger={<Ellipsis aria-hidden className="size-5" />}
        items={[
          { label: 'เปลี่ยนชื่อ', icon: <PenLine aria-hidden className="size-4" />, onSelect: () => setDialog('rename') },
          {
            label: 'ทำสำเนา',
            icon: <Copy aria-hidden className="size-4" />,
            onSelect: () =>
              create.mutate(
                { title: `สำเนาของ ${design.title}`.slice(0, 120), copyFromDesignId: design.id },
                { onError: (error) => toast(errorMessage(error), 'error') },
              ),
          },
          { label: 'ย้ายไปโฟลเดอร์', icon: <FolderInput aria-hidden className="size-4" />, onSelect: () => setDialog('folder') },
          {
            label: 'ย้ายไปถังขยะ',
            icon: <Trash2 aria-hidden className="size-4" />,
            danger: true,
            onSelect: () =>
              update.mutate({ trashed: true }, { onSuccess: () => toast(`ย้าย “${design.title}” ไปถังขยะแล้ว`) }),
          },
        ]}
      />
      {dialog === 'rename' && (
        <RenameDialog
          initial={design.title}
          busy={update.isPending}
          onClose={() => setDialog(null)}
          onSave={(title) => update.mutate({ title })}
        />
      )}
      {dialog === 'folder' && (
        <MoveToFolderDialog
          current={design.folderId}
          busy={update.isPending}
          onClose={() => setDialog(null)}
          onSave={(folderId) => update.mutate({ folderId })}
        />
      )}
    </>
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
