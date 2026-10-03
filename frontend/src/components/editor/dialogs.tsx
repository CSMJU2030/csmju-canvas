'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Dialog, FormField, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { TEMPLATE_CATEGORIES } from '@/lib/design-types';
import { exportPages, thumbnailOf, type ExportFormat } from '@/lib/editor/export';
import { useEditor } from '@/lib/editor/store';
import type { Template } from '@/lib/types';

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(0.92);
  const [which, setWhich] = useState<'current' | 'all'>('current');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const pageCount = useEditor((s) => s.doc.pages.length);
  const tooBig = width * scale * height * scale > 16_000 * 16_000 || Math.max(width, height) * scale > 16_000;

  const run = async () => {
    const state = useEditor.getState();
    const pageIndexes = which === 'all' ? state.doc.pages.map((_, i) => i) : [state.pageIndex];

    setBusy(true);

    try {
      const count = await exportPages(state.doc, { width: state.width, height: state.height }, state.title, {
        format,
        scale,
        transparent,
        quality,
        pageIndexes,
      });

      toast(`ดาวน์โหลด ${count} ไฟล์แล้ว`);
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ดาวน์โหลด"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" loading={busy} disabled={tooBig} onClick={() => void run()}>
            ดาวน์โหลด
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="ชนิดไฟล์">
          {(props) => (
            <select {...props} value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} className={inputClass}>
              <option value="png">PNG — คมชัด รองรับพื้นหลังโปร่งใส</option>
              <option value="jpeg">JPEG — ไฟล์เล็ก เหมาะกับรูปถ่าย</option>
            </select>
          )}
        </FormField>
        <FormField label="ขนาด" hint={`${Math.round(width * scale)} × ${Math.round(height * scale)} พิกเซล`} error={tooBig ? 'ใหญ่เกินกว่าที่เบราว์เซอร์สร้างได้ ลดขนาดลง' : null}>
          {(props) => (
            <select {...props} value={scale} onChange={(e) => setScale(Number(e.target.value))} className={inputClass}>
              <option value={0.5}>0.5×</option>
              <option value={1}>1× (ขนาดจริง)</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          )}
        </FormField>
        {format === 'png' ? (
          <label className="flex min-h-11 items-center gap-3 text-csmju-body text-ink">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="size-5 accent-primary" />
            พื้นหลังโปร่งใส (ไม่ใส่สีพื้นหลังของหน้า)
          </label>
        ) : (
          <FormField label={`คุณภาพ ${Math.round(quality * 100)}%`}>
            {(props) => (
              <input {...props} type="range" min={0.5} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="accent-primary" />
            )}
          </FormField>
        )}
        {pageCount > 1 && (
          <FormField label="หน้า">
            {(props) => (
              <select {...props} value={which} onChange={(e) => setWhich(e.target.value as 'current' | 'all')} className={inputClass}>
                <option value="current">หน้าปัจจุบัน</option>
                <option value="all">ทุกหน้า ({pageCount} ไฟล์)</option>
              </select>
            )}
          </FormField>
        )}
        <p className="text-csmju-caption text-muted">สร้างไฟล์ในเบราว์เซอร์ของคุณทั้งหมด ไม่มีการส่งรูปออกไปที่ใด</p>
      </div>
    </Dialog>
  );
}

export function PublishTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const title = useEditor((s) => s.title);
  const [name, setName] = useState(title);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0].key);
  const toast = useToast();
  const queryClient = useQueryClient();

  const publish = useMutation({
    mutationFn: async () => {
      const state = useEditor.getState();
      const thumbnail = await thumbnailOf(state.doc.pages[0], { width: state.width, height: state.height });

      return api.post<Template>('/templates', {
        title: name.trim(),
        description: description.trim(),
        designType: state.designType,
        category,
        width: state.width,
        height: state.height,
        document: state.doc,
        thumbnail,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast('เผยแพร่เป็นเทมเพลตแล้ว ทุกคนในระบบเห็นและใช้ได้');
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เผยแพร่เป็นเทมเพลต"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={!name.trim()} loading={publish.isPending} onClick={() => publish.mutate()}>
            เผยแพร่
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-csmju-caption text-muted">
          ระบบจะเก็บสำเนาของงานนี้ ณ ตอนนี้เป็นเทมเพลต การแก้งานต่อจากนี้ไม่เปลี่ยนเทมเพลต · รูปที่อัปโหลดในงานจะแสดงได้เฉพาะเจ้าของรูป
        </p>
        <FormField label="ชื่อเทมเพลต" error={name.trim() ? null : 'กรุณาตั้งชื่อ'}>
          {(props) => <input {...props} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />}
        </FormField>
        <FormField label="คำอธิบาย" hint="ไม่บังคับ · ไม่เกิน 300 ตัวอักษร">
          {(props) => <textarea {...props} rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />}
        </FormField>
        <FormField label="หมวดหมู่">
          {(props) => (
            <select {...props} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
    </Dialog>
  );
}
