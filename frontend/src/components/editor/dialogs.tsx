'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Dialog, FormField, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { TEMPLATE_CATEGORIES } from '@/lib/design-types';
import { thumbnailOf } from '@/lib/editor/export';
import { useEditor } from '@/lib/editor/store';
import type { Template } from '@/lib/types';

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
      const thumbnail = await thumbnailOf(state.doc.pages[0], { width: state.baseWidth, height: state.baseHeight });

      return api.post<Template>('/templates', {
        title: name.trim(),
        description: description.trim(),
        designType: state.designType,
        category,
        width: state.baseWidth,
        height: state.baseHeight,
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
